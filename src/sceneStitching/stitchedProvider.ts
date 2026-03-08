import * as vscode from 'vscode';
import { getChapterContextPath, getStitchedSceneHeadingMode, type StitchedSceneHeadingMode } from '../config';
import { getManuscript } from './sceneList';
import { buildSceneHeadingLine, buildSceneHeadingText } from './sceneHeading';

const SCHEME = 'noveltools';
const AUTHORITY = 'stitched';
const MANUSCRIPT_PATH = 'manuscript';

const CHAPTER_PATH_PREFIX = 'chapter/';

interface StitchedScene {
  index: number;
  heading: string;
  source: string;
  body: string;
  wordCount: number;
  unreadable: boolean;
}

interface StitchedChapter {
  index: number;
  heading: string;
  scenes: StitchedScene[];
}

/** URI for the full stitched manuscript. */
export function getStitchedManuscriptUri(): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${MANUSCRIPT_PATH}`);
}

/** URI for a single chapter's stitched content. */
export function getStitchedChapterUri(chapterIndex: number): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${CHAPTER_PATH_PREFIX}${chapterIndex}`);
}

function parseChapterIndexFromUri(uri: vscode.Uri): number | null {
  const uriPath = uri.path.replace(/^\/+/, '');
  if (!uriPath.startsWith(CHAPTER_PATH_PREFIX)) return null;
  const indexStr = uriPath.slice(CHAPTER_PATH_PREFIX.length);
  const index = parseInt(indexStr, 10);
  if (!Number.isInteger(index) || index < 0) return null;
  return index;
}

export function registerStitchedProvider(context: vscode.ExtensionContext): void {
  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(
      uri: vscode.Uri,
      _token: vscode.CancellationToken
    ): vscode.ProviderResult<string> {
      const chapterIndex = parseChapterIndexFromUri(uri);
      if (chapterIndex !== null) {
        return buildStitchedChapterContent(chapterIndex);
      }
      return buildStitchedContent();
    }
  })();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openStitchedManuscript', async () => {
      const uri = getStitchedManuscriptUri();
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openStitchedChapter', async (nodeOrItem?: unknown) => {
      const chapterIndex = await resolveChapterIndex(nodeOrItem);
      if (chapterIndex === null) return;
      const uri = getStitchedChapterUri(chapterIndex);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setChapterAsContext', async (nodeOrItem?: unknown) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        await vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      const chapterIndex = await resolveChapterIndex(nodeOrItem);
      if (chapterIndex === null) return;
      const content = await buildStitchedChapterContent(chapterIndex);
      const relPath = getChapterContextPath().replace(/\\/g, '/');
      const segments = relPath.split('/').filter(Boolean);
      if (segments.length === 0) {
        await vscode.window.showErrorMessage('Invalid noveltools.chapterContextPath.');
        return;
      }
      const fileUri = vscode.Uri.joinPath(folder.uri, ...segments);
      if (segments.length > 1) {
        const parentUri = vscode.Uri.joinPath(folder.uri, ...segments.slice(0, -1));
        await vscode.workspace.fs.createDirectory(parentUri);
      }
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
      const { data } = await getManuscript();
      const ch = data?.chapters[chapterIndex];
      const chapterLabel = ch?.title ?? `Chapter ${chapterIndex + 1}`;
      await vscode.window.showTextDocument(fileUri, { preview: false, viewColumn: vscode.ViewColumn.One });
      await vscode.window.showInformationMessage(
        `"${chapterLabel}" written to ${relPath}. @-mention this file in chat for review, or add a Cursor rule that references it.`
      );
    })
  );
}

function countWords(text: string): number {
  const matches = text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu);
  return matches?.length ?? 0;
}

function formatSceneCount(count: number): string {
  return `${count} ${count === 1 ? 'scene' : 'scenes'}`;
}

function chapterHeading(title: string | undefined, chapterIndex: number): string {
  const fallback = `Chapter ${chapterIndex + 1}`;
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function renderStitchedHeader(title: string, chapterCount: number, sceneCount: number, wordCount: number): string {
  const generatedAt = new Date().toLocaleString();
  return [
    `# ${title}`,
    '',
    `> Stitched with NovelTools on ${generatedAt}.`,
    '',
    `**${chapterCount} chapters** · **${sceneCount} scenes** · **${wordCount.toLocaleString()} words**`,
    '',
  ].join('\n');
}

async function collectStitchedScenes(
  sceneUris: vscode.Uri[],
  headingMode: StitchedSceneHeadingMode
): Promise<StitchedScene[]> {
  const scenes: StitchedScene[] = [];
  for (let i = 0; i < sceneUris.length; i++) {
    const uri = sceneUris[i];
    const source = vscode.workspace.asRelativePath(uri);
    const heading = buildSceneHeadingText(uri, i, headingMode);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const body = doc.getText().trimEnd();
      scenes.push({
        index: i,
        heading,
        source,
        body,
        wordCount: countWords(body),
        unreadable: false,
      });
    } catch {
      scenes.push({
        index: i,
        heading,
        source,
        body: `> [!warning]\n> Could not read \`${source}\`.`,
        wordCount: 0,
        unreadable: true,
      });
    }
  }
  return scenes;
}

function renderChapterBlock(chapter: StitchedChapter): string {
  const out: string[] = [
    `## ${chapter.index + 1}. ${chapter.heading}`,
    '',
    `> ${formatSceneCount(chapter.scenes.length)}`,
    '',
  ];

  if (chapter.scenes.length === 0) {
    out.push('> _No scenes found in this chapter._', '', '---', '');
    return out.join('\n');
  }

  for (const scene of chapter.scenes) {
    out.push(buildSceneHeadingLine(chapter.index, scene.index, scene.heading));
    out.push('');
    out.push(
      scene.unreadable
        ? `*Source:* \`${scene.source}\``
        : `*Source:* \`${scene.source}\` · *${scene.wordCount.toLocaleString()} words*`
    );
    out.push('');
    out.push(scene.body);
    out.push('', '---', '');
  }

  return out.join('\n');
}

async function buildStitchedContent(): Promise<string> {
  const { data } = await getManuscript();
  if (!data || data.flatUris.length === 0) return 'No manuscript. Add a noveltools.json or scenes.';
  const headingMode = getStitchedSceneHeadingMode();
  const stitchedChapters: StitchedChapter[] = [];
  let totalWords = 0;
  let totalScenes = 0;

  for (let chapterIndex = 0; chapterIndex < data.chapters.length; chapterIndex++) {
    const ch = data.chapters[chapterIndex];
    const scenes = await collectStitchedScenes(ch.sceneUris, headingMode);
    stitchedChapters.push({
      index: chapterIndex,
      heading: chapterHeading(ch.title, chapterIndex),
      scenes,
    });
    totalScenes += scenes.length;
    totalWords += scenes.reduce((sum, s) => sum + s.wordCount, 0);
  }

  const title = data.title?.trim() || 'Untitled Manuscript';
  const parts: string[] = [renderStitchedHeader(title, stitchedChapters.length, totalScenes, totalWords)];

  parts.push('## Contents', '');
  for (const chapter of stitchedChapters) {
    parts.push(`- ${chapter.index + 1}. ${chapter.heading} (${formatSceneCount(chapter.scenes.length)})`);
  }
  parts.push('', '---', '');

  for (const chapter of stitchedChapters) {
    parts.push(renderChapterBlock(chapter));
  }
  return parts.join('\n').trimEnd();
}

/**
 * Resolve chapter index from a tree item (when invoked from Manuscript view context menu)
 * or show a quick pick and return the selected index. Returns null if cancelled or no chapters.
 */
export async function resolveChapterIndex(nodeOrItem?: unknown): Promise<number | null> {
  const item = nodeOrItem as vscode.TreeItem | undefined;
  if (item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'chapter') {
    const label = typeof (item as vscode.TreeItem).label === 'string'
      ? (item as vscode.TreeItem).label
      : undefined;
    if (label !== undefined) {
      const { data } = await getManuscript();
      if (data?.chapters) {
        const i = data.chapters.findIndex(
          (ch, idx) => (ch.title ?? `Chapter ${idx + 1}`) === label
        );
        if (i >= 0) return i;
      }
    }
  }
  const { data } = await getManuscript();
  if (!data || data.chapters.length === 0) {
    await vscode.window.showInformationMessage('No chapters in manuscript.');
    return null;
  }
  type Item = vscode.QuickPickItem & { chapterIndex: number };
  const items: Item[] = data.chapters.map((ch, i) => ({
    label: ch.title ?? `Chapter ${i + 1}`,
    description: `${ch.sceneUris.length} scene(s)`,
    chapterIndex: i,
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Open stitched chapter…' });
  return picked ? picked.chapterIndex : null;
}

/** Build stitched markdown for a single chapter (same format as full manuscript). */
export async function buildStitchedChapterContent(chapterIndex: number): Promise<string> {
  const { data } = await getManuscript();
  if (!data || data.chapters.length === 0) return 'No manuscript. Add a noveltools.json or scenes.';
  const ch = data.chapters[chapterIndex];
  if (!ch) return `Chapter ${chapterIndex + 1} not found.`;
  const heading = chapterHeading(ch.title, chapterIndex);
  const headingMode = getStitchedSceneHeadingMode();
  const scenes = await collectStitchedScenes(ch.sceneUris, headingMode);
  const totalWords = scenes.reduce((sum, s) => sum + s.wordCount, 0);
  const chapterData: StitchedChapter = {
    index: chapterIndex,
    heading,
    scenes,
  };
  return [
    renderStitchedHeader(heading, 1, scenes.length, totalWords),
    '---',
    '',
    renderChapterBlock(chapterData),
  ].join('\n').trimEnd();
}

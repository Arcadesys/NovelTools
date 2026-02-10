import * as vscode from 'vscode';
import { getChapterContextPath } from '../config';
import { getManuscript } from './sceneList';

const SCHEME = 'noveltools';
const AUTHORITY = 'stitched';
const MANUSCRIPT_PATH = 'manuscript';

const CHAPTER_PATH_PREFIX = 'chapter/';

/** URI for the full stitched manuscript. */
export function getStitchedManuscriptUri(): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${MANUSCRIPT_PATH}`);
}

/** URI for a single chapter's stitched content. */
export function getStitchedChapterUri(chapterIndex: number): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${CHAPTER_PATH_PREFIX}${chapterIndex}`);
}

function parseChapterIndexFromUri(uri: vscode.Uri): number | null {
  const path = uri.path.replace(/^\/+/, '');
  if (!path.startsWith(CHAPTER_PATH_PREFIX)) return null;
  const indexStr = path.slice(CHAPTER_PATH_PREFIX.length);
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

async function buildStitchedContent(): Promise<string> {
  const { data } = await getManuscript();
  if (!data || data.flatUris.length === 0) return 'No manuscript. Add a noveltools.yaml or scenes.';
  const parts: string[] = [];
  let chapterIndex = 0;
  for (const ch of data.chapters) {
    if (ch.title) {
      parts.push(`## ${ch.title}\n\n`);
    } else {
      chapterIndex++;
      parts.push(`## Chapter ${chapterIndex}\n\n`);
    }
    for (const uri of ch.sceneUris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        parts.push(doc.getText());
        parts.push('\n\n');
      } catch {
        parts.push(`<!-- ${uri.fsPath} (unreadable) -->\n\n`);
      }
    }
  }
  return parts.join('').trimEnd();
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
  if (!data || data.chapters.length === 0) return 'No manuscript. Add a noveltools.yaml or scenes.';
  const ch = data.chapters[chapterIndex];
  if (!ch) return `Chapter ${chapterIndex + 1} not found.`;
  const parts: string[] = [];
  if (ch.title) {
    parts.push(`## ${ch.title}\n\n`);
  } else {
    parts.push(`## Chapter ${chapterIndex + 1}\n\n`);
  }
  for (const uri of ch.sceneUris) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      parts.push(doc.getText());
      parts.push('\n\n');
    } catch {
      parts.push(`<!-- ${uri.fsPath} (unreadable) -->\n\n`);
    }
  }
  return parts.join('').trimEnd();
}

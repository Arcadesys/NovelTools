import * as path from 'path';
import * as vscode from 'vscode';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { type ManuscriptData, type SceneStatus, serializeToJson } from './projectData';

const VALID_STATUSES: SceneStatus[] = ['drafted', 'revision', 'review', 'done', 'spiked', 'cut'];
const DEFAULT_EXCLUDE: SceneStatus[] = ['spiked', 'cut'];

interface CompileProfile {
  name: string;
  excludeStatuses?: SceneStatus[];
  includeTitle?: boolean;
  sceneBreak?: string;
  chapterBreak?: 'pageBreak' | 'heading';
}

interface RawProjectWithProfiles {
  compileProfiles?: CompileProfile[];
  [key: string]: unknown;
}

function countWords(text: string): number {
  return text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu)?.length ?? 0;
}

function chapterHeading(title: string | undefined, index: number): string {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Chapter ${index + 1}`;
}

function shouldIncludeScene(scenePath: string, data: ManuscriptData, excludeStatuses: SceneStatus[]): boolean {
  const status = data.sceneStatus?.[scenePath];
  if (!status) return true;
  return !excludeStatuses.includes(status);
}

async function readSceneContent(uri: vscode.Uri): Promise<string | null> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText().trimEnd();
  } catch {
    return null;
  }
}

function buildTitlePage(data: ManuscriptData): string {
  const title = data.title?.trim() || 'Untitled Manuscript';
  return `# ${title}\n`;
}

async function compileManuscriptMarkdown(
  data: ManuscriptData,
  excludeStatuses: SceneStatus[],
  includeTitle: boolean,
  sceneBreak: string,
  chapterBreakStyle: 'pageBreak' | 'heading'
): Promise<string> {
  const parts: string[] = [];

  if (includeTitle) {
    parts.push(buildTitlePage(data));
    parts.push('');
  }

  for (let ci = 0; ci < data.chapters.length; ci++) {
    const ch = data.chapters[ci];
    const heading = chapterHeading(ch.title, ci);
    const sceneParts: string[] = [];

    for (let si = 0; si < ch.sceneUris.length; si++) {
      const scenePath = ch.scenePaths[si];
      if (!shouldIncludeScene(scenePath, data, excludeStatuses)) continue;
      const content = await readSceneContent(ch.sceneUris[si]);
      if (content === null) continue;
      sceneParts.push(content);
    }

    if (sceneParts.length === 0) continue;

    if (parts.length > 0 && chapterBreakStyle === 'pageBreak') {
      parts.push('<div style="page-break-before: always;"></div>', '');
    }

    parts.push(`## ${heading}`, '');
    parts.push(sceneParts.join(`\n\n${sceneBreak}\n\n`));
    parts.push('');
  }

  return parts.join('\n').trimEnd() + '\n';
}

async function loadProfiles(projectFileUri: vscode.Uri | null): Promise<CompileProfile[]> {
  if (!projectFileUri) return [];
  try {
    const bytes = await vscode.workspace.fs.readFile(projectFileUri);
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as RawProjectWithProfiles;
    return Array.isArray(raw.compileProfiles) ? raw.compileProfiles : [];
  } catch {
    return [];
  }
}

async function saveProfile(projectFileUri: vscode.Uri, profile: CompileProfile): Promise<void> {
  const bytes = await vscode.workspace.fs.readFile(projectFileUri);
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as RawProjectWithProfiles;
  if (!Array.isArray(raw.compileProfiles)) {
    raw.compileProfiles = [];
  }
  const idx = raw.compileProfiles.findIndex((p) => p.name === profile.name);
  if (idx >= 0) {
    raw.compileProfiles[idx] = profile;
  } else {
    raw.compileProfiles.push(profile);
  }
  await vscode.workspace.fs.writeFile(projectFileUri, Buffer.from(JSON.stringify(raw, null, 2), 'utf8'));
  clearManuscriptCache(projectFileUri);
}

async function deleteProfile(projectFileUri: vscode.Uri, profileName: string): Promise<void> {
  const bytes = await vscode.workspace.fs.readFile(projectFileUri);
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as RawProjectWithProfiles;
  if (!Array.isArray(raw.compileProfiles)) return;
  raw.compileProfiles = raw.compileProfiles.filter((p) => p.name !== profileName);
  if (raw.compileProfiles.length === 0) delete raw.compileProfiles;
  await vscode.workspace.fs.writeFile(projectFileUri, Buffer.from(JSON.stringify(raw, null, 2), 'utf8'));
  clearManuscriptCache(projectFileUri);
}

function profileToQuickPick(profile: CompileProfile): vscode.QuickPickItem & { profile: CompileProfile } {
  const excludeLabel = profile.excludeStatuses?.length
    ? `excludes: ${profile.excludeStatuses.join(', ')}`
    : 'no exclusions';
  return {
    label: profile.name,
    description: excludeLabel,
    profile,
  };
}

async function pickOrConfigureProfile(projectFileUri: vscode.Uri | null): Promise<CompileProfile | undefined> {
  const profiles = await loadProfiles(projectFileUri);

  type ProfileItem = vscode.QuickPickItem & { profile?: CompileProfile; action?: string };
  const items: ProfileItem[] = profiles.map(profileToQuickPick);
  items.push({ label: '$(add) New compile profile…', action: 'new' });
  items.push({ label: '$(gear) Default (exclude spiked & cut)', action: 'default' });

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a compile profile' });
  if (!picked) return undefined;

  if (picked.action === 'default') {
    return {
      name: 'Default',
      excludeStatuses: [...DEFAULT_EXCLUDE],
      includeTitle: true,
      sceneBreak: '---',
      chapterBreak: 'heading',
    };
  }

  if (picked.action === 'new') {
    return configureNewProfile(projectFileUri);
  }

  return (picked as ProfileItem).profile;
}

async function configureNewProfile(projectFileUri: vscode.Uri | null): Promise<CompileProfile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: 'Profile name', placeHolder: 'e.g. Submission Draft' });
  if (!name) return undefined;

  const excludeItems = VALID_STATUSES.map((s) => ({
    label: s,
    picked: DEFAULT_EXCLUDE.includes(s),
  }));
  const excludePicked = await vscode.window.showQuickPick(excludeItems, {
    canPickMany: true,
    placeHolder: 'Select statuses to EXCLUDE from compile',
  });
  if (!excludePicked) return undefined;

  const sceneBreak = await vscode.window.showInputBox({
    prompt: 'Scene break separator',
    value: '---',
    placeHolder: '--- or *** or blank',
  });
  if (sceneBreak === undefined) return undefined;

  const profile: CompileProfile = {
    name,
    excludeStatuses: excludePicked.map((i) => i.label as SceneStatus),
    includeTitle: true,
    sceneBreak: sceneBreak || '',
    chapterBreak: 'heading',
  };

  if (projectFileUri) {
    const save = await vscode.window.showQuickPick(
      [{ label: 'Yes', description: 'Save to project file' }, { label: 'No', description: 'Use once' }],
      { placeHolder: 'Save this profile?' }
    );
    if (save?.label === 'Yes') {
      await saveProfile(projectFileUri, profile);
    }
  }

  return profile;
}

export function registerCompile(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.compileManuscript', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        await vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const { data, projectFileUri } = await getManuscript();
      if (!data || data.flatUris.length === 0) {
        await vscode.window.showErrorMessage('No manuscript found. Create a noveltools.json first.');
        return;
      }

      const profile = await pickOrConfigureProfile(projectFileUri);
      if (!profile) return;

      const compiled = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Compiling manuscript…' },
        () =>
          compileManuscriptMarkdown(
            data,
            profile.excludeStatuses ?? DEFAULT_EXCLUDE,
            profile.includeTitle ?? true,
            profile.sceneBreak ?? '---',
            profile.chapterBreak ?? 'heading'
          )
      );

      const title = (data.title?.trim() || 'manuscript').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const defaultName = `${title}-compiled.md`;
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(folder.uri, defaultName),
        filters: { Markdown: ['md'] },
      });
      if (!saveUri) return;

      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(compiled, 'utf8'));
      const words = countWords(compiled);
      const doc = await vscode.workspace.openTextDocument(saveUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.window.showInformationMessage(
        `Compiled ${words.toLocaleString()} words to ${vscode.workspace.asRelativePath(saveUri)}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.manageCompileProfiles', async () => {
      const { projectFileUri } = await getManuscript();
      if (!projectFileUri) {
        await vscode.window.showErrorMessage('No project file found. Profiles are stored in noveltools.json.');
        return;
      }

      const profiles = await loadProfiles(projectFileUri);
      if (profiles.length === 0) {
        const create = await vscode.window.showInformationMessage(
          'No compile profiles yet.',
          'Create One'
        );
        if (create === 'Create One') {
          const profile = await configureNewProfile(projectFileUri);
          if (profile) await saveProfile(projectFileUri, profile);
        }
        return;
      }

      type ProfileAction = vscode.QuickPickItem & { profile: CompileProfile; action: string };
      const items: ProfileAction[] = [];
      for (const p of profiles) {
        items.push({
          label: `$(trash) Delete "${p.name}"`,
          description: p.excludeStatuses?.join(', ') ?? 'no exclusions',
          profile: p,
          action: 'delete',
        });
      }
      items.push({
        label: '$(add) Create new profile',
        description: '',
        profile: { name: '' },
        action: 'create',
      } as ProfileAction);

      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Manage compile profiles' });
      if (!picked) return;

      if (picked.action === 'delete') {
        await deleteProfile(projectFileUri, picked.profile.name);
        await vscode.window.showInformationMessage(`Deleted profile "${picked.profile.name}".`);
      } else if (picked.action === 'create') {
        const profile = await configureNewProfile(projectFileUri);
        if (profile) await saveProfile(projectFileUri, profile);
      }
    })
  );
}

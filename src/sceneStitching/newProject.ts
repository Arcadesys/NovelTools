import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import { clearManuscriptCache } from './sceneList';
import type { ChapterData, ManuscriptData } from './projectData';
import { serializeToJson } from './projectData';

export function registerNewProject(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.newProject', () => runNewProject())
  );
}

interface DiscoveredChapter {
  folderPath: string;
  title: string;
  scenes: string[];
}

async function discoverStructure(root: vscode.Uri): Promise<DiscoveredChapter[]> {
  const chapters: DiscoveredChapter[] = [];
  const rootScenes: string[] = [];

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return [];
  }

  const folders: string[] = [];
  for (const [name, type] of entries) {
    if (name.startsWith('.')) continue;
    if (type === vscode.FileType.Directory) {
      folders.push(name);
    } else if (type === vscode.FileType.File && /\.md$/i.test(name)) {
      rootScenes.push(name);
    }
  }

  // Check subfolders for .md files
  for (const folder of folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    const folderUri = vscode.Uri.joinPath(root, folder);
    let subEntries: [string, vscode.FileType][];
    try {
      subEntries = await vscode.workspace.fs.readDirectory(folderUri);
    } catch {
      continue;
    }
    const mdFiles = subEntries
      .filter(([n, t]) => t === vscode.FileType.File && /\.md$/i.test(n))
      .map(([n]) => n)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (mdFiles.length > 0) {
      chapters.push({ folderPath: folder, title: folder, scenes: mdFiles });
    }
  }

  // Root-level .md files become a chapter if no subfolders had scenes, or their own chapter
  if (rootScenes.length > 0) {
    rootScenes.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (chapters.length === 0) {
      chapters.push({ folderPath: '.', title: 'Chapter 1', scenes: rootScenes });
    } else {
      // Prepend root scenes as their own chapter
      chapters.unshift({ folderPath: '.', title: 'Untitled', scenes: rootScenes });
    }
  }

  return chapters;
}

function buildManuscriptData(
  title: string,
  chapters: DiscoveredChapter[],
  projectFileUri: vscode.Uri
): ManuscriptData {
  const baseDir = vscode.Uri.joinPath(projectFileUri, '..');
  const chapterData: ChapterData[] = chapters.map((ch) => {
    const scenePaths = ch.scenes.map((s) =>
      ch.folderPath === '.' ? s : `${ch.folderPath}/${s}`
    );
    const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
    if (ch.folderPath === '.') {
      return { title: ch.title, sceneUris, scenePaths };
    }
    return { title: ch.title, sceneUris, scenePaths, folderPath: ch.folderPath };
  });
  const flatUris = chapterData.flatMap((ch) => ch.sceneUris);
  return { title, chapters: chapterData, flatUris, projectFileUri };
}

async function runNewProject(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    await vscode.window.showErrorMessage('Open a folder in VS Code first, then run "NovelTools: New Project".');
    return;
  }
  const root = folders[0].uri;

  // Check if a project file already exists
  const projectFileName = getProjectFile();
  const segments = projectFileName.split(/[/\\]/);
  const projectFileUri = segments.length > 1
    ? vscode.Uri.joinPath(root, ...segments)
    : vscode.Uri.joinPath(root, projectFileName);

  try {
    await vscode.workspace.fs.stat(projectFileUri);
    const overwrite = await vscode.window.showWarningMessage(
      `A project file (${projectFileName}) already exists. Overwrite it?`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  } catch {
    // No existing file — good
  }

  // Prompt for title
  const title = await vscode.window.showInputBox({
    title: 'NovelTools: New Project',
    prompt: 'Enter a title for your manuscript',
    placeHolder: 'My Novel',
    validateInput: (v) => v.trim() ? undefined : 'Title is required.',
  });
  if (title === undefined) return;

  // Scan workspace for existing .md files
  const discovered = await discoverStructure(root);

  let data: ManuscriptData;

  if (discovered.length > 0) {
    const totalScenes = discovered.reduce((sum, ch) => sum + ch.scenes.length, 0);
    const chapterWord = discovered.length === 1 ? 'chapter' : 'chapters';
    const sceneWord = totalScenes === 1 ? 'scene' : 'scenes';
    const use = await vscode.window.showInformationMessage(
      `Found ${totalScenes} ${sceneWord} in ${discovered.length} ${chapterWord}. Use this structure?`,
      { modal: true },
      'Use Discovered Structure',
      'Start Empty'
    );
    if (use === undefined) return;

    if (use === 'Use Discovered Structure') {
      data = buildManuscriptData(title.trim(), discovered, projectFileUri);
    } else {
      data = await scaffoldEmpty(title.trim(), root, projectFileUri);
    }
  } else {
    data = await scaffoldEmpty(title.trim(), root, projectFileUri);
  }

  // Write the project file
  const json = serializeToJson(data, vscode.Uri.joinPath(projectFileUri, '..'));
  await vscode.workspace.fs.writeFile(projectFileUri, Buffer.from(json, 'utf8'));

  clearManuscriptCache();
  await vscode.commands.executeCommand('noveltools.refreshManuscript');

  // Open the project file briefly so the user sees it
  const doc = await vscode.workspace.openTextDocument(projectFileUri);
  await vscode.window.showTextDocument(doc, { preview: true });

  // Open the first scene if one was created
  if (data.flatUris.length > 0) {
    const firstScene = await vscode.workspace.openTextDocument(data.flatUris[0]);
    await vscode.window.showTextDocument(firstScene, { preview: false });
  }

  const sceneCount = data.flatUris.length;
  const chapterCount = data.chapters.length;
  await vscode.window.showInformationMessage(
    `Project "${title.trim()}" created with ${chapterCount} ${chapterCount === 1 ? 'chapter' : 'chapters'} and ${sceneCount} ${sceneCount === 1 ? 'scene' : 'scenes'}. Open the NovelTools sidebar to get started.`
  );
}

async function scaffoldEmpty(
  title: string,
  root: vscode.Uri,
  projectFileUri: vscode.Uri
): Promise<ManuscriptData> {
  const chapterFolder = 'chapter-01';
  const sceneFile = 'scene-01.md';
  const chapterUri = vscode.Uri.joinPath(root, chapterFolder);
  const sceneUri = vscode.Uri.joinPath(chapterUri, sceneFile);

  await vscode.workspace.fs.createDirectory(chapterUri);
  await vscode.workspace.fs.writeFile(sceneUri, Buffer.from('', 'utf8'));

  const scenePath = `${chapterFolder}/${sceneFile}`;
  const chapter: ChapterData = {
    title: chapterFolder,
    sceneUris: [sceneUri],
    scenePaths: [scenePath],
    folderPath: chapterFolder,
  };

  return {
    title,
    chapters: [chapter],
    flatUris: [sceneUri],
    projectFileUri,
  };
}

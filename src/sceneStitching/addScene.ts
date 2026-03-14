import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { insertScene as insertSceneInData, scenePathsRelativeTo } from './projectData';
import { buildProjectToFile, writeProject } from './projectFile';

type SceneNode = {
  type: 'scene';
  chapterIndex: number;
  sceneIndex: number;
  uri: vscode.Uri;
  data: {
    projectFileUri: vscode.Uri | null;
    chapters: { sceneUris: vscode.Uri[]; scenePaths: string[]; folderPath?: string }[];
  };
};

export function registerAddScene(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.addSceneBelow', (node?: SceneNode) => addScene(node))
  );
}

async function addScene(node: SceneNode | undefined): Promise<void> {
  let result = await getManuscript();
  if (!result.data) {
    await vscode.window.showInformationMessage('No manuscript found. Build or open a project file first.');
    return;
  }
  if (!result.projectFileUri) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;
    const name = getProjectFile();
    const segments = name.split(/[/\\]/);
    const targetUri =
      segments.length > 1
        ? vscode.Uri.joinPath(folders[0].uri, ...segments)
        : vscode.Uri.joinPath(folders[0].uri, name);
    await buildProjectToFile(targetUri, result.data);
    clearManuscriptCache();
    result = await getManuscript();
  }
  if (!result.data || !result.projectFileUri) return;

  // Resolve the target scene (from tree node or active editor)
  let chapterIdx = -1;
  let sceneIdx = -1;
  if (node?.type === 'scene') {
    chapterIdx = node.chapterIndex;
    sceneIdx = node.sceneIndex;
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showInformationMessage('Select a scene in the Manuscript view or open a scene file.');
      return;
    }
    const current = editor.document.uri.toString();
    for (let ch = 0; ch < result.data.chapters.length; ch++) {
      const chapter = result.data.chapters[ch];
      for (let sc = 0; sc < chapter.sceneUris.length; sc++) {
        if (chapter.sceneUris[sc].toString() === current) {
          chapterIdx = ch;
          sceneIdx = sc;
          break;
        }
      }
      if (chapterIdx >= 0) break;
    }
  }
  if (chapterIdx < 0 || sceneIdx < 0) {
    await vscode.window.showInformationMessage('Current file is not in the manuscript.');
    return;
  }

  const chapter = result.data.chapters[chapterIdx];
  if (!chapter) return;

  // Determine directory: use the chapter's folder or the directory of the adjacent scene
  const baseDir = vscode.Uri.joinPath(result.projectFileUri, '..');
  let defaultDir: string;
  if (chapter.folderPath) {
    defaultDir = chapter.folderPath;
  } else if (chapter.scenePaths.length > 0) {
    const refPath = chapter.scenePaths[sceneIdx] ?? chapter.scenePaths[0];
    defaultDir = path.dirname(refPath).split(path.sep).join('/');
  } else {
    defaultDir = '.';
  }

  // Prompt for the new scene filename
  const filename = await vscode.window.showInputBox({
    title: 'Add Scene',
    prompt: `Enter a filename for the new scene (in ${defaultDir === '.' ? 'project root' : defaultDir}/)`,
    placeHolder: 'new-scene.md',
    validateInput: (value) => {
      if (!value.trim()) return 'Filename cannot be empty.';
      if (/[<>:"|?*]/.test(value)) return 'Filename contains invalid characters.';
      return undefined;
    },
  });
  if (!filename) return;

  // Ensure .md extension
  const name = filename.trim().endsWith('.md') ? filename.trim() : `${filename.trim()}.md`;
  const scenePath = defaultDir === '.' ? name : `${defaultDir}/${name}`;
  const sceneUri = vscode.Uri.joinPath(baseDir, scenePath);

  // Create the file on disk if it doesn't exist
  try {
    await vscode.workspace.fs.stat(sceneUri);
    // File already exists — that's fine, just add it to the manuscript
  } catch {
    await vscode.workspace.fs.writeFile(sceneUri, Buffer.from('', 'utf8'));
  }

  // Compute the relative path for serialization
  const [relPath] = scenePathsRelativeTo(baseDir, [sceneUri]);

  // Insert at the correct position
  const insertIdx = sceneIdx + 1;
  const updated = insertSceneInData(result.data, chapterIdx, insertIdx, sceneUri, relPath);

  await writeProject(result.projectFileUri, updated);
  clearManuscriptCache(result.projectFileUri);
  await vscode.commands.executeCommand('noveltools.refreshManuscript');

  // Open the new scene
  const doc = await vscode.workspace.openTextDocument(sceneUri);
  await vscode.window.showTextDocument(doc);
}

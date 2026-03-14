import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import { getManuscript, clearManuscriptCache } from './sceneList';
import type { ChapterData, ManuscriptData } from './projectData';
import { buildProjectToFile, writeProject } from './projectFile';

/** Either our internal node or the TreeItem passed by the view context menu (has label + contextValue). */
type ChapterNodeOrItem =
  | { type: 'chapter'; chapterIndex: number; label: string; data: ManuscriptData }
  | vscode.TreeItem;

function insertChapterInData(data: ManuscriptData, atIndex: number, chapter: ChapterData): ManuscriptData {
  const chapters = [...data.chapters];
  chapters.splice(atIndex, 0, chapter);
  const flatUris = chapters.flatMap((ch) => ch.sceneUris);
  return { ...data, chapters, flatUris };
}

export function registerAddChapter(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.addChapterBelow', (node?: ChapterNodeOrItem) => addChapter(node, 'below')),
    vscode.commands.registerCommand('noveltools.addChapter', () => addChapter(undefined, 'end'))
  );
}

async function addChapter(nodeOrItem: ChapterNodeOrItem | undefined, position: 'above' | 'below' | 'end'): Promise<void> {
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

  let insertIndex: number;
  if (position === 'end') {
    insertIndex = result.data.chapters.length;
  } else if (nodeOrItem && 'chapterIndex' in nodeOrItem && typeof nodeOrItem.chapterIndex === 'number') {
    insertIndex = position === 'above' ? nodeOrItem.chapterIndex : nodeOrItem.chapterIndex + 1;
  } else if (nodeOrItem && 'contextValue' in nodeOrItem && nodeOrItem.contextValue === 'chapter' && 'label' in nodeOrItem) {
    const raw = (nodeOrItem as vscode.TreeItem).label;
    const label = typeof raw === 'string' ? raw : (raw as { value?: string } | undefined)?.value ?? '';
    const chapterIndex = result.data.chapters.findIndex(
      (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === label
    );
    if (chapterIndex < 0) {
      insertIndex = result.data.chapters.length;
    } else {
      insertIndex = position === 'above' ? chapterIndex : chapterIndex + 1;
    }
  } else {
    insertIndex = result.data.chapters.length;
  }

  const baseDir = vscode.Uri.joinPath(result.projectFileUri, '..');
  const folderName = await vscode.window.showInputBox({
    title: position === 'end' ? 'Add Chapter' : `Add Chapter ${position === 'above' ? 'Above' : 'Below'}`,
    prompt: 'Enter a folder name for the new chapter (will be created under the project file directory)',
    placeHolder: 'chapter-01',
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 'Folder name cannot be empty.';
      if (/[<>:"|?*\\/]/.test(trimmed)) return 'Folder name contains invalid characters.';
      if (trimmed === '.' || trimmed === '..') return 'Enter a valid folder name.';
      return undefined;
    },
  });
  if (folderName === undefined) return;

  const trimmed = folderName.trim().replace(/\/$/, '');
  const folderPath = trimmed.split(path.sep).join('/');
  const chapterFolderUri = vscode.Uri.joinPath(baseDir, folderPath);

  try {
    await vscode.workspace.fs.stat(chapterFolderUri);
    await vscode.window.showErrorMessage(`A folder "${trimmed}" already exists. Choose a different name.`);
    return;
  } catch {
    // Folder does not exist; create it.
  }

  try {
    await vscode.workspace.fs.createDirectory(chapterFolderUri);
  } catch (err) {
    await vscode.window.showErrorMessage(
      `Could not create folder: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const displayTitle = path.basename(folderPath.replace(/\/$/, '')) || folderPath;
  const newChapter: ChapterData = {
    title: displayTitle,
    sceneUris: [],
    scenePaths: [],
    folderPath,
  };
  const updated = insertChapterInData(result.data, insertIndex, newChapter);

  await writeProject(result.projectFileUri, updated);
  clearManuscriptCache(result.projectFileUri);
  await vscode.commands.executeCommand('noveltools.refreshManuscript');
}

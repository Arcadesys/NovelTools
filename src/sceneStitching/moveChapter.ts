import * as vscode from 'vscode';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { reorderChapters } from './projectYaml';
import { writeProjectYaml } from './projectFile';

export function registerMoveChapter(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.moveChapterUp', () => moveChapter(-1)),
    vscode.commands.registerCommand('noveltools.moveChapterDown', () => moveChapter(1))
  );
}

async function moveChapter(delta: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const result = await getManuscript();
  if (!result.data || !result.projectFileUri) {
    await vscode.window.showInformationMessage(
      'No project file. Create a noveltools.json with chapters to move.'
    );
    return;
  }
  const current = editor.document.uri.toString();
  let chapterIndex = -1;
  for (let i = 0; i < result.data.chapters.length; i++) {
    if (result.data.chapters[i].sceneUris.some((u) => u.toString() === current)) {
      chapterIndex = i;
      break;
    }
  }
  if (chapterIndex < 0) {
    await vscode.window.showInformationMessage('Current file is not in the manuscript.');
    return;
  }
  const toIndex = chapterIndex + delta;
  if (toIndex < 0 || toIndex >= result.data.chapters.length) return;
  const next = reorderChapters(result.data, chapterIndex, toIndex);
  await writeProjectYaml(result.projectFileUri, next);
  clearManuscriptCache();
}

import * as vscode from 'vscode';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { reorderChapters, serializeToYaml } from './projectYaml';

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
      'No project YAML file. Create a noveltools.yaml with chapters to move.'
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
  const yaml = serializeToYaml(next);
  const doc = await vscode.workspace.openTextDocument(result.projectFileUri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
  edit.replace(result.projectFileUri, fullRange, yaml);
  await vscode.workspace.applyEdit(edit);
  clearManuscriptCache();
}

import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { moveScene as moveSceneInData } from './projectYaml';
import { buildProjectYamlToFile, writeProjectYaml } from './projectFile';

type SceneNode = {
  type: 'scene';
  chapterIndex: number;
  sceneIndex: number;
};

export function registerMoveScene(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.moveSceneUp', (node?: SceneNode) => moveScene(node, -1)),
    vscode.commands.registerCommand('noveltools.moveSceneDown', (node?: SceneNode) => moveScene(node, 1))
  );
}

async function moveScene(node: SceneNode | undefined, delta: number): Promise<void> {
  let result = await getManuscript();
  if (!result.data) return;
  if (!result.projectFileUri) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;
    const name = getProjectFile();
    const segments = name.split(/[/\\]/);
    const targetUri =
      segments.length > 1
        ? vscode.Uri.joinPath(folders[0].uri, ...segments)
        : vscode.Uri.joinPath(folders[0].uri, name);
    await buildProjectYamlToFile(targetUri, result.data);
    clearManuscriptCache();
    result = await getManuscript();
  }
  if (!result.data || !result.projectFileUri) return;

  let fromCh = -1;
  let fromSc = -1;
  if (node?.type === 'scene') {
    fromCh = node.chapterIndex;
    fromSc = node.sceneIndex;
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const current = editor.document.uri.toString();
    for (let ch = 0; ch < result.data.chapters.length; ch++) {
      const chapter = result.data.chapters[ch];
      for (let sc = 0; sc < chapter.sceneUris.length; sc++) {
        if (chapter.sceneUris[sc].toString() === current) {
          fromCh = ch;
          fromSc = sc;
          break;
        }
      }
      if (fromCh >= 0) break;
    }
  }
  if (fromCh < 0 || fromSc < 0) {
    await vscode.window.showInformationMessage('Current file is not in the manuscript.');
    return;
  }

  const chapters = result.data.chapters;
  const fromChapter = chapters[fromCh];
  if (!fromChapter) return;

  let toCh = fromCh;
  let toSc = fromSc;
  if (delta < 0) {
    if (fromSc > 0) {
      toSc = fromSc - 1;
    } else if (fromCh > 0) {
      toCh = fromCh - 1;
      toSc = chapters[toCh].sceneUris.length;
    } else {
      return;
    }
  } else {
    if (fromSc < fromChapter.sceneUris.length - 1) {
      toSc = fromSc + 1;
    } else if (fromCh < chapters.length - 1) {
      toCh = fromCh + 1;
      toSc = 0;
    } else {
      return;
    }
  }

  const next = moveSceneInData(result.data, fromCh, fromSc, toCh, toSc);
  await writeProjectYaml(result.projectFileUri, next);
  clearManuscriptCache();
  await vscode.commands.executeCommand('noveltools.refreshManuscript');
}

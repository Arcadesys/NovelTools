import * as vscode from 'vscode';
import {
  scenePathsRelativeTo,
  serializeToJson,
  type ManuscriptData,
} from './projectData';

export async function writeProject(uri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(uri, '..');
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: uri };
  const json = serializeToJson(dataForWrite, baseDir);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, json);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  } catch {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
  }
}

/** Create or overwrite project file at targetUri with data (JSON only). */
export async function buildProjectToFile(targetUri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(targetUri, '..');
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: targetUri };
  const json = serializeToJson(dataForWrite, baseDir);
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(json, 'utf8'));
}

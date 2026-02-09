import * as vscode from 'vscode';
import { scenePathsRelativeTo, serializeToYaml, type ManuscriptData } from './projectYaml';

export async function writeProjectYaml(uri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const yaml = serializeToYaml(data);
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
  edit.replace(uri, fullRange, yaml);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

/** Create or overwrite project YAML at targetUri with data; scene paths are written relative to the file's directory. */
export async function buildProjectYamlToFile(targetUri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(targetUri, '..');
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: targetUri };
  const yaml = serializeToYaml(dataForWrite);
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
}

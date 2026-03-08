import * as path from 'path';
import * as vscode from 'vscode';
import {
  scenePathsRelativeTo,
  serializeToYaml,
  serializeToJson,
  serializeToIndexYaml,
  serializeToLongformYaml,
  type ManuscriptData,
} from './projectYaml';
import { setActiveProjectUri, clearManuscriptCache } from './sceneList';

function isIndexYaml(uri: vscode.Uri): boolean {
  const base = path.basename(uri.fsPath);
  const ext = path.extname(base).toLowerCase();
  const stem = base.slice(0, base.length - ext.length);
  return /^index$/i.test(stem) && (ext === '.yaml' || ext === '.yml');
}

function isJsonProject(uri: vscode.Uri): boolean {
  const base = path.basename(uri.fsPath);
  const ext = path.extname(base).toLowerCase();
  return ext === '.json';
}

/** When current project file is YAML, prompt to save as JSON and write to noveltools.json in the same directory. Returns true if saved, false if cancelled. */
async function tryMigrateYamlToJson(uri: vscode.Uri, data: ManuscriptData): Promise<boolean> {
  const dir = vscode.Uri.joinPath(uri, '..');
  const jsonUri = vscode.Uri.joinPath(dir, 'noveltools.json');
  const choice = await vscode.window.showInformationMessage(
    'Project format is now JSON. Save as noveltools.json?',
    'Save',
    'Cancel'
  );
  if (choice !== 'Save') return false;
  const baseDir = vscode.Uri.joinPath(uri, '..');
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: jsonUri };
  const json = serializeToJson(dataForWrite, baseDir);
  await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(json, 'utf8'));
  await setActiveProjectUri(jsonUri);
  clearManuscriptCache();
  return true;
}

export async function writeProjectYaml(uri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(uri, '..');
  if (isJsonProject(uri)) {
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
    return;
  }
  if (!isIndexYaml(uri) && (uri.fsPath.endsWith('.yaml') || uri.fsPath.endsWith('.yml'))) {
    const migrated = await tryMigrateYamlToJson(uri, data);
    if (migrated) return;
    return;
  }
  let yaml: string;
  if (data.longformMeta) {
    yaml = serializeToLongformYaml(data);
  } else if (isIndexYaml(uri)) {
    yaml = serializeToIndexYaml({
      ...data,
      chapters: [
        {
          title: undefined,
          sceneUris: data.flatUris,
          scenePaths: scenePathsRelativeTo(baseDir, data.flatUris),
        },
      ],
      projectFileUri: uri,
    });
  } else {
    yaml = serializeToYaml(data, baseDir);
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
  edit.replace(uri, fullRange, yaml);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

/** Create or overwrite project file at targetUri with data; writes JSON for .json, scene paths relative to the file's directory. */
export async function buildProjectYamlToFile(targetUri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(targetUri, '..');
  if (isJsonProject(targetUri)) {
    const chapters = data.chapters.map((ch) => ({
      ...ch,
      scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
    }));
    const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: targetUri };
    const json = serializeToJson(dataForWrite, baseDir);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(json, 'utf8'));
    return;
  }
  if (data.longformMeta) {
    const yaml = serializeToLongformYaml(data);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
    return;
  }
  if (isIndexYaml(targetUri)) {
    const scenePaths = scenePathsRelativeTo(baseDir, data.flatUris);
    const dataForWrite: ManuscriptData = {
      ...data,
      chapters: [
        { title: undefined, sceneUris: data.flatUris, scenePaths },
      ],
      projectFileUri: targetUri,
    };
    const yaml = serializeToIndexYaml(dataForWrite);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
    return;
  }
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: targetUri };
  const json = serializeToJson(dataForWrite, baseDir);
  const jsonUri = vscode.Uri.joinPath(baseDir, 'noveltools.json');
  await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(json, 'utf8'));
}

import * as path from 'path';
import * as vscode from 'vscode';
import {
  scenePathsRelativeTo,
  serializeToYaml,
  serializeToIndexYaml,
  serializeToLongformYaml,
  type ManuscriptData,
} from './projectYaml';

function isIndexYaml(uri: vscode.Uri): boolean {
  return path.basename(uri.fsPath) === 'index.yaml';
}

export async function writeProjectYaml(uri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(uri, '..');
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
    yaml = serializeToYaml(data);
  }
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
  const yaml = serializeToYaml(dataForWrite);
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
}

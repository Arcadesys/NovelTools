import * as vscode from 'vscode';
import { getProjectFile, getSceneFiles, getSceneGlob } from '../config';
import { parseProjectYaml, type ManuscriptData } from './projectYaml';

let cached: { result: ManuscriptResult; workspaceRoot: string } | null = null;

export interface ManuscriptResult {
  data: ManuscriptData | null;
  flatUris: vscode.Uri[];
  projectFileUri: vscode.Uri | null;
}

async function findProjectFile(): Promise<vscode.Uri | null> {
  const name = getProjectFile();
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  for (const folder of folders) {
    const candidate = vscode.Uri.joinPath(folder.uri, name);
    try {
      await vscode.workspace.fs.readFile(candidate);
      return candidate;
    } catch {
      // try as path (e.g. draft/manuscript.yaml)
      const segments = name.split(/[/\\]/);
      const fileUri = segments.length > 1
        ? vscode.Uri.joinPath(folder.uri, ...segments)
        : candidate;
      try {
        await vscode.workspace.fs.readFile(fileUri);
        return fileUri;
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function loadFromProjectFile(uri: vscode.Uri): Promise<ManuscriptResult> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = new TextDecoder().decode(bytes);
  const data = parseProjectYaml(content, uri);
  if (data) {
    return { data, flatUris: data.flatUris, projectFileUri: uri };
  }
  return { data: null, flatUris: [], projectFileUri: uri };
}

async function loadFromConfig(): Promise<ManuscriptResult> {
  const sceneFiles = getSceneFiles();
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return { data: null, flatUris: [], projectFileUri: null };
  const root = folders[0].uri;
  if (sceneFiles.length > 0) {
    const flatUris = sceneFiles.map((p) => vscode.Uri.joinPath(root, p));
    const data: ManuscriptData = {
      title: undefined,
      chapters: [{ title: undefined, sceneUris: flatUris, scenePaths: sceneFiles }],
      flatUris,
      projectFileUri: null,
    };
    return { data, flatUris, projectFileUri: null };
  }
  const glob = getSceneGlob();
  const found = await vscode.workspace.findFiles(glob);
  const sorted = found.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  const data: ManuscriptData = {
    title: undefined,
    chapters: [
      {
        title: undefined,
        sceneUris: sorted,
        scenePaths: sorted.map((u) => vscode.workspace.asRelativePath(u)),
      },
    ],
    flatUris: sorted,
    projectFileUri: null,
  };
  return { data, flatUris: sorted, projectFileUri: null };
}

export async function getManuscript(): Promise<ManuscriptResult> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '';
  if (cached?.workspaceRoot === root) {
    return cached.result;
  }
  const projectUri = await findProjectFile();
  const result = projectUri
    ? await loadFromProjectFile(projectUri)
    : await loadFromConfig();
  cached = { result, workspaceRoot: root };
  return result;
}

/** Returns flat list of URIs for manuscript word count and navigation. */
export async function getManuscriptUris(): Promise<ManuscriptResult> {
  return getManuscript();
}

export function clearManuscriptCache(): void {
  cached = null;
}

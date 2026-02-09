import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile, getSceneFiles, getSceneGlob, getChapterGrouping } from '../config';
import { parseProjectYaml, type ManuscriptData, type ChapterData } from './projectYaml';

let cached: { result: ManuscriptResult; workspaceRoot: string } | null = null;

export interface ManuscriptResult {
  data: ManuscriptData | null;
  flatUris: vscode.Uri[];
  projectFileUri: vscode.Uri | null;
}

function normalizePathForGrouping(scenePath: string): string {
  return scenePath.replace(/\\/g, '/');
}

function groupScenesByFolder(scenePaths: string[], sceneUris: vscode.Uri[]): ChapterData[] {
  const order: string[] = [];
  const chaptersByKey = new Map<string, ChapterData>();
  for (let i = 0; i < scenePaths.length; i++) {
    const scenePath = normalizePathForGrouping(scenePaths[i]);
    const dir = path.posix.dirname(scenePath);
    const key = dir === '.' ? '' : dir;
    let chapter = chaptersByKey.get(key);
    if (!chapter) {
      chapter = {
        title: dir === '.' ? 'Root' : path.posix.basename(dir),
        sceneUris: [],
        scenePaths: [],
      };
      chaptersByKey.set(key, chapter);
      order.push(key);
    }
    chapter.sceneUris.push(sceneUris[i]);
    chapter.scenePaths.push(scenePaths[i]);
  }
  const titleCounts = new Map<string, number>();
  for (const key of order) {
    const title = chaptersByKey.get(key)?.title ?? '';
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  for (const key of order) {
    const chapter = chaptersByKey.get(key);
    if (!chapter) continue;
    const title = chapter.title ?? '';
    if ((titleCounts.get(title) ?? 0) > 1) {
      chapter.title = key === '' ? 'Root' : key;
    }
  }
  return order.map((key) => chaptersByKey.get(key)!).filter(Boolean);
}

function buildChapters(
  scenePaths: string[],
  sceneUris: vscode.Uri[],
  grouping: 'flat' | 'folder'
): ChapterData[] {
  if (grouping === 'folder') {
    return groupScenesByFolder(scenePaths, sceneUris);
  }
  return [{ title: undefined, sceneUris, scenePaths }];
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
  const grouping = getChapterGrouping();
  if (sceneFiles.length > 0) {
    const flatUris = sceneFiles.map((p) => vscode.Uri.joinPath(root, p));
    const chapters = buildChapters(sceneFiles, flatUris, grouping);
    const flattened = chapters.flatMap((ch) => ch.sceneUris);
    const data: ManuscriptData = {
      title: undefined,
      chapters,
      flatUris: flattened,
      projectFileUri: null,
    };
    return { data, flatUris: flattened, projectFileUri: null };
  }
  const glob = getSceneGlob();
  const found = await vscode.workspace.findFiles(glob);
  const sorted = found.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  if (sorted.length === 0) {
    return { data: null, flatUris: [], projectFileUri: null };
  }
  const scenePaths = sorted.map((u) => normalizePathForGrouping(vscode.workspace.asRelativePath(u)));
  const chapters = buildChapters(scenePaths, sorted, grouping);
  const flattened = chapters.flatMap((ch) => ch.sceneUris);
  const data: ManuscriptData = {
    title: undefined,
    chapters,
    flatUris: flattened,
    projectFileUri: null,
  };
  return { data, flatUris: flattened, projectFileUri: null };
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

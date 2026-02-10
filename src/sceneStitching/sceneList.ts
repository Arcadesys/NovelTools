import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile, getSceneFiles, getSceneGlob, getChapterGrouping, getIndexYamlGlob } from '../config';
import { parseProjectYaml, parseIndexYaml, parseLongformIndexYaml, parseLongformStrict, resolveChapterFolders, type ManuscriptData, type ChapterData } from './projectYaml';

const INDEX_YAML = 'index.yaml';
/** Additional index filenames to try when glob finds nothing (e.g. Index.YAML, Index.md). */
const INDEX_CANDIDATES = ['index.yaml', 'Index.yaml', 'Index.YAML', 'Index.md', 'index.md'];
const ACTIVE_PROJECT_URI_KEY = 'noveltools.activeProjectUri';

let extensionContext: vscode.ExtensionContext | null = null;
const cacheByUri = new Map<string, ManuscriptResult>();
let cacheWorkspaceRoot: string | null = null;

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

/** Called from extension activate to provide workspace state for active document. */
export function initSceneList(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

function getWorkspaceKey(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '';
}

export async function getActiveProjectUri(): Promise<vscode.Uri | null> {
  if (!extensionContext) return null;
  const stored = extensionContext.workspaceState.get<string>(ACTIVE_PROJECT_URI_KEY);
  if (!stored) return null;
  try {
    return vscode.Uri.parse(stored);
  } catch {
    return null;
  }
}

export async function setActiveProjectUri(uri: vscode.Uri): Promise<void> {
  if (!extensionContext) return;
  await extensionContext.workspaceState.update(ACTIVE_PROJECT_URI_KEY, uri.toString());
}

/** Fallback globs when the configured glob finds nothing (handles brace-expansion edge cases). */
const FALLBACK_INDEX_GLOBS = [
  '**/Index.YAML',
  '**/Index.yaml',
  '**/index.yaml',
  '**/Index.md',
  '**/index.md',
  '**/*[iI]ndex*.yaml',
  '**/*[iI]ndex*.md',
];

/** Find all index.yaml files matching the configured glob. */
export async function findAllIndexYaml(): Promise<vscode.Uri[]> {
  // #region agent log
  const glob = getIndexYamlGlob();
  let found = await vscode.workspace.findFiles(glob);
  if (found.length === 0) {
    for (const fallback of FALLBACK_INDEX_GLOBS) {
      const extra = await vscode.workspace.findFiles(fallback);
      found = [...found, ...extra];
    }
  }
  const unique = Array.from(new Map(found.map((u) => [u.fsPath, u])).values());
  const sorted = unique.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sceneList.ts:findAllIndexYaml',message:'Index files found',data:{count:sorted.length,paths:sorted.map(u=>vscode.workspace.asRelativePath(u))},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  return sorted;
  // #endregion
}

async function findIndexYaml(): Promise<vscode.Uri | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  for (const folder of folders) {
    for (const name of INDEX_CANDIDATES) {
      const candidate = vscode.Uri.joinPath(folder.uri, name);
      try {
        await vscode.workspace.fs.readFile(candidate);
        return candidate;
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function findProjectFile(): Promise<vscode.Uri | null> {
  const indexUri = await findIndexYaml();
  if (indexUri) return indexUri;
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

function isIndexYaml(uri: vscode.Uri): boolean {
  const base = path.basename(uri.fsPath);
  const ext = path.extname(uri.fsPath).toLowerCase();
  const stem = base.slice(0, base.length - ext.length);
  return /^index$/i.test(stem) && (ext === '.yaml' || ext === '.yml');
}

async function loadFromProjectFile(uri: vscode.Uri): Promise<ManuscriptResult> {
  // #region agent log
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = new TextDecoder().decode(bytes);
  const strict = parseLongformStrict(content, uri);
  const index = parseIndexYaml(content, uri);
  const longform = parseLongformIndexYaml(content, uri);
  let data = strict ?? index ?? longform;
  if (!data && !isIndexYaml(uri)) {
    data = parseProjectYaml(content, uri);
  }
  if (data?.chapters.some((ch) => ch.folderPath)) {
    const baseDir = vscode.Uri.joinPath(uri, '..');
    data = await resolveChapterFolders(data, baseDir);
  }
  const relativePath = vscode.workspace.asRelativePath(uri);
  fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sceneList.ts:loadFromProjectFile',message:'Parse result',data:{uri:relativePath,contentLen:content.length,strictOk:!!strict,indexOk:!!index,longformOk:!!longform,dataOk:!!data},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  if (data) {
    return { data, flatUris: data.flatUris, projectFileUri: uri };
  }
  return { data: null, flatUris: [], projectFileUri: uri };
  // #endregion
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

function cacheKey(uri: vscode.Uri | null): string {
  return uri?.toString() ?? 'config';
}

/** Load manuscript for a specific project file URI (cached per URI). */
export async function getManuscriptByUri(uri: vscode.Uri): Promise<ManuscriptResult> {
  const root = getWorkspaceKey();
  if (cacheWorkspaceRoot !== root) {
    cacheByUri.clear();
    cacheWorkspaceRoot = root;
  }
  const key = cacheKey(uri);
  const cached = cacheByUri.get(key);
  if (cached) return cached;
  const result = await loadFromProjectFile(uri);
  cacheByUri.set(key, result);
  return result;
}

export async function getManuscript(projectFileUri?: vscode.Uri): Promise<ManuscriptResult> {
  const root = getWorkspaceKey();
  if (cacheWorkspaceRoot !== root) {
    cacheByUri.clear();
    cacheWorkspaceRoot = root;
  }

  if (projectFileUri) {
    return getManuscriptByUri(projectFileUri);
  }

  const allIndex = await findAllIndexYaml();
  if (allIndex.length > 1) {
    const activeUri = await getActiveProjectUri();
    const uri = activeUri && allIndex.some((u) => u.toString() === activeUri.toString())
      ? activeUri
      : allIndex[0];
    return getManuscriptByUri(uri);
  }

  if (allIndex.length === 1) {
    return getManuscriptByUri(allIndex[0]);
  }

  const singleUri = await findProjectFile();
  if (singleUri) {
    return getManuscriptByUri(singleUri);
  }

  const configKey = 'config';
  let result = cacheByUri.get(configKey);
  if (!result) {
    result = await loadFromConfig();
    cacheByUri.set(configKey, result);
  }
  return result;
}

/** Returns flat list of URIs for manuscript word count and navigation. */
export async function getManuscriptUris(): Promise<ManuscriptResult> {
  return getManuscript();
}

export function clearManuscriptCache(uri?: vscode.Uri): void {
  if (uri) {
    cacheByUri.delete(cacheKey(uri));
  } else {
    cacheByUri.clear();
    cacheWorkspaceRoot = null;
  }
}

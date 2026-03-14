import * as path from 'path';
import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';

/** Returns scene paths relative to baseDir for serialization (forward slashes for portability). */
export function scenePathsRelativeTo(baseDir: vscode.Uri, sceneUris: vscode.Uri[]): string[] {
  const base = baseDir.fsPath;
  return sceneUris.map((uri) => {
    const rel = path.relative(base, uri.fsPath);
    return rel.split(path.sep).join('/');
  });
}

export type SceneStatus = 'drafted' | 'revision' | 'review' | 'done' | 'spiked' | 'cut';

export interface ChapterData {
  title?: string;
  sceneUris: vscode.Uri[];
  scenePaths: string[];
  /** When set, this chapter is a folder: title = folder name, scenes = .md files inside (resolved async). */
  folderPath?: string;
}

export interface SceneMetadataEntry {
  synopsis?: string;
}

export interface ManuscriptData {
  title?: string;
  chapters: ChapterData[];
  flatUris: vscode.Uri[];
  projectFileUri: vscode.Uri | null;
  /** Per-section status: key = relative path (forward slashes). */
  sceneStatus?: Record<string, SceneStatus>;
  /** Per-scene metadata: key = relative path (forward slashes). */
  sceneMetadata?: Record<string, SceneMetadataEntry>;
  /** Optional manuscript word count target. */
  wordCountTarget?: number;
}

/** Chapter in canonical JSON: string = folder path, or object with folder and optional title/scenes. */
type RawChapter =
  | string
  | { title?: string; scenes?: string[]; folder?: string };

interface RawManuscript {
  title?: string;
  chapters: RawChapter[];
  sceneStatus?: Record<string, string>;
  sceneMetadata?: Record<string, { synopsis?: string }>;
  wordCountTarget?: number;
}

function normalizeRawChapter(ch: RawChapter): { title?: string; scenes?: string[]; folder?: string } {
  if (typeof ch === 'string') {
    const folder = ch.trim();
    return folder ? { folder } : { scenes: [] };
  }
  const obj = ch as { title?: string; scenes?: string[]; folder?: string };
  if (obj.folder != null && String(obj.folder).trim() !== '') {
    const folder = String(obj.folder).trim();
    const scenes = Array.isArray(obj.scenes) ? obj.scenes.map((p) => (typeof p === 'string' ? p : String(p))) : undefined;
    return { title: obj.title, folder, scenes };
  }
  return {
    title: obj.title,
    scenes: Array.isArray(obj.scenes) ? obj.scenes.map((p) => (typeof p === 'string' ? p : String(p))) : [],
  };
}

/** Build ManuscriptData from raw parsed content. */
function rawToManuscriptData(raw: RawManuscript, projectFileUri: vscode.Uri): ManuscriptData | null {
  if (!raw || !Array.isArray(raw.chapters)) return null;
  const baseDir = vscode.Uri.joinPath(projectFileUri, '..');
  const chapters: ChapterData[] = [];
  const flatUris: vscode.Uri[] = [];
  for (const rawCh of raw.chapters) {
    const ch = normalizeRawChapter(rawCh);
    if (ch.folder !== undefined) {
      let folderPath = ch.folder.replace(/\/$/, '').split(path.sep).join('/');
      if (folderPath.toLowerCase().endsWith('.md')) folderPath = path.dirname(folderPath).split(path.sep).join('/');
      const folderName = path.basename(folderPath) || folderPath;
      const hasCustomScenes = Array.isArray(ch.scenes) && ch.scenes.length > 0;
      if (hasCustomScenes) {
        const scenePaths = ch.scenes!.map((s) => {
          const str = typeof s === 'string' ? s : String(s);
          if (str.includes('/') || str.includes(path.sep)) return str.split(path.sep).join('/');
          return folderPath + '/' + str;
        });
        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
        chapters.push({
          title: ch.title ?? folderName,
          sceneUris,
          scenePaths,
          folderPath,
        });
        flatUris.push(...sceneUris);
      } else {
        chapters.push({
          title: ch.title ?? folderName,
          sceneUris: [],
          scenePaths: [],
          folderPath,
        });
      }
    } else {
      const scenePaths = ch.scenes ?? [];
      const sceneUris = scenePaths.map((p) => {
        const pathStr = typeof p === 'string' ? p : String(p);
        return vscode.Uri.joinPath(baseDir, pathStr);
      });
      const relDirs = scenePaths.map((p) => path.dirname(typeof p === 'string' ? p : String(p)));
      const firstDir = relDirs[0];
      const allSameDir = firstDir !== undefined && relDirs.every((d) => d === firstDir);
      if (allSameDir && scenePaths.length > 0) {
        const folderPath = firstDir.split(path.sep).join('/');
        const folderName = path.basename(folderPath.replace(/\/$/, '')) || folderPath;
        chapters.push({
          title: ch.title ?? folderName,
          sceneUris,
          scenePaths,
          folderPath,
        });
        flatUris.push(...sceneUris);
      } else {
        chapters.push({ title: ch.title, sceneUris, scenePaths });
        flatUris.push(...sceneUris);
      }
    }
  }
  let sceneStatus: ManuscriptData['sceneStatus'];
  const rawStatus = raw.sceneStatus;
  if (rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus)) {
    sceneStatus = {};
    for (const [k, v] of Object.entries(rawStatus)) {
      if (v === 'drafted' || v === 'revision' || v === 'review' || v === 'done' || v === 'spiked' || v === 'cut') sceneStatus[k] = v;
    }
    if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
  }
  let sceneMetadata: ManuscriptData['sceneMetadata'];
  const rawMeta = raw.sceneMetadata;
  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    sceneMetadata = {};
    for (const [k, v] of Object.entries(rawMeta)) {
      if (v && typeof v === 'object') {
        const entry: SceneMetadataEntry = {};
        if (typeof v.synopsis === 'string') entry.synopsis = v.synopsis;
        if (Object.keys(entry).length > 0) sceneMetadata[k] = entry;
      }
    }
    if (Object.keys(sceneMetadata).length === 0) sceneMetadata = undefined;
  }
  const mergedChapters = mergeConsecutiveChaptersByFolder(chapters);
  const mergedFlatUris = mergedChapters.flatMap((ch) => ch.sceneUris);
  const wordCountTarget = typeof raw.wordCountTarget === 'number' && raw.wordCountTarget > 0
    ? raw.wordCountTarget
    : undefined;
  return {
    title: raw.title,
    chapters: mergedChapters,
    flatUris: mergedFlatUris,
    projectFileUri,
    sceneStatus,
    sceneMetadata,
    wordCountTarget,
  };
}

export function parseProjectJson(
  content: string,
  projectFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    const raw = JSON.parse(content) as RawManuscript | null;
    return raw ? rawToManuscriptData(raw, projectFileUri) : null;
  } catch (err) {
    console.warn('[NovelTools] Failed to parse project file:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Parse a YAML project file (read-only backward compat). */
export function parseProjectYaml(
  content: string,
  projectFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    const raw = parseYaml(content) as RawManuscript | null;
    return raw ? rawToManuscriptData(raw, projectFileUri) : null;
  } catch (err) {
    console.warn('[NovelTools] Failed to parse YAML project file:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Merge consecutive chapters that share the same folder into one chapter (preserves scene order).
 * Handles cases where multiple chapter entries reference the same folder.
 */
function mergeConsecutiveChaptersByFolder(chapters: ChapterData[]): ChapterData[] {
  if (chapters.length <= 1) return chapters;
  const result: ChapterData[] = [];
  let i = 0;
  while (i < chapters.length) {
    const ch = chapters[i];
    const folder = ch.folderPath ?? (ch.scenePaths[0] ? path.dirname(ch.scenePaths[0]).split(path.sep).join('/') : undefined);
    if (!folder || ch.sceneUris.length === 0) {
      result.push(ch);
      i++;
      continue;
    }
    const merged: ChapterData = {
      title: ch.title,
      sceneUris: [...ch.sceneUris],
      scenePaths: [...ch.scenePaths],
      folderPath: folder,
    };
    i++;
    while (i < chapters.length) {
      const next = chapters[i];
      const nextFolder = next.folderPath ?? (next.scenePaths[0] ? path.dirname(next.scenePaths[0]).split(path.sep).join('/') : undefined);
      if (nextFolder !== folder || next.sceneUris.length === 0) break;
      merged.sceneUris.push(...next.sceneUris);
      merged.scenePaths.push(...next.scenePaths);
      if (merged.title == null && next.title != null) merged.title = next.title;
      i++;
    }
    result.push(merged);
  }
  return result;
}

/** Resolve folder chapters by reading .md files from each chapter folder. Call after parseProjectYaml when chapters use folder. */
export async function resolveChapterFolders(
  data: ManuscriptData,
  baseDir: vscode.Uri
): Promise<ManuscriptData> {
  const hasFolder = data.chapters.some((ch) => ch.folderPath);
  if (!hasFolder) return data;

  const chapters: ChapterData[] = [];
  const flatUris: vscode.Uri[] = [];

  for (const ch of data.chapters) {
    if (!ch.folderPath) {
      chapters.push(ch);
      flatUris.push(...ch.sceneUris);
      continue;
    }
    if (ch.scenePaths.length > 0) {
      chapters.push(ch);
      flatUris.push(...ch.sceneUris);
      continue;
    }
    const folderUri = vscode.Uri.joinPath(baseDir, ch.folderPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(folderUri);
    } catch (err) {
      console.warn(`[NovelTools] Could not read chapter folder "${ch.folderPath}":`, err instanceof Error ? err.message : String(err));
      chapters.push({ ...ch, sceneUris: [], scenePaths: [] });
      continue;
    }
    const mdNames = entries
      .filter(([name, type]) => type === vscode.FileType.File && /\.md$/i.test(name))
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const scenePaths = mdNames.map((name) => {
      const rel = ch.folderPath + '/' + name;
      return rel.split(path.sep).join('/');
    });
    const sceneUris = mdNames.map((name) => vscode.Uri.joinPath(folderUri, name));
    const folderName = path.basename(ch.folderPath.replace(/\/$/, '')) || ch.folderPath;
    chapters.push({
      title: ch.title ?? folderName,
      sceneUris,
      scenePaths,
      folderPath: ch.folderPath,
    });
    flatUris.push(...sceneUris);
  }

  return { ...data, chapters, flatUris };
}

/**
 * Prefer folder-based chapters when serializing: if a chapter has no folderPath but all its
 * scenes share one directory relative to baseDir, set folderPath so we write folders not scene lists.
 */
export function dataWithFolderChapters(data: ManuscriptData, baseDir: vscode.Uri): ManuscriptData {
  const base = baseDir.fsPath;
  const chapters: ChapterData[] = data.chapters.map((ch) => {
    if (ch.folderPath || ch.sceneUris.length === 0) return ch;
    const relDirs = ch.sceneUris.map((u) => path.dirname(path.relative(base, u.fsPath)));
    const first = relDirs[0];
    if (!first || relDirs.some((d) => d !== first)) return ch;
    const folderPath = first.split(path.sep).join('/');
    return { ...ch, folderPath };
  });
  return { ...data, chapters };
}

export function serializeToJson(data: ManuscriptData, baseDir?: vscode.Uri): string {
  const toSerialize = baseDir ? dataWithFolderChapters(data, baseDir) : data;
  const raw: RawManuscript = {
    title: toSerialize.title,
    chapters: toSerialize.chapters.map((ch) => {
      if (ch.folderPath) {
        const folderPath = ch.folderPath.replace(/\/$/, '');
        const base = folderPath + '/';
        const scenesRelative = ch.scenePaths.length > 0
          ? ch.scenePaths.map((p) => {
              const normalized = p.split(path.sep).join('/');
              return normalized.startsWith(base) ? normalized.slice(base.length) : normalized;
            })
          : undefined;
        const title = ch.title !== path.basename(folderPath) ? ch.title : undefined;
        if (scenesRelative && scenesRelative.length > 0) {
          return title !== undefined ? { folder: ch.folderPath, title, scenes: scenesRelative } : { folder: ch.folderPath, scenes: scenesRelative };
        }
        return title !== undefined ? { title: ch.title, folder: ch.folderPath } : { folder: ch.folderPath };
      }
      return { title: ch.title, scenes: ch.scenePaths };
    }),
  };
  if (toSerialize.sceneStatus && Object.keys(toSerialize.sceneStatus).length > 0) {
    raw.sceneStatus = toSerialize.sceneStatus;
  }
  if (toSerialize.sceneMetadata && Object.keys(toSerialize.sceneMetadata).length > 0) {
    raw.sceneMetadata = toSerialize.sceneMetadata;
  }
  if (toSerialize.wordCountTarget != null && toSerialize.wordCountTarget > 0) {
    raw.wordCountTarget = toSerialize.wordCountTarget;
  }
  return JSON.stringify(raw, null, 2);
}

export function reorderChapters(data: ManuscriptData, fromIndex: number, toIndex: number): ManuscriptData {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return data;
  const chapters = [...data.chapters];
  const [removed] = chapters.splice(fromIndex, 1);
  chapters.splice(toIndex, 0, removed);
  const flatUris = chapters.flatMap((ch) => ch.sceneUris);
  return { ...data, chapters, flatUris };
}

export function moveScene(
  data: ManuscriptData,
  fromChapterIdx: number,
  fromSceneIdx: number,
  toChapterIdx: number,
  toSceneIdx: number
): ManuscriptData {
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    sceneUris: [...ch.sceneUris],
    scenePaths: [...ch.scenePaths],
  }));
  const fromCh = chapters[fromChapterIdx];
  const toCh = chapters[toChapterIdx];
  if (!fromCh || !toCh) return data;
  const [path] = fromCh.scenePaths.splice(fromSceneIdx, 1);
  const [uri] = fromCh.sceneUris.splice(fromSceneIdx, 1);
  toCh.scenePaths.splice(toSceneIdx, 0, path);
  toCh.sceneUris.splice(toSceneIdx, 0, uri);
  const flatUris = chapters.flatMap((ch) => ch.sceneUris);
  return { ...data, chapters, flatUris };
}

/** Insert a new scene into a chapter at a given index. */
export function insertScene(
  data: ManuscriptData,
  chapterIdx: number,
  sceneIdx: number,
  uri: vscode.Uri,
  scenePath: string
): ManuscriptData {
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    sceneUris: [...ch.sceneUris],
    scenePaths: [...ch.scenePaths],
  }));
  const ch = chapters[chapterIdx];
  if (!ch) return data;
  const idx = Math.max(0, Math.min(sceneIdx, ch.sceneUris.length));
  ch.sceneUris.splice(idx, 0, uri);
  ch.scenePaths.splice(idx, 0, scenePath);
  const flatUris = chapters.flatMap((c) => c.sceneUris);
  return { ...data, chapters, flatUris };
}

/** Remove a single scene from the manuscript. */
export function removeScene(
  data: ManuscriptData,
  chapterIdx: number,
  sceneIdx: number
): ManuscriptData {
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    sceneUris: [...ch.sceneUris],
    scenePaths: [...ch.scenePaths],
  }));
  const ch = chapters[chapterIdx];
  if (!ch || sceneIdx < 0 || sceneIdx >= ch.sceneUris.length) return data;
  const removedPath = ch.scenePaths[sceneIdx];
  ch.sceneUris.splice(sceneIdx, 1);
  ch.scenePaths.splice(sceneIdx, 1);
  const flatUris = chapters.flatMap((c) => c.sceneUris);
  const chaptersFiltered = chapters.filter((c) => c.sceneUris.length > 0);
  let sceneStatus = data.sceneStatus;
  const pathKey = typeof removedPath === 'string' ? removedPath.split(path.sep).join('/') : undefined;
  if (pathKey && sceneStatus && sceneStatus[pathKey]) {
    sceneStatus = { ...sceneStatus };
    delete sceneStatus[pathKey];
    if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
  }
  return { ...data, chapters: chaptersFiltered, flatUris, sceneStatus };
}

/** Remove a chapter and all its scenes from the manuscript. */
export function removeChapter(data: ManuscriptData, chapterIdx: number): ManuscriptData {
  if (chapterIdx < 0 || chapterIdx >= data.chapters.length) return data;
  const chapters = data.chapters.filter((_, i) => i !== chapterIdx);
  const flatUris = chapters.flatMap((ch) => ch.sceneUris);
  return { ...data, chapters, flatUris };
}

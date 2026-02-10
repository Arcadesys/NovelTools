import * as path from 'path';
import * as vscode from 'vscode';
import YAML from 'yaml';

/** Returns scene paths relative to baseDir for serialization (forward slashes for portability). */
export function scenePathsRelativeTo(baseDir: vscode.Uri, sceneUris: vscode.Uri[]): string[] {
  const base = baseDir.fsPath;
  return sceneUris.map((uri) => {
    const rel = path.relative(base, uri.fsPath);
    return rel.split(path.sep).join('/');
  });
}

export type SceneStatus = 'done' | 'drafted' | 'spiked';

export interface ChapterData {
  title?: string;
  sceneUris: vscode.Uri[];
  scenePaths: string[];
}

export interface ManuscriptData {
  title?: string;
  chapters: ChapterData[];
  flatUris: vscode.Uri[];
  projectFileUri: vscode.Uri | null;
  /** Per-scene status: key = relative path (forward slashes), value = done | drafted | spiked. */
  sceneStatus?: Record<string, SceneStatus>;
  /** When set, this project is Longform format; use for round-trip serialization. */
  longformMeta?: {
    format: 'scenes' | 'single';
    sceneFolder: string;
    workflow?: string;
    [key: string]: unknown;
  };
}

interface RawChapter {
  title?: string;
  scenes: string[];
}

interface RawManuscript {
  title?: string;
  chapters: RawChapter[];
  sceneStatus?: Record<string, string>;
}

const INDEX_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * Parse index.yaml: optional YAML frontmatter (--- ... ---) for manuscript title,
 * then a YAML array of scene paths in order.
 */
export function parseIndexYaml(
  content: string,
  indexFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    const match = content.match(INDEX_FRONTMATTER_REGEX);
    let title: string | undefined;
    let body = content;
    let sceneStatus: ManuscriptData['sceneStatus'];
    if (match) {
      const frontmatter = YAML.parse(match[1]) as { title?: string; sceneStatus?: Record<string, string> } | null;
      title = frontmatter?.title != null ? String(frontmatter.title) : undefined;
      const raw = frontmatter?.sceneStatus;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        sceneStatus = {};
        for (const [k, v] of Object.entries(raw)) {
          if (v === 'done' || v === 'drafted' || v === 'spiked') sceneStatus[k] = v;
        }
        if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
      }
      body = match[2].trim();
    }
    const scenePathsRaw = body ? (YAML.parse(body) as unknown) : [];
    const scenePaths = Array.isArray(scenePathsRaw)
      ? scenePathsRaw.map((p) => (typeof p === 'string' ? p : String(p)))
      : [];
    const baseDir = vscode.Uri.joinPath(indexFileUri, '..');
    const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
    const chapters: ChapterData[] = [
      { title: undefined, sceneUris, scenePaths },
    ];
    return {
      title,
      chapters,
      flatUris: sceneUris,
      projectFileUri: indexFileUri,
      sceneStatus,
    };
  } catch {
    return null;
  }
}

/** Flatten Longform nested scenes array to ordered list of scene names (depth-first). */
function flattenLongformScenes(nested: unknown[]): string[] {
  const out: string[] = [];
  for (const item of nested) {
    if (typeof item === 'string') {
      out.push(item.trim());
    } else if (Array.isArray(item)) {
      out.push(...flattenLongformScenes(item));
    }
  }
  return out.filter(Boolean);
}

/** Convert Longform top-level scenes (string | nested array) to our chapters: each top-level item = one chapter. */
function longformScenesToChapters(
  nested: unknown[],
  baseDir: vscode.Uri
): { chapters: ChapterData[]; flatUris: vscode.Uri[] } {
  const chapters: ChapterData[] = [];
  const flatUris: vscode.Uri[] = [];
  for (const item of nested) {
    const names = typeof item === 'string' ? [item.trim()] : Array.isArray(item) ? flattenLongformScenes(item) : [];
    if (names.length === 0) continue;
    const scenePaths = names.map((n) => (n.endsWith('.md') ? n : `${n}.md`));
    const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
    chapters.push({ title: undefined, sceneUris, scenePaths });
    flatUris.push(...sceneUris);
  }
  return { chapters, flatUris };
}

/**
 * Parse Longform index 1:1 (Obsidian Longform plugin format).
 * Index file has frontmatter with a `longform` entry: format, title, workflow, sceneFolder, scenes (nested array).
 * Scene names in YAML are without .md; files live at sceneFolder + name + ".md".
 * @see https://github.com/kevboh/longform/blob/main/docs/INDEX_FILE.md
 */
export function parseLongformStrict(
  content: string,
  indexFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    let raw: Record<string, unknown> | null;
    const match = content.match(INDEX_FRONTMATTER_REGEX);
    if (match) {
      raw = YAML.parse(match[1]) as Record<string, unknown> | null;
    } else {
      raw = YAML.parse(content) as Record<string, unknown> | null;
    }
    if (!raw || typeof raw !== 'object') return null;

    const longform = raw.longform;
    if (!longform || typeof longform !== 'object' || longform === null) return null;
    const lf = longform as Record<string, unknown>;

    const format = lf.format === 'single' || lf.format === 'scenes' ? lf.format : undefined;
    if (!format) return null;

    const title = lf.title != null ? String(lf.title) : undefined;
    const workflow = lf.workflow != null ? String(lf.workflow) : undefined;
    const sceneFolderRaw = lf.sceneFolder;
    const sceneFolder =
      sceneFolderRaw != null ? String(sceneFolderRaw).replace(/^\/+|\/+$/g, '') : '';

    const baseDir =
      sceneFolder !== ''
        ? vscode.Uri.joinPath(indexFileUri, '..', sceneFolder)
        : vscode.Uri.joinPath(indexFileUri, '..');

    const scenesRaw = lf.scenes;
    if (format === 'single') {
      const singleTitle = title ?? path.basename(indexFileUri.fsPath, path.extname(indexFileUri.fsPath));
      return {
        title: singleTitle,
        chapters: [{ title: undefined, sceneUris: [], scenePaths: [] }],
        flatUris: [],
        projectFileUri: indexFileUri,
        longformMeta: { format: 'single', sceneFolder, workflow, ...lf },
      };
    }

    if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
      return {
        title,
        chapters: [{ title: undefined, sceneUris: [], scenePaths: [] }],
        flatUris: [],
        projectFileUri: indexFileUri,
        longformMeta: { format: 'scenes', sceneFolder, workflow, ...lf },
      };
    }

    const { chapters, flatUris } = longformScenesToChapters(scenesRaw, baseDir);
    const chapterTitlesRaw = lf.chapterTitles;
    if (Array.isArray(chapterTitlesRaw) && chapterTitlesRaw.length === chapters.length) {
      for (let i = 0; i < chapters.length; i++) {
        const t = chapterTitlesRaw[i];
        if (t != null && typeof t === 'string') chapters[i].title = t.trim() || undefined;
      }
    }
    const meta: ManuscriptData['longformMeta'] = {
      format: 'scenes',
      sceneFolder,
      workflow,
      ...lf,
    };
    const sceneStatusRaw = lf.sceneStatus;
    let sceneStatus: ManuscriptData['sceneStatus'];
    if (sceneStatusRaw && typeof sceneStatusRaw === 'object' && !Array.isArray(sceneStatusRaw)) {
      sceneStatus = {};
      for (const [k, v] of Object.entries(sceneStatusRaw)) {
        if (v === 'done' || v === 'drafted' || v === 'spiked') sceneStatus[k] = v;
      }
      if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
    }
    return {
      title,
      chapters: chapters.length > 0 ? chapters : [{ title: undefined, sceneUris: [], scenePaths: [] }],
      flatUris,
      projectFileUri: indexFileUri,
      sceneStatus,
      longformMeta: meta,
    };
  } catch {
    return null;
  }
}

/** Chapter header patterns: "1. Title", "2. BORN TO BE WILDER", "-- How it used to be". */
function isChapterHeader(item: string): boolean {
  return /^\d+\.\s+.+/.test(item) || /^--\s+.+/.test(item);
}

/**
 * Parse longform-style index (permissive): root or longform block with title, sceneFolder, scenes.
 * Supports: nested longform: { title, scenes }; scenes as object (chapter -> paths);
 * or flat array with inline chapter headers. Used when parseLongformStrict did not match.
 */
export function parseLongformIndexYaml(
  content: string,
  indexFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    let raw: Record<string, unknown> | null;
    const match = content.match(INDEX_FRONTMATTER_REGEX);
    if (match) {
      raw = YAML.parse(match[1]) as Record<string, unknown> | null;
    } else {
      raw = YAML.parse(content) as Record<string, unknown> | null;
    }
    if (!raw || typeof raw !== 'object') return null;

    const block =
      raw.longform && typeof raw.longform === 'object' && raw.longform !== null
        ? (raw.longform as Record<string, unknown>)
        : raw;

    const title = block.title != null ? String(block.title) : undefined;
    const sceneFolder =
      (block.sceneFolder ?? raw.sceneFolder) != null
        ? String(block.sceneFolder ?? raw.sceneFolder).replace(/^\/+|\/+$/g, '')
        : '';
    const baseDir =
      sceneFolder !== ''
        ? vscode.Uri.joinPath(indexFileUri, '..', sceneFolder)
        : vscode.Uri.joinPath(indexFileUri, '..');

    const chapters: ChapterData[] = [];
    const flatUris: vscode.Uri[] = [];

    const scenesRaw = block.scenes ?? raw.scenes;
    if (Array.isArray(scenesRaw)) {
      const items = scenesRaw.map((p) => (typeof p === 'string' ? p : String(p)).trim()).filter(Boolean);
      let currentChapter: { title: string | undefined; paths: string[] } = { title: undefined, paths: [] };
      for (const item of items) {
        if (isChapterHeader(item)) {
          if (currentChapter.paths.length > 0 || currentChapter.title !== undefined) {
            const scenePaths = currentChapter.paths.map((p) => (p.endsWith('.md') ? p : `${p}.md`));
            const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
            chapters.push({ title: currentChapter.title, sceneUris, scenePaths });
            flatUris.push(...sceneUris);
          }
          currentChapter = {
            title: item.replace(/^(\d+\.\s+|--\s+)/, '').trim() || undefined,
            paths: [],
          };
        } else {
          currentChapter.paths.push(item);
        }
      }
      if (currentChapter.paths.length > 0 || currentChapter.title !== undefined) {
        const scenePaths = currentChapter.paths.map((p) => (p.endsWith('.md') ? p : `${p}.md`));
        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
        chapters.push({ title: currentChapter.title, sceneUris, scenePaths });
        flatUris.push(...sceneUris);
      }
    } else if (scenesRaw && typeof scenesRaw === 'object' && !Array.isArray(scenesRaw)) {
      const entries = Object.entries(scenesRaw);
      for (const [chTitle, list] of entries) {
        const arr = Array.isArray(list) ? list : [];
        const scenePaths = arr
          .map((p) => (typeof p === 'string' ? p : String(p)).trim())
          .filter(Boolean)
          .map((p) => (p.endsWith('.md') ? p : `${p}.md`));
        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
        chapters.push({ title: chTitle, sceneUris, scenePaths });
        flatUris.push(...sceneUris);
      }
    }

    if (chapters.length === 0 && !title) return null;

    const blockForStatus = block.sceneStatus ?? raw.sceneStatus;
    let sceneStatus: ManuscriptData['sceneStatus'];
    if (blockForStatus && typeof blockForStatus === 'object' && !Array.isArray(blockForStatus)) {
      sceneStatus = {};
      for (const [k, v] of Object.entries(blockForStatus)) {
        if (v === 'done' || v === 'drafted' || v === 'spiked') sceneStatus[k] = v;
      }
      if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
    }

    return {
      title,
      chapters:
        chapters.length > 0 ? chapters : [{ title: undefined, sceneUris: [], scenePaths: [] }],
      flatUris,
      projectFileUri: indexFileUri,
      sceneStatus,
    };
  } catch {
    return null;
  }
}

export function parseProjectYaml(
  content: string,
  projectFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    const raw = YAML.parse(content) as RawManuscript | null;
    if (!raw || !Array.isArray(raw.chapters)) return null;
    const baseDir = vscode.Uri.joinPath(projectFileUri, '..');
    const chapters: ChapterData[] = [];
    const flatUris: vscode.Uri[] = [];
    for (const ch of raw.chapters) {
      const scenePaths = Array.isArray(ch.scenes) ? ch.scenes : [];
      const sceneUris = scenePaths.map((p) => {
        const pathStr = typeof p === 'string' ? p : String(p);
        return vscode.Uri.joinPath(baseDir, pathStr);
      });
      chapters.push({ title: ch.title, sceneUris, scenePaths });
      flatUris.push(...sceneUris);
    }
    let sceneStatus: ManuscriptData['sceneStatus'];
    const rawStatus = raw.sceneStatus;
    if (rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus)) {
      sceneStatus = {};
      for (const [k, v] of Object.entries(rawStatus)) {
        if (v === 'done' || v === 'drafted' || v === 'spiked') sceneStatus[k] = v;
      }
      if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
    }
    return {
      title: raw.title,
      chapters,
      flatUris,
      projectFileUri,
      sceneStatus,
    };
  } catch {
    return null;
  }
}

export function serializeToYaml(data: ManuscriptData): string {
  const raw: RawManuscript = {
    title: data.title,
    chapters: data.chapters.map((ch) => ({
      title: ch.title,
      scenes: ch.scenePaths,
    })),
  };
  if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
    raw.sceneStatus = data.sceneStatus;
  }
  return YAML.stringify(raw, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
  });
}

/** Serialize to index.yaml format: frontmatter with title, then YAML array of scene paths. */
export function serializeToIndexYaml(data: ManuscriptData): string {
  const scenePaths = data.chapters.flatMap((ch) => ch.scenePaths);
  const opts = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' as const };
  const front: Record<string, unknown> = { title: data.title ?? '' };
  if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
    front.sceneStatus = data.sceneStatus;
  }
  const frontStr = YAML.stringify(front, opts).trim();
  const body = YAML.stringify(scenePaths, opts).trim();
  return `---\n${frontStr}\n---\n${body}\n`;
}

/** Build Longform nested arrays from our chapters (flat list; no nesting preserved). */
function chaptersToLongformScenes(data: ManuscriptData): (string | string[])[] {
  const items: (string | string[])[] = [];
  for (const ch of data.chapters) {
    const names = ch.scenePaths.map((p) => (p.endsWith('.md') ? p.slice(0, -3) : p));
    if (names.length === 1) items.push(names[0]);
    else if (names.length > 1) items.push(names);
  }
  return items;
}

/** Serialize to Longform index format: frontmatter with longform entry (format, title, workflow, sceneFolder, scenes, chapterTitles). */
export function serializeToLongformYaml(data: ManuscriptData): string {
  const meta = data.longformMeta;
  if (!meta) return serializeToIndexYaml(data);
  const scenes = chaptersToLongformScenes(data);
  const chapterTitles = data.chapters.map((ch) => ch.title ?? '');
  const { format: _f, sceneFolder: _s, workflow: _w, chapterTitles: _ct, ...rest } = meta;
  const longform: Record<string, unknown> = {
    ...rest,
    format: meta.format ?? 'scenes',
    sceneFolder: meta.sceneFolder ?? '/',
    scenes,
    chapterTitles,
  };
  if (data.title != null) longform.title = data.title;
  if (meta.workflow != null) longform.workflow = meta.workflow;
  if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
    longform.sceneStatus = data.sceneStatus;
  }
  const opts = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' as const };
  const front = YAML.stringify({ longform }, opts).trim();
  return `---\n${front}\n---\n`;
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

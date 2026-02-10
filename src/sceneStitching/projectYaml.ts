import * as path from 'path';
import * as vscode from 'vscode';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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
  /** When set, this chapter is a folder: title = folder name, scenes = .md files inside (resolved async). */
  folderPath?: string;
}

export interface ManuscriptData {
  title?: string;
  chapters: ChapterData[];
  flatUris: vscode.Uri[];
  projectFileUri: vscode.Uri | null;
  /** Per-section status (red/yellow/green): key = relative path (forward slashes), value = done | drafted | spiked. Stored in project YAML. */
  sceneStatus?: Record<string, SceneStatus>;
  /** When set, this project is Longform format; use for round-trip serialization. */
  longformMeta?: {
    format: 'scenes' | 'single';
    sceneFolder: string;
    workflow?: string;
    [key: string]: unknown;
  };
}

/** Chapter in YAML: always a folder. string = folder path, or object with folder and optional title. Legacy { scenes } is still read and migrated to folder when all scenes share one directory. */
type RawChapter =
  | string
  | { title?: string; scenes?: string[]; folder?: string };

interface RawManuscript {
  title?: string;
  chapters: RawChapter[];
  /** Section status (red/yellow/green): done | drafted | spiked per relative path. */
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
      const frontmatter = parseYaml(match[1]) as { title?: string; sceneStatus?: Record<string, string> } | null;
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
    const scenePathsRaw = body ? (parseYaml(body) as unknown) : [];
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
      raw = parseYaml(match[1]) as Record<string, unknown> | null;
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'projectYaml.ts:parseLongformStrict',message:'Frontmatter regex did not match',data:{contentStarts:content.slice(0,80)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      raw = parseYaml(content) as Record<string, unknown> | null;
      // #endregion
    }
    if (!raw || typeof raw !== 'object') {
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'projectYaml.ts:parseLongformStrict',message:'Return null: no raw object',data:{match:!!match,frontLen:match?match[1].length:0},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      return null;
    }
    const longform = raw.longform;
    if (!longform || typeof longform !== 'object' || longform === null) {
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'projectYaml.ts:parseLongformStrict',message:'Return null: no longform',data:{hasLongform:!!raw.longform},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      return null;
    }
    // #endregion
    const lf = longform as Record<string, unknown>;

    const format = lf.format === 'single' || lf.format === 'scenes' ? lf.format : undefined;
    // #region agent log
    if (!format) {
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'projectYaml.ts:parseLongformStrict',message:'Return null: no format',data:{formatVal:lf.format},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      return null;
    }
    // #endregion

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
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'projectYaml.ts:parseLongformStrict',message:'Return null: exception',data:{err:String(e)},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    return null;
    // #endregion
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
      raw = parseYaml(match[1]) as Record<string, unknown> | null;
    } else {
      raw = parseYaml(content) as Record<string, unknown> | null;
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

export function parseProjectYaml(
  content: string,
  projectFileUri: vscode.Uri
): ManuscriptData | null {
  try {
    const raw = parseYaml(content) as RawManuscript | null;
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
          // flatUris filled by resolveChapterFolders
        }
      } else {
        const scenePaths = ch.scenes ?? [];
        const sceneUris = scenePaths.map((p) => {
          const pathStr = typeof p === 'string' ? p : String(p);
          return vscode.Uri.joinPath(baseDir, pathStr);
        });
        // Migrate to folder shape when all scenes share one directory so we always write folder on save
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
        if (v === 'done' || v === 'drafted' || v === 'spiked') sceneStatus[k] = v;
      }
      if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
    }
    const mergedChapters = mergeConsecutiveChaptersByFolder(chapters);
    const mergedFlatUris = mergedChapters.flatMap((ch) => ch.sceneUris);
    return {
      title: raw.title,
      chapters: mergedChapters,
      flatUris: mergedFlatUris,
      projectFileUri,
      sceneStatus,
    };
  } catch {
    return null;
  }
}

/**
 * Merge consecutive chapters that share the same folder into one chapter (preserves scene order).
 * Use when YAML has multiple "scenes" blocks per folder (e.g. one for title scene, one for the rest).
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
    } catch {
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

export function serializeToYaml(data: ManuscriptData, baseDir?: vscode.Uri): string {
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
  return stringifyYaml(raw, {
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
  const frontStr = stringifyYaml(front, opts).trim();
  const body = stringifyYaml(scenePaths, opts).trim();
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
  const front = stringifyYaml({ longform }, opts).trim();
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

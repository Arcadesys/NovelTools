import type {
  ManuscriptData,
  ChapterData,
  SceneStatus,
  SceneMetadataEntry,
  CharacterEntry,
  LocationEntry,
} from './types';

// ---------------------------------------------------------------------------
// Raw JSON types (mirrors the on-disk noveltools.json format)
// ---------------------------------------------------------------------------

type RawChapter =
  | string
  | { title?: string; scenes?: string[]; folder?: string };

interface RawSceneMetadata {
  synopsis?: string;
  pov?: string;
  setting?: string;
  timeline?: string;
  tags?: string[];
}

interface RawManuscript {
  title?: string;
  chapters: RawChapter[];
  sceneStatus?: Record<string, string>;
  sceneMetadata?: Record<string, RawSceneMetadata>;
  wordCountTarget?: number;
  characters?: Array<{ name: string; description?: string }>;
  locations?: Array<{ name: string; description?: string }>;
}

// ---------------------------------------------------------------------------
// Path helpers (no `path` module — works in browser-like environments too)
// ---------------------------------------------------------------------------

function posixDirname(p: string): string {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return idx === 0 ? '/' : '.';
  return p.slice(0, idx);
}

function posixBasename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

function posixJoin(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '.';
}

// ---------------------------------------------------------------------------
// Normalise raw chapter entries
// ---------------------------------------------------------------------------

function normalizeRawChapter(ch: RawChapter): {
  title?: string;
  scenes?: string[];
  folder?: string;
} {
  if (typeof ch === 'string') {
    const folder = ch.trim();
    return folder ? { folder } : { scenes: [] };
  }
  const obj = ch as { title?: string; scenes?: string[]; folder?: string };
  if (obj.folder != null && String(obj.folder).trim() !== '') {
    const folder = String(obj.folder).trim();
    const scenes = Array.isArray(obj.scenes)
      ? obj.scenes.map((p) => (typeof p === 'string' ? p : String(p)))
      : undefined;
    return { title: obj.title, folder, scenes };
  }
  return {
    title: obj.title,
    scenes: Array.isArray(obj.scenes)
      ? obj.scenes.map((p) => (typeof p === 'string' ? p : String(p)))
      : [],
  };
}

// ---------------------------------------------------------------------------
// Convert raw on-disk data → ManuscriptData
// ---------------------------------------------------------------------------

function rawToManuscriptData(
  raw: RawManuscript,
  projectFilePath: string
): ManuscriptData | null {
  if (!raw || !Array.isArray(raw.chapters)) return null;

  const baseDir = posixDirname(projectFilePath);

  const chapters: ChapterData[] = [];

  for (const rawCh of raw.chapters) {
    const ch = normalizeRawChapter(rawCh);

    if (ch.folder !== undefined) {
      const folderPath = ch.folder.replace(/\/$/, '');
      const folderName = posixBasename(folderPath) || folderPath;
      const hasCustomScenes = Array.isArray(ch.scenes) && ch.scenes!.length > 0;

      if (hasCustomScenes) {
        const scenePaths = ch.scenes!.map((s) => {
          const str = typeof s === 'string' ? s : String(s);
          // If it looks like an absolute or already-pathed scene, use as-is;
          // otherwise prefix with the folder.
          if (str.includes('/')) return str;
          return folderPath + '/' + str;
        });
        chapters.push({
          title: ch.title ?? folderName,
          scenePaths,
          folderPath,
        });
      } else {
        // Folder-only chapter: scenes will be resolved later by resolveChapterFolders
        chapters.push({
          title: ch.title ?? folderName,
          scenePaths: [],
          folderPath,
        });
      }
    } else {
      const scenePaths = (ch.scenes ?? []).map((p) =>
        typeof p === 'string' ? p : String(p)
      );

      // Detect shared folder
      const relDirs = scenePaths.map((p) => posixDirname(p));
      const firstDir = relDirs[0];
      const allSameDir =
        firstDir !== undefined &&
        firstDir !== '.' &&
        relDirs.every((d) => d === firstDir);

      if (allSameDir && scenePaths.length > 0) {
        const folderName =
          posixBasename(firstDir.replace(/\/$/, '')) || firstDir;
        chapters.push({
          title: ch.title ?? folderName,
          scenePaths,
          folderPath: firstDir,
        });
      } else {
        chapters.push({ title: ch.title, scenePaths });
      }
    }
  }

  const mergedChapters = mergeConsecutiveChaptersByFolder(chapters);

  // Parse sceneStatus
  let sceneStatus: ManuscriptData['sceneStatus'];
  const rawStatus = raw.sceneStatus;
  if (rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus)) {
    sceneStatus = {};
    for (const [k, v] of Object.entries(rawStatus)) {
      if (
        v === 'drafted' ||
        v === 'revision' ||
        v === 'review' ||
        v === 'done' ||
        v === 'spiked' ||
        v === 'cut'
      ) {
        sceneStatus[k] = v as SceneStatus;
      }
    }
    if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
  }

  // Parse sceneMetadata
  let sceneMetadata: ManuscriptData['sceneMetadata'];
  const rawMeta = raw.sceneMetadata;
  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    sceneMetadata = {};
    for (const [k, v] of Object.entries(rawMeta)) {
      if (v && typeof v === 'object') {
        const entry: SceneMetadataEntry = {};
        if (typeof v.synopsis === 'string') entry.synopsis = v.synopsis;
        if (typeof v.pov === 'string') entry.pov = v.pov;
        if (typeof v.setting === 'string') entry.setting = v.setting;
        if (typeof v.timeline === 'string') entry.timeline = v.timeline;
        if (Array.isArray(v.tags))
          entry.tags = v.tags.filter((t): t is string => typeof t === 'string');
        if (Object.keys(entry).length > 0) sceneMetadata[k] = entry;
      }
    }
    if (Object.keys(sceneMetadata).length === 0) sceneMetadata = undefined;
  }

  const wordCountTarget =
    typeof raw.wordCountTarget === 'number' && raw.wordCountTarget > 0
      ? raw.wordCountTarget
      : undefined;

  let characters: CharacterEntry[] | undefined;
  if (Array.isArray(raw.characters)) {
    characters = raw.characters
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        ...(typeof c.description === 'string'
          ? { description: c.description }
          : {}),
      }));
    if (characters.length === 0) characters = undefined;
  }

  let locations: LocationEntry[] | undefined;
  if (Array.isArray(raw.locations)) {
    locations = raw.locations
      .filter((l) => l && typeof l.name === 'string' && l.name.trim())
      .map((l) => ({
        name: l.name.trim(),
        ...(typeof l.description === 'string'
          ? { description: l.description }
          : {}),
      }));
    if (locations.length === 0) locations = undefined;
  }

  const flatPaths = mergedChapters.flatMap((c) => c.scenePaths);

  return {
    title: raw.title,
    chapters: mergedChapters,
    flatPaths,
    projectFilePath,
    sceneStatus,
    sceneMetadata,
    wordCountTarget,
    characters,
    locations,
  };
}

// ---------------------------------------------------------------------------
// Merge consecutive chapters sharing the same folder
// ---------------------------------------------------------------------------

function mergeConsecutiveChaptersByFolder(chapters: ChapterData[]): ChapterData[] {
  if (chapters.length <= 1) return chapters;

  const result: ChapterData[] = [];
  let i = 0;

  while (i < chapters.length) {
    const ch = chapters[i];
    const folder =
      ch.folderPath ??
      (ch.scenePaths[0] ? posixDirname(ch.scenePaths[0]) : undefined);

    if (!folder || ch.scenePaths.length === 0) {
      result.push(ch);
      i++;
      continue;
    }

    const merged: ChapterData = {
      title: ch.title,
      scenePaths: [...ch.scenePaths],
      folderPath: folder,
    };
    i++;

    while (i < chapters.length) {
      const next = chapters[i];
      const nextFolder =
        next.folderPath ??
        (next.scenePaths[0] ? posixDirname(next.scenePaths[0]) : undefined);
      if (nextFolder !== folder || next.scenePaths.length === 0) break;
      merged.scenePaths.push(...next.scenePaths);
      if (merged.title == null && next.title != null) merged.title = next.title;
      i++;
    }

    result.push(merged);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a JSON noveltools.json project file.
 * @param content  Raw file content string.
 * @param projectFilePath  Vault-relative path to the project file.
 */
export function parseProjectJson(
  content: string,
  projectFilePath: string
): ManuscriptData | null {
  try {
    const raw = JSON.parse(content) as RawManuscript | null;
    return raw ? rawToManuscriptData(raw, projectFilePath) : null;
  } catch (err) {
    console.warn(
      '[NovelTools] Failed to parse project file:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Serialize ManuscriptData back to the noveltools.json format.
 * Output is compatible with the VS Code extension.
 */
export function serializeToJson(data: ManuscriptData): string {
  const raw: RawManuscript = {
    title: data.title,
    chapters: data.chapters.map((ch) => {
      if (ch.folderPath) {
        const folderPath = ch.folderPath.replace(/\/$/, '');
        const base = folderPath + '/';
        const scenesRelative =
          ch.scenePaths.length > 0
            ? ch.scenePaths.map((p) =>
                p.startsWith(base) ? p.slice(base.length) : p
              )
            : undefined;
        const folderName = posixBasename(folderPath) || folderPath;
        // Omit title if it matches the folder name (avoid redundant data)
        const titleToWrite =
          ch.title !== undefined && ch.title !== folderName
            ? ch.title
            : undefined;

        if (scenesRelative && scenesRelative.length > 0) {
          return titleToWrite !== undefined
            ? { folder: ch.folderPath, title: titleToWrite, scenes: scenesRelative }
            : { folder: ch.folderPath, scenes: scenesRelative };
        }
        return titleToWrite !== undefined
          ? { title: ch.title, folder: ch.folderPath }
          : { folder: ch.folderPath };
      }
      return { title: ch.title, scenes: ch.scenePaths };
    }),
  };

  if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
    raw.sceneStatus = data.sceneStatus;
  }
  if (data.sceneMetadata && Object.keys(data.sceneMetadata).length > 0) {
    raw.sceneMetadata = data.sceneMetadata;
  }
  if (data.wordCountTarget != null && data.wordCountTarget > 0) {
    raw.wordCountTarget = data.wordCountTarget;
  }
  if (data.characters && data.characters.length > 0) {
    raw.characters = data.characters;
  }
  if (data.locations && data.locations.length > 0) {
    raw.locations = data.locations;
  }

  return JSON.stringify(raw, null, 2);
}

// ---------------------------------------------------------------------------
// Mutation helpers (parallel to VS Code extension)
// ---------------------------------------------------------------------------

export function reorderChapters(
  data: ManuscriptData,
  fromIndex: number,
  toIndex: number
): ManuscriptData {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return data;
  const chapters = [...data.chapters];
  const [removed] = chapters.splice(fromIndex, 1);
  chapters.splice(toIndex, 0, removed);
  const flatPaths = chapters.flatMap((ch) => ch.scenePaths);
  return { ...data, chapters, flatPaths };
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
    scenePaths: [...ch.scenePaths],
  }));
  const fromCh = chapters[fromChapterIdx];
  const toCh = chapters[toChapterIdx];
  if (!fromCh || !toCh) return data;

  const [scenePath] = fromCh.scenePaths.splice(fromSceneIdx, 1);
  toCh.scenePaths.splice(toSceneIdx, 0, scenePath);

  const flatPaths = chapters.flatMap((ch) => ch.scenePaths);
  return { ...data, chapters, flatPaths };
}

export function insertScene(
  data: ManuscriptData,
  chapterIdx: number,
  sceneIdx: number,
  scenePath: string
): ManuscriptData {
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: [...ch.scenePaths],
  }));
  const ch = chapters[chapterIdx];
  if (!ch) return data;
  const idx = Math.max(0, Math.min(sceneIdx, ch.scenePaths.length));
  ch.scenePaths.splice(idx, 0, scenePath);
  const flatPaths = chapters.flatMap((c) => c.scenePaths);
  return { ...data, chapters, flatPaths };
}

export function removeScene(
  data: ManuscriptData,
  chapterIdx: number,
  sceneIdx: number
): ManuscriptData {
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: [...ch.scenePaths],
  }));
  const ch = chapters[chapterIdx];
  if (!ch || sceneIdx < 0 || sceneIdx >= ch.scenePaths.length) return data;

  const [removedPath] = ch.scenePaths.splice(sceneIdx, 1);
  const flatPaths = chapters.flatMap((c) => c.scenePaths);

  // Remove status entry for the removed scene
  let sceneStatus = data.sceneStatus;
  if (sceneStatus && removedPath && sceneStatus[removedPath]) {
    sceneStatus = { ...sceneStatus };
    delete sceneStatus[removedPath];
    if (Object.keys(sceneStatus).length === 0) sceneStatus = undefined;
  }

  return { ...data, chapters, flatPaths, sceneStatus };
}

export function removeChapter(
  data: ManuscriptData,
  chapterIdx: number
): ManuscriptData {
  if (chapterIdx < 0 || chapterIdx >= data.chapters.length) return data;
  const chapters = data.chapters.filter((_, i) => i !== chapterIdx);
  const flatPaths = chapters.flatMap((ch) => ch.scenePaths);
  return { ...data, chapters, flatPaths };
}

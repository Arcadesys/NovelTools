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
}

interface RawChapter {
  title?: string;
  scenes: string[];
}

interface RawManuscript {
  title?: string;
  chapters: RawChapter[];
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
        const path = typeof p === 'string' ? p : String(p);
        return vscode.Uri.joinPath(baseDir, path);
      });
      chapters.push({ title: ch.title, sceneUris, scenePaths });
      flatUris.push(...sceneUris);
    }
    return {
      title: raw.title,
      chapters,
      flatUris,
      projectFileUri,
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
  return YAML.stringify(raw, { lineWidth: 0 });
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

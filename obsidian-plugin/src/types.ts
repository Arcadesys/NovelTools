export type SceneStatus = 'drafted' | 'revision' | 'review' | 'done' | 'spiked' | 'cut';

export interface ChapterData {
  title?: string;
  scenePaths: string[]; // vault-relative paths
  folderPath?: string;  // vault-relative folder path
}

export interface SceneMetadataEntry {
  synopsis?: string;
  pov?: string;
  setting?: string;
  timeline?: string;
  tags?: string[];
}

export interface CharacterEntry {
  name: string;
  description?: string;
}

export interface LocationEntry {
  name: string;
  description?: string;
}

export interface ManuscriptData {
  title?: string;
  chapters: ChapterData[];
  flatPaths: string[];            // vault-relative paths of all scenes in order
  projectFilePath: string | null; // vault-relative path to noveltools.json
  sceneStatus?: Record<string, SceneStatus>;
  sceneMetadata?: Record<string, SceneMetadataEntry>;
  wordCountTarget?: number;
  characters?: CharacterEntry[];
  locations?: LocationEntry[];
}

export interface NovelToolsSettings {
  projectFile: string;
  chapterGrouping: 'flat' | 'folder';
  wordCountStripMarkdown: boolean;
  wordCountScope: 'project' | 'workspace';
  chapterContextPath: string;
  stitchedSceneHeadingMode: 'fileName' | 'sceneNumber' | 'none';
}

export const DEFAULT_SETTINGS: NovelToolsSettings = {
  projectFile: 'noveltools.json',
  chapterGrouping: 'flat',
  wordCountStripMarkdown: false,
  wordCountScope: 'project',
  chapterContextPath: '.noveltools/chapter-context.md',
  stitchedSceneHeadingMode: 'fileName',
};

import * as vscode from 'vscode';

const SECTION = 'noveltools';

export type StitchedSceneHeadingMode = 'fileName' | 'sceneNumber' | 'none';

export function getProjectFile(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('projectFile') ?? 'noveltools.json';
}

export function getSceneFiles(): string[] {
  return vscode.workspace.getConfiguration(SECTION).get<string[]>('sceneFiles') ?? [];
}

export function getSceneGlob(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('sceneGlob') ?? '**/*.md';
}

export function getChapterGrouping(): 'flat' | 'folder' {
  const grouping = vscode.workspace.getConfiguration(SECTION).get<string>('chapterGrouping') ?? 'flat';
  return grouping === 'folder' ? 'folder' : 'flat';
}

export function getWordCountStripMarkdown(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>('wordCount.stripMarkdown') ?? false;
}

export function getWordCountManuscriptScope(): 'project' | 'workspace' {
  const scope = vscode.workspace.getConfiguration(SECTION).get<string>('wordCount.manuscriptScope') ?? 'project';
  return scope === 'workspace' ? 'workspace' : 'project';
}

export function getChapterContextPath(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('chapterContextPath') ?? '.noveltools/chapter-context.md';
}

export function getStitchedSceneHeadingMode(): StitchedSceneHeadingMode {
  const mode = vscode.workspace.getConfiguration(SECTION).get<string>('stitched.sceneHeadingMode') ?? 'fileName';
  if (mode === 'sceneNumber' || mode === 'none') return mode;
  return 'fileName';
}

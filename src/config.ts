import * as vscode from 'vscode';

const SECTION = 'noveltools';

export function getProjectFile(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('projectFile') ?? 'noveltools.yaml';
}

export function getSceneFiles(): string[] {
  return vscode.workspace.getConfiguration(SECTION).get<string[]>('sceneFiles') ?? [];
}

export function getSceneGlob(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('sceneGlob') ?? '**/*.md';
}

export function getTypewriterSoundEnabled(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>('typewriterSound.enabled') ?? true;
}

export function getTypewriterSoundVolume(): number {
  return vscode.workspace.getConfiguration(SECTION).get<number>('typewriterSound.volume') ?? 0.3;
}

export function getTypewriterSoundPath(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('typewriterSound.path') ?? '';
}

export function getWordCountStripMarkdown(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>('wordCount.stripMarkdown') ?? false;
}

export function getWordCountManuscriptScope(): 'project' | 'workspace' {
  const scope = vscode.workspace.getConfiguration(SECTION).get<string>('wordCount.manuscriptScope') ?? 'project';
  return scope === 'workspace' ? 'workspace' : 'project';
}

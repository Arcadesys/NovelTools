import * as path from 'path';
import * as vscode from 'vscode';
import type { StitchedSceneHeadingMode } from '../config';

function fileNameHeading(uri: vscode.Uri, sceneIndex: number): string {
  const stem = path.basename(uri.fsPath, path.extname(uri.fsPath));
  const pretty = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return pretty || `Scene ${sceneIndex + 1}`;
}

export function buildSceneHeadingText(
  uri: vscode.Uri,
  sceneIndex: number,
  mode: StitchedSceneHeadingMode
): string {
  if (mode === 'none') return '';
  if (mode === 'sceneNumber') return `Scene ${sceneIndex + 1}`;
  return fileNameHeading(uri, sceneIndex);
}

export function buildSceneHeadingLine(
  chapterIndex: number,
  sceneIndex: number,
  headingText: string
): string {
  const indexLabel = `${chapterIndex + 1}.${sceneIndex + 1}`;
  return headingText.trim().length > 0 ? `### ${indexLabel} ${headingText}` : `### ${indexLabel}`;
}

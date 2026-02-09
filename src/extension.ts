import * as vscode from 'vscode';
import { registerWordCount } from './wordCount/statusBar';
import { registerNavigation } from './sceneStitching/navigation';
import { registerMoveChapter } from './sceneStitching/moveChapter';
import { registerStitchedProvider } from './sceneStitching/stitchedProvider';
import { registerManuscriptView } from './sceneStitching/manuscriptView';
import { registerTypewriterSound } from './typewriter/soundController';

export function activate(context: vscode.ExtensionContext): void {
  registerWordCount(context);
  registerNavigation(context);
  registerMoveChapter(context);
  registerStitchedProvider(context);
  registerManuscriptView(context);
  registerTypewriterSound(context);
}

export function deactivate(): void {}

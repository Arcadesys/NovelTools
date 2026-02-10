import * as vscode from 'vscode';
import { registerWordCount } from './wordCount/statusBar';
import { registerNavigation } from './sceneStitching/navigation';
import { registerMoveChapter } from './sceneStitching/moveChapter';
import { registerMoveScene } from './sceneStitching/moveScene';
import { registerAddScene } from './sceneStitching/addScene';
import { registerStitchedProvider } from './sceneStitching/stitchedProvider';
import { registerManuscriptView } from './sceneStitching/manuscriptView';
import { registerTypewriterSound } from './typewriter/soundController';
import { initSceneList } from './sceneStitching/sceneList';

export function activate(context: vscode.ExtensionContext): void {
  initSceneList(context);
  registerWordCount(context);
  registerNavigation(context);
  registerMoveChapter(context);
  registerMoveScene(context);
  registerAddScene(context);
  registerStitchedProvider(context);
  registerManuscriptView(context);
  registerTypewriterSound(context);
}

export function deactivate(): void {}

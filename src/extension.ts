import * as vscode from 'vscode';
import { registerWordCount } from './wordCount/statusBar';
import { registerNavigation } from './sceneStitching/navigation';
import { registerMoveChapter } from './sceneStitching/moveChapter';
import { registerMoveScene } from './sceneStitching/moveScene';
import { registerAddScene } from './sceneStitching/addScene';
import { registerAddChapter } from './sceneStitching/addChapter';
import { registerStitchedProvider } from './sceneStitching/stitchedProvider';
import { registerManuscriptView } from './sceneStitching/manuscriptView';
import { registerSceneCardsView } from './sceneStitching/sceneCardsView';
import { registerSceneOutlineEditor } from './sceneStitching/sceneOutlineEditor';
import { initSceneList } from './sceneStitching/sceneList';
import { registerNewProject } from './sceneStitching/newProject';
import { registerMigrateToJson } from './sceneStitching/migrateToJson';

function safeRegister(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[NovelTools] Failed to initialize ${name}:`, err);
    void vscode.window.showErrorMessage(`NovelTools startup issue in "${name}". ${detail}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  initSceneList(context);
  safeRegister('Manuscript View', () => registerManuscriptView(context));
  safeRegister('Scene Cards View', () => registerSceneCardsView(context));
  safeRegister('Scene Outline Editor', () => registerSceneOutlineEditor(context));
  safeRegister('Stitched Provider', () => registerStitchedProvider(context));
  safeRegister('Navigation', () => registerNavigation(context));
  safeRegister('Move Chapter', () => registerMoveChapter(context));
  safeRegister('Move Scene', () => registerMoveScene(context));
  safeRegister('Add Scene', () => registerAddScene(context));
  safeRegister('Add Chapter', () => registerAddChapter(context));
  safeRegister('Word Count', () => registerWordCount(context));
  safeRegister('New Project', () => registerNewProject(context));
  safeRegister('Migrate to JSON', () => registerMigrateToJson(context));
}

export function deactivate(): void {}

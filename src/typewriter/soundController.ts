import * as vscode from 'vscode';
import {
  getTypewriterSoundEnabled,
  getTypewriterSoundVolume,
  getTypewriterSoundPath,
} from '../config';
import {
  ensureSoundWebview,
  playTypewriterSound,
  updateSoundWebviewContent,
} from './soundWebview';

const THROTTLE_MS = 100;
const MAX_CHANGE_LENGTH = 20;

let lastPlayTime = 0;

function getSoundWebviewUri(
  context: vscode.ExtensionContext,
  webviewPanel: vscode.WebviewPanel
): vscode.Uri | null {
  const customPath = getTypewriterSoundPath();
  if (customPath) {
    try {
      return webviewPanel.webview.asWebviewUri(vscode.Uri.file(customPath));
    } catch {
      // fall through to bundled
    }
  }
  try {
    const wav = vscode.Uri.joinPath(context.extensionUri, 'media', 'typewriter.wav');
    return webviewPanel.webview.asWebviewUri(wav);
  } catch {
    return null;
  }
}

export function registerTypewriterSound(context: vscode.ExtensionContext): void {
  let soundPanel: vscode.WebviewPanel | undefined;

  function tryPlay(): void {
    if (!getTypewriterSoundEnabled()) return;
    const now = Date.now();
    if (now - lastPlayTime < THROTTLE_MS) return;
    lastPlayTime = now;
    const volume = getTypewriterSoundVolume();
    if (!soundPanel) {
      soundPanel = ensureSoundWebview(context, {
        volume,
        soundWebviewUri: null,
      });
      soundPanel.onDidDispose(() => {
        soundPanel = undefined;
      });
    }
    const uri = soundPanel ? getSoundWebviewUri(context, soundPanel) : null;
    playTypewriterSound(context, { volume, soundWebviewUri: uri });
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || e.document.uri.toString() !== editor.document.uri.toString()) return;
      if (e.document.languageId !== 'markdown') return;
      let totalLen = 0;
      for (const change of e.contentChanges) {
        totalLen += change.text.length;
        if (change.rangeLength > 0) totalLen += change.rangeLength;
      }
      if (totalLen > MAX_CHANGE_LENGTH) return;
      tryPlay();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('noveltools.typewriterSound') && soundPanel) {
        const volume = getTypewriterSoundVolume();
        const uri = getSoundWebviewUri(context, soundPanel);
        updateSoundWebviewContent(volume, uri);
      }
    })
  );
}

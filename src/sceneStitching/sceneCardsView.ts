import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import {
  clearManuscriptCache,
  findAllIndexYaml,
  getManuscript,
  type ManuscriptResult,
} from './sceneList';
import { buildProjectYamlToFile, writeProjectYaml } from './projectFile';
import {
  moveScene as moveSceneInData,
  reorderChapters,
  type SceneStatus,
} from './projectYaml';

const VIEW_ID = 'noveltools.manuscript';

const STATUS_LABEL: Record<SceneStatus, string> = {
  done: 'Done',
  drafted: 'Drafted',
  spiked: 'Spiked',
};

const STATUS_CLASS: Record<SceneStatus, string> = {
  done: 'status-done',
  drafted: 'status-drafted',
  spiked: 'status-spiked',
};

const COMMAND_WHITELIST = new Set([
  'noveltools.refreshManuscript',
  'noveltools.refreshSceneCards',
  'noveltools.openProjectYaml',
  'noveltools.buildProjectYaml',
  'noveltools.openStitchedManuscript',
  'noveltools.showQuickStart',
  'noveltools.openSettings',
  'noveltools.selectDocument',
  'noveltools.convertLongformToProjectYaml',
]);

interface SceneCardModel {
  chapterIndex: number;
  sceneIndex: number;
  title: string;
  relativePath: string;
  uri: string;
  previewLines: string[];
  status?: SceneStatus;
}

interface ChapterCardModel {
  chapterIndex: number;
  title: string;
  scenes: SceneCardModel[];
}

interface SceneCardsModel {
  manuscriptTitle: string;
  hasData: boolean;
  hasProjectFile: boolean;
  hasMultipleDocuments: boolean;
  chapterCount: number;
  sceneCount: number;
  chapters: ChapterCardModel[];
}

interface RunCommandMessage {
  type: 'runCommand';
  command: string;
}

interface OpenSceneMessage {
  type: 'openScene';
  uri: string;
}

interface ReorderSceneMessage {
  type: 'reorderScene';
  fromChapterIndex: number;
  fromSceneIndex: number;
  toChapterIndex: number;
  toSceneIndex: number;
}

interface ReorderChapterMessage {
  type: 'reorderChapter';
  fromChapterIndex: number;
  toChapterIndex: number;
}

type WebviewMessage =
  | RunCommandMessage
  | OpenSceneMessage
  | ReorderSceneMessage
  | ReorderChapterMessage;

export function registerSceneCardsView(context: vscode.ExtensionContext): void {
  const provider = new SceneCardsViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.refreshSceneCards', async () => {
      clearManuscriptCache();
      await provider.refresh();
    })
  );

  const refresh = (): void => {
    clearManuscriptCache();
    void provider.refresh();
  };

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isRelevantDocument(doc.uri)) refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles((event) => {
      if (event.files.some((uri) => isRelevantDocument(uri))) refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((event) => {
      if (event.files.some((uri) => isRelevantDocument(uri))) refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      if (event.files.some((file) => isRelevantDocument(file.newUri) || isRelevantDocument(file.oldUri))) {
        refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('noveltools')) refresh();
    })
  );
}

class SceneCardsViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined;
    });
    webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    const webview = this.view.webview;
    const nonce = createNonce();
    try {
      const model = await buildSceneCardsModel();
      await vscode.commands.executeCommand('setContext', 'noveltools.hasProjectFile', model.hasProjectFile);
      await vscode.commands.executeCommand('setContext', 'noveltools.hasScenes', model.sceneCount > 0);
      await vscode.commands.executeCommand('setContext', 'noveltools.hasMultipleDocuments', model.hasMultipleDocuments);
      webview.html = renderHtml(webview, nonce, model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      webview.html = renderErrorHtml(webview, nonce, message);
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') return;
    const typed = message as WebviewMessage;

    if (typed.type === 'openScene' && typeof typed.uri === 'string') {
      const uri = vscode.Uri.parse(typed.uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });
      return;
    }

    if (typed.type === 'runCommand' && typeof typed.command === 'string' && COMMAND_WHITELIST.has(typed.command)) {
      await vscode.commands.executeCommand(typed.command);
      clearManuscriptCache();
      await this.refresh();
      return;
    }

    if (
      typed.type === 'reorderScene'
      && Number.isInteger(typed.fromChapterIndex)
      && Number.isInteger(typed.fromSceneIndex)
      && Number.isInteger(typed.toChapterIndex)
      && Number.isInteger(typed.toSceneIndex)
    ) {
      await this.reorderScene(typed);
      return;
    }

    if (
      typed.type === 'reorderChapter'
      && Number.isInteger(typed.fromChapterIndex)
      && Number.isInteger(typed.toChapterIndex)
    ) {
      await this.reorderChapter(typed);
    }
  }

  private async reorderScene(msg: ReorderSceneMessage): Promise<void> {
    const result = await this.ensureWritableManuscript();
    if (!result?.data || !result.projectFileUri) return;

    const data = result.data;
    if (msg.fromChapterIndex < 0 || msg.fromChapterIndex >= data.chapters.length) return;
    const fromChapter = data.chapters[msg.fromChapterIndex];
    if (msg.fromSceneIndex < 0 || msg.fromSceneIndex >= fromChapter.sceneUris.length) return;

    const toChapterIndex = clamp(msg.toChapterIndex, 0, data.chapters.length - 1);
    const toChapter = data.chapters[toChapterIndex];
    let toSceneIndex = clamp(msg.toSceneIndex, 0, toChapter.sceneUris.length);

    if (msg.fromChapterIndex === toChapterIndex && toSceneIndex > msg.fromSceneIndex) {
      toSceneIndex -= 1;
    }
    if (msg.fromChapterIndex === toChapterIndex && toSceneIndex === msg.fromSceneIndex) {
      return;
    }

    const next = moveSceneInData(
      data,
      msg.fromChapterIndex,
      msg.fromSceneIndex,
      toChapterIndex,
      toSceneIndex
    );

    await writeProjectYaml(result.projectFileUri, next);
    clearManuscriptCache(result.projectFileUri);
    await vscode.commands.executeCommand('noveltools.refreshManuscript');
  }

  private async reorderChapter(msg: ReorderChapterMessage): Promise<void> {
    const result = await this.ensureWritableManuscript();
    if (!result?.data || !result.projectFileUri) return;

    const data = result.data;
    if (msg.fromChapterIndex < 0 || msg.fromChapterIndex >= data.chapters.length) return;

    let toChapterIndex = clamp(msg.toChapterIndex, 0, data.chapters.length);
    if (msg.fromChapterIndex < toChapterIndex) {
      toChapterIndex -= 1;
    }
    if (toChapterIndex === msg.fromChapterIndex) return;

    const next = reorderChapters(data, msg.fromChapterIndex, toChapterIndex);
    await writeProjectYaml(result.projectFileUri, next);
    clearManuscriptCache(result.projectFileUri);
    await vscode.commands.executeCommand('noveltools.refreshManuscript');
  }

  private async ensureWritableManuscript(): Promise<ManuscriptResult | null> {
    let result = await getManuscript();
    if (!result.data) return null;

    if (!result.projectFileUri) {
      const targetUri = getConfiguredProjectUri();
      if (!targetUri) {
        await vscode.window.showInformationMessage('Open a workspace folder first.');
        return null;
      }
      await buildProjectYamlToFile(targetUri, result.data);
      clearManuscriptCache();
      result = await getManuscript(targetUri);
    }

    if (!result.data || !result.projectFileUri) return null;
    return result;
  }
}

async function buildSceneCardsModel(): Promise<SceneCardsModel> {
  const [result, allIndex] = await Promise.all([
    getManuscript(),
    findAllIndexYaml(),
  ]);

  if (!result.data) {
    return {
      manuscriptTitle: 'Manuscript',
      hasData: false,
      hasProjectFile: !!result.projectFileUri,
      hasMultipleDocuments: allIndex.length > 1,
      chapterCount: 0,
      sceneCount: 0,
      chapters: [],
    };
  }

  const chapterPromises = result.data.chapters.map(async (chapter, chapterIndex): Promise<ChapterCardModel> => {
    const chapterTitle = chapter.title ?? `Chapter ${chapterIndex + 1}`;
    const baseDir = result.data?.projectFileUri
      ? path.dirname(result.data.projectFileUri.fsPath)
      : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    const scenePromises = chapter.sceneUris.map(async (uri, sceneIndex): Promise<SceneCardModel> => {
      const fallbackPath = baseDir ? path.relative(baseDir, uri.fsPath) : vscode.workspace.asRelativePath(uri);
      const scenePath = chapter.scenePaths[sceneIndex] ?? fallbackPath;
      const pathKey = scenePath.split(path.sep).join('/');
      const status = result.data?.sceneStatus?.[pathKey];
      return {
        chapterIndex,
        sceneIndex,
        title: path.basename(uri.fsPath),
        relativePath: vscode.workspace.asRelativePath(uri),
        uri: uri.toString(),
        previewLines: await readScenePreview(uri),
        status,
      };
    });

    return {
      chapterIndex,
      title: chapterTitle,
      scenes: await Promise.all(scenePromises),
    };
  });

  const chapters = await Promise.all(chapterPromises);
  return {
    manuscriptTitle: result.data.title ?? 'Manuscript',
    hasData: true,
    hasProjectFile: !!result.projectFileUri,
    hasMultipleDocuments: allIndex.length > 1,
    chapterCount: chapters.length,
    sceneCount: chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
    chapters,
  };
}

async function readScenePreview(uri: vscode.Uri): Promise<string[]> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    const preview = extractPreviewLines(text);
    return preview.length > 0 ? preview : ['No text yet.'];
  } catch {
    return ['Unable to read this file.'];
  }
}

function extractPreviewLines(text: string): string[] {
  let content = text.replace(/\r\n/g, '\n');
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---\n', 4);
    if (end >= 0) {
      content = content.slice(end + 5);
    }
  }
  return content
    .split('\n')
    .map((line) => simplifyLine(line))
    .filter((line) => line.length > 0)
    .slice(0, 3);
}

function simplifyLine(line: string): string {
  let value = line.trim();
  if (!value) return '';
  value = value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length > 140) {
    return `${value.slice(0, 137)}...`;
  }
  return value;
}

function renderHtml(webview: vscode.Webview, nonce: string, model: SceneCardsModel): string {
  const chaptersHtml = model.hasData
    ? model.chapters.map((chapter) => renderChapter(chapter)).join('')
    : `<div class="empty-panel">
         <h3>No manuscript data yet</h3>
         <p>Build a project file from your markdown scenes to populate this view.</p>
       </div>`;

  const buildOrOpenLabel = model.hasProjectFile ? 'Open Project YAML' : 'Build Project YAML';
  const buildOrOpenCommand = model.hasProjectFile ? 'noveltools.openProjectYaml' : 'noveltools.buildProjectYaml';
  const documentButton = model.hasMultipleDocuments
    ? '<button class="action-btn" data-action="command" data-command="noveltools.selectDocument">Select Document</button>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Manuscript</title>
  <style>
    :root {
      --nt-radius: 12px;
      --nt-radius-small: 8px;
      --nt-border: var(--vscode-panel-border);
      --nt-bg-soft: var(--vscode-sideBar-background);
      --nt-bg-card: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --nt-accent: var(--vscode-focusBorder);
      --nt-fg-muted: var(--vscode-descriptionForeground);
      --nt-fg-strong: var(--vscode-editor-foreground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--nt-fg-strong);
      background: linear-gradient(180deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
      font: 13px/1.45 var(--vscode-font-family, ui-sans-serif, system-ui, sans-serif);
    }
    .header {
      background: var(--nt-bg-soft);
      border: 1px solid var(--nt-border);
      border-radius: var(--nt-radius);
      padding: 12px;
      margin-bottom: 12px;
    }
    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .title-row h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
      letter-spacing: 0.02em;
    }
    .meta {
      color: var(--nt-fg-muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .submeta {
      color: var(--nt-fg-muted);
      font-size: 11px;
      margin: 0 0 10px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .action-btn {
      border: 1px solid var(--nt-border);
      border-radius: var(--nt-radius-small);
      background: var(--nt-bg-card);
      color: var(--nt-fg-strong);
      font: inherit;
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
    }
    .action-btn:hover {
      border-color: var(--nt-accent);
      background: var(--vscode-list-hoverBackground);
    }
    .chapter {
      margin-bottom: 14px;
      border: 1px solid transparent;
      border-radius: var(--nt-radius);
      padding: 2px;
    }
    .chapter.drag-over {
      border-color: var(--nt-accent);
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
    }
    .chapter-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 0 2px 8px;
      cursor: grab;
      user-select: none;
    }
    .chapter-header h3 {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--nt-fg-muted);
    }
    .chapter-count {
      color: var(--nt-fg-muted);
      font-size: 11px;
    }
    .cards {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      min-height: 4px;
    }
    .scene-card {
      border: 1px solid var(--nt-border);
      border-radius: var(--nt-radius);
      background: var(--nt-bg-card);
      padding: 10px;
      cursor: pointer;
      text-align: left;
      width: 100%;
      color: inherit;
    }
    .scene-card:hover {
      border-color: var(--nt-accent);
      transform: translateY(-1px);
    }
    .scene-card.drag-over {
      border-color: var(--nt-accent);
      box-shadow: inset 0 0 0 1px var(--nt-accent);
    }
    .scene-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .scene-title {
      font-size: 12px;
      font-weight: 620;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scene-path {
      color: var(--nt-fg-muted);
      font-size: 10px;
      margin-bottom: 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scene-preview {
      display: grid;
      gap: 2px;
      font-size: 11px;
      color: var(--vscode-editor-foreground);
    }
    .scene-preview p {
      margin: 0;
      min-height: 1.2em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-pill {
      border-radius: 999px;
      font-size: 10px;
      line-height: 1;
      padding: 4px 6px;
      border: 1px solid transparent;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-done {
      border-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-testing-iconPassed);
    }
    .status-drafted {
      border-color: var(--vscode-testing-iconQueued);
      color: var(--vscode-testing-iconQueued);
    }
    .status-spiked {
      border-color: var(--vscode-testing-iconFailed);
      color: var(--vscode-testing-iconFailed);
    }
    .scene-drop-end,
    .chapter-drop-end {
      border: 1px dashed var(--nt-border);
      border-radius: var(--nt-radius-small);
      color: var(--nt-fg-muted);
      font-size: 10px;
      text-align: center;
      padding: 6px;
      opacity: 0;
      transition: opacity 120ms ease;
      pointer-events: none;
    }
    body.drag-scene .scene-drop-end,
    body.drag-chapter .chapter-drop-end {
      opacity: 1;
      pointer-events: auto;
    }
    .scene-drop-end.drag-over,
    .chapter-drop-end.drag-over {
      border-color: var(--nt-accent);
      color: var(--nt-fg-strong);
      background: var(--vscode-list-hoverBackground);
    }
    .chapter-drop-end {
      margin-top: 8px;
    }
    .empty-panel {
      border: 1px dashed var(--nt-border);
      border-radius: var(--nt-radius);
      background: var(--nt-bg-soft);
      padding: 16px;
    }
    .empty-panel h3 {
      margin: 0 0 6px 0;
      font-size: 13px;
    }
    .empty-panel p {
      margin: 0;
      color: var(--nt-fg-muted);
    }
  </style>
</head>
<body>
  <section class="header">
    <div class="title-row">
      <h2>${escapeHtml(model.manuscriptTitle)}</h2>
      <span class="meta">${model.chapterCount} chapters · ${model.sceneCount} scenes</span>
    </div>
    <p class="submeta">Drag chapter headers or scene cards to reorder.</p>
    <div class="actions">
      <button class="action-btn" data-action="command" data-command="noveltools.refreshManuscript">Refresh</button>
      <button class="action-btn" data-action="command" data-command="${buildOrOpenCommand}">${buildOrOpenLabel}</button>
      <button class="action-btn" data-action="command" data-command="noveltools.openStitchedManuscript">Open Stitched</button>
      <button class="action-btn" data-action="command" data-command="noveltools.showQuickStart">Quick Start</button>
      ${documentButton}
    </div>
  </section>

  ${chaptersHtml}
  <div class="chapter-drop-end" data-drop-kind="chapter-end" data-to-chapter-index="${model.chapterCount}">Drop chapter here to move to end</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const dragState = {
      type: null,
      fromChapterIndex: null,
      fromSceneIndex: null,
    };
    let suppressClickUntil = 0;

    const parseIndex = (raw) => {
      const value = Number(raw);
      return Number.isInteger(value) ? value : null;
    };

    const clearDragClasses = () => {
      document.querySelectorAll('.drag-over').forEach((node) => node.classList.remove('drag-over'));
    };

    const resetDragState = () => {
      dragState.type = null;
      dragState.fromChapterIndex = null;
      dragState.fromSceneIndex = null;
      document.body.classList.remove('drag-scene', 'drag-chapter');
      clearDragClasses();
      suppressClickUntil = Date.now() + 120;
    };

    document.querySelectorAll('[data-action="open-scene"]').forEach((node) => {
      node.addEventListener('click', () => {
        if (Date.now() < suppressClickUntil) return;
        if (document.body.classList.contains('drag-scene') || document.body.classList.contains('drag-chapter')) {
          return;
        }
        const rawUri = node.getAttribute('data-uri');
        if (!rawUri) return;
        vscode.postMessage({ type: 'openScene', uri: decodeURIComponent(rawUri) });
      });
    });

    document.querySelectorAll('[data-action="command"]').forEach((node) => {
      node.addEventListener('click', () => {
        const command = node.getAttribute('data-command');
        if (!command) return;
        vscode.postMessage({ type: 'runCommand', command });
      });
    });

    document.querySelectorAll('[data-drag-kind="scene"]').forEach((node) => {
      node.addEventListener('dragstart', (event) => {
        const fromChapterIndex = parseIndex(node.getAttribute('data-chapter-index'));
        const fromSceneIndex = parseIndex(node.getAttribute('data-scene-index'));
        if (fromChapterIndex === null || fromSceneIndex === null) {
          event.preventDefault();
          return;
        }
        dragState.type = 'scene';
        dragState.fromChapterIndex = fromChapterIndex;
        dragState.fromSceneIndex = fromSceneIndex;
        document.body.classList.add('drag-scene');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(fromChapterIndex) + ':' + String(fromSceneIndex));
        }
      });
      node.addEventListener('dragend', () => {
        setTimeout(resetDragState, 0);
      });
      node.addEventListener('dragover', (event) => {
        if (dragState.type !== 'scene') return;
        event.preventDefault();
        clearDragClasses();
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', (event) => {
        if (dragState.type !== 'scene') return;
        event.preventDefault();
        const toChapterIndex = parseIndex(node.getAttribute('data-chapter-index'));
        const toSceneIndex = parseIndex(node.getAttribute('data-scene-index'));
        if (
          dragState.fromChapterIndex === null
          || dragState.fromSceneIndex === null
          || toChapterIndex === null
          || toSceneIndex === null
        ) {
          resetDragState();
          return;
        }
        vscode.postMessage({
          type: 'reorderScene',
          fromChapterIndex: dragState.fromChapterIndex,
          fromSceneIndex: dragState.fromSceneIndex,
          toChapterIndex,
          toSceneIndex,
        });
        resetDragState();
      });
    });

    document.querySelectorAll('[data-drop-kind="scene-end"]').forEach((node) => {
      node.addEventListener('dragover', (event) => {
        if (dragState.type !== 'scene') return;
        event.preventDefault();
        clearDragClasses();
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', (event) => {
        if (dragState.type !== 'scene') return;
        event.preventDefault();
        const toChapterIndex = parseIndex(node.getAttribute('data-chapter-index'));
        const toSceneIndex = parseIndex(node.getAttribute('data-to-scene-index'));
        if (
          dragState.fromChapterIndex === null
          || dragState.fromSceneIndex === null
          || toChapterIndex === null
          || toSceneIndex === null
        ) {
          resetDragState();
          return;
        }
        vscode.postMessage({
          type: 'reorderScene',
          fromChapterIndex: dragState.fromChapterIndex,
          fromSceneIndex: dragState.fromSceneIndex,
          toChapterIndex,
          toSceneIndex,
        });
        resetDragState();
      });
    });

    document.querySelectorAll('[data-drag-kind="chapter"]').forEach((node) => {
      node.addEventListener('dragstart', (event) => {
        const fromChapterIndex = parseIndex(node.getAttribute('data-chapter-index'));
        if (fromChapterIndex === null) {
          event.preventDefault();
          return;
        }
        dragState.type = 'chapter';
        dragState.fromChapterIndex = fromChapterIndex;
        dragState.fromSceneIndex = null;
        document.body.classList.add('drag-chapter');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(fromChapterIndex));
        }
      });
      node.addEventListener('dragend', () => {
        setTimeout(resetDragState, 0);
      });
      node.addEventListener('dragover', (event) => {
        if (dragState.type !== 'chapter') return;
        event.preventDefault();
        clearDragClasses();
        const chapter = node.closest('[data-chapter-block]');
        if (chapter) chapter.classList.add('drag-over');
      });
      node.addEventListener('drop', (event) => {
        if (dragState.type !== 'chapter') return;
        event.preventDefault();
        const toChapterIndex = parseIndex(node.getAttribute('data-chapter-index'));
        if (dragState.fromChapterIndex === null || toChapterIndex === null) {
          resetDragState();
          return;
        }
        vscode.postMessage({
          type: 'reorderChapter',
          fromChapterIndex: dragState.fromChapterIndex,
          toChapterIndex,
        });
        resetDragState();
      });
    });

    const chapterEndDrop = document.querySelector('[data-drop-kind="chapter-end"]');
    if (chapterEndDrop) {
      chapterEndDrop.addEventListener('dragover', (event) => {
        if (dragState.type !== 'chapter') return;
        event.preventDefault();
        clearDragClasses();
        chapterEndDrop.classList.add('drag-over');
      });
      chapterEndDrop.addEventListener('dragleave', () => {
        chapterEndDrop.classList.remove('drag-over');
      });
      chapterEndDrop.addEventListener('drop', (event) => {
        if (dragState.type !== 'chapter') return;
        event.preventDefault();
        const toChapterIndex = parseIndex(chapterEndDrop.getAttribute('data-to-chapter-index'));
        if (dragState.fromChapterIndex === null || toChapterIndex === null) {
          resetDragState();
          return;
        }
        vscode.postMessage({
          type: 'reorderChapter',
          fromChapterIndex: dragState.fromChapterIndex,
          toChapterIndex,
        });
        resetDragState();
      });
    }
  </script>
</body>
</html>`;
}

function renderChapter(chapter: ChapterCardModel): string {
  return `<section class="chapter" data-chapter-block="true">
    <header class="chapter-header" draggable="true" data-drag-kind="chapter" data-chapter-index="${chapter.chapterIndex}">
      <h3>${escapeHtml(chapter.title)}</h3>
      <span class="chapter-count">${chapter.scenes.length} scenes</span>
    </header>
    <div class="cards">
      ${chapter.scenes.map((scene) => renderSceneCard(scene)).join('')}
      <div class="scene-drop-end" data-drop-kind="scene-end" data-chapter-index="${chapter.chapterIndex}" data-to-scene-index="${chapter.scenes.length}">Drop scene here to append</div>
    </div>
  </section>`;
}

function renderSceneCard(scene: SceneCardModel): string {
  const status = scene.status
    ? `<span class="status-pill ${STATUS_CLASS[scene.status]}">${STATUS_LABEL[scene.status]}</span>`
    : '';
  const preview = scene.previewLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  return `<button
      class="scene-card"
      draggable="true"
      data-action="open-scene"
      data-drag-kind="scene"
      data-chapter-index="${scene.chapterIndex}"
      data-scene-index="${scene.sceneIndex}"
      data-uri="${encodeURIComponent(scene.uri)}"
    >
    <div class="scene-title-row">
      <span class="scene-title">${escapeHtml(scene.title)}</span>
      ${status}
    </div>
    <div class="scene-path">${escapeHtml(scene.relativePath)}</div>
    <div class="scene-preview">${preview}</div>
  </button>`;
}

function renderErrorHtml(webview: vscode.Webview, nonce: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <style>
    body { font: 12px/1.5 var(--vscode-font-family); padding: 12px; color: var(--vscode-editor-foreground); }
    .error { border: 1px solid var(--vscode-inputValidation-errorBorder); background: var(--vscode-inputValidation-errorBackground); border-radius: 8px; padding: 10px; }
    button { margin-top: 10px; }
  </style>
</head>
<body>
  <div class="error">Failed to load scene cards: ${escapeHtml(message)}</div>
  <button data-action="refresh">Retry</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btn = document.querySelector('[data-action="refresh"]');
    if (btn) {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runCommand', command: 'noveltools.refreshSceneCards' });
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function isRelevantDocument(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false;
  const lower = uri.fsPath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.yaml') || lower.endsWith('.yml');
}

function getConfiguredProjectUri(): vscode.Uri | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return null;
  const configured = getProjectFile().trim();
  if (!configured) return null;
  const segments = configured.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return null;
  return vscode.Uri.joinPath(folder.uri, ...segments);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

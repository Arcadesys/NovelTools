import * as path from 'path';
import * as vscode from 'vscode';
import {
  clearManuscriptCache,
  findAllProjectFiles,
  getManuscript,
} from './sceneList';
import {
  type SceneStatus,
} from './projectData';

const VIEW_ID = 'noveltools.sceneCards';

const STATUS_LABEL: Record<SceneStatus, string> = {
  drafted: 'Drafted',
  revision: 'Revision',
  review: 'Review',
  done: 'Done',
  spiked: 'Spiked',
  cut: 'Cut',
};

const STATUS_CLASS: Record<SceneStatus, string> = {
  drafted: 'status-drafted',
  revision: 'status-revision',
  review: 'status-review',
  done: 'status-done',
  spiked: 'status-spiked',
  cut: 'status-cut',
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
  'noveltools.openSceneOutline',
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

type WebviewMessage =
  | RunCommandMessage
  | OpenSceneMessage;

export function registerSceneCardsView(context: vscode.ExtensionContext): void {
  const provider = new SceneCardsViewProvider();
  try {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
        webviewOptions: { retainContextWhenHidden: true },
      })
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[NovelTools] Scene Cards view registration failed:`, err);
    void vscode.window.showErrorMessage(
      `NovelTools: Scene Cards panel failed to register. ${detail}`
    );
    return;
  }

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

    // Ignore any legacy drag-and-drop messages from older webviews.
  }

}

async function buildSceneCardsModel(): Promise<SceneCardsModel> {
  const [result, allIndex] = await Promise.all([
    getManuscript(),
    findAllProjectFiles(),
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
    : model.hasProjectFile
      ? `<div class="empty-panel">
           <h3>No scenes found</h3>
           <p>Your project file was found but contains no scene data yet. Add scenes to your project to populate this view.</p>
         </div>`
      : `<div class="empty-panel">
           <h3>No project file found</h3>
           <p>Open a folder with a <code>noveltools.json</code> to get started, or build one from your markdown scenes.</p>
         </div>`;

  const buildOrOpenLabel = model.hasProjectFile ? 'Open Project File' : 'Build Project File';
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
      border-radius: var(--nt-radius);
      padding: 2px;
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
    .status-drafted {
      border-color: var(--vscode-testing-iconQueued);
      color: var(--vscode-testing-iconQueued);
    }
    .status-revision {
      border-color: var(--vscode-charts-blue);
      color: var(--vscode-charts-blue);
    }
    .status-review {
      border-color: var(--vscode-charts-orange);
      color: var(--vscode-charts-orange);
    }
    .status-done {
      border-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-testing-iconPassed);
    }
    .status-spiked {
      border-color: var(--vscode-testing-iconFailed);
      color: var(--vscode-testing-iconFailed);
    }
    .status-cut {
      border-color: var(--vscode-descriptionForeground);
      color: var(--vscode-descriptionForeground);
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
    <p class="submeta">Click a scene card to open it. Reorder chapters and scenes from the Manuscript tree.</p>
    <div class="actions">
      <button class="action-btn" data-action="command" data-command="noveltools.refreshManuscript">Refresh</button>
      <button class="action-btn" data-action="command" data-command="${buildOrOpenCommand}">${buildOrOpenLabel}</button>
      <button class="action-btn" data-action="command" data-command="noveltools.openStitchedManuscript">Open Stitched</button>
      <button class="action-btn" data-action="command" data-command="noveltools.openSceneOutline">Scene outline</button>
      <button class="action-btn" data-action="command" data-command="noveltools.showQuickStart">Quick Start</button>
      ${documentButton}
    </div>
  </section>
  ${chaptersHtml}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let suppressClickUntil = 0;
    const resetClickSuppression = () => {
      suppressClickUntil = Date.now() + 120;
    };

    document.querySelectorAll('[data-action="open-scene"]').forEach((node) => {
      node.addEventListener('click', () => {
        if (Date.now() < suppressClickUntil) return;
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

    // Keep a short click suppression window to avoid accidental double-activations.
    document.addEventListener('mouseup', () => {
      resetClickSuppression();
    });
  </script>
</body>
</html>`;
}

function renderChapter(chapter: ChapterCardModel): string {
  return `<section class="chapter" data-chapter-block="true">
    <header class="chapter-header">
      <h3>${escapeHtml(chapter.title)}</h3>
      <span class="chapter-count">${chapter.scenes.length} scenes</span>
    </header>
    <div class="cards">
      ${chapter.scenes.map((scene) => renderSceneCard(scene)).join('')}
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
      data-action="open-scene"
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
  return lower.endsWith('.md') || lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml');
}


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
  synopsis: string;
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
      const metaSynopsis = result.data?.sceneMetadata?.[pathKey]?.synopsis;
      const synopsis = metaSynopsis || await readFirstContentLine(uri);
      return {
        chapterIndex,
        sceneIndex,
        title: path.basename(uri.fsPath),
        relativePath: vscode.workspace.asRelativePath(uri),
        uri: uri.toString(),
        synopsis,
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

async function readFirstContentLine(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    return extractFirstLine(text);
  } catch {
    return '';
  }
}

function extractFirstLine(text: string): string {
  let content = text.replace(/\r\n/g, '\n');
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---\n', 4);
    if (end >= 0) {
      content = content.slice(end + 5);
    }
  }
  for (const raw of content.split('\n')) {
    const line = simplifyLine(raw);
    if (line.length > 0) return line;
  }
  return '';
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scene Cards</title>
  <style>
    :root {
      --nt-border: var(--vscode-panel-border);
      --nt-bg-card: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --nt-accent: var(--vscode-focusBorder);
      --nt-fg-muted: var(--vscode-descriptionForeground);
      --nt-fg-strong: var(--vscode-editor-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: 8px;
      color: var(--nt-fg-strong);
      font: 12px/1.4 var(--vscode-font-family, ui-sans-serif, system-ui, sans-serif);
    }
    .chapter { margin-bottom: 12px; }
    .chapter-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--nt-fg-muted);
      padding: 4px 2px;
      user-select: none;
    }
    .scene-row {
      display: flex;
      align-items: center;
      gap: 6px;
      border: none;
      border-radius: 4px;
      background: transparent;
      padding: 4px 6px;
      cursor: pointer;
      text-align: left;
      width: 100%;
      color: inherit;
      font: inherit;
    }
    .scene-row:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .scene-row:focus-visible {
      outline: 1px solid var(--nt-accent);
      outline-offset: -1px;
    }
    .scene-title {
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .scene-synopsis {
      color: var(--nt-fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-drafted { background: var(--vscode-testing-iconQueued); }
    .dot-revision { background: var(--vscode-charts-blue); }
    .dot-review { background: var(--vscode-charts-orange); }
    .dot-done { background: var(--vscode-testing-iconPassed); }
    .dot-spiked { background: var(--vscode-testing-iconFailed); }
    .dot-cut { background: var(--vscode-descriptionForeground); }
    .empty-panel {
      border: 1px dashed var(--nt-border);
      border-radius: 8px;
      background: var(--nt-bg-card);
      padding: 16px;
    }
    .empty-panel h3 {
      font-size: 13px;
      margin-bottom: 6px;
    }
    .empty-panel p {
      color: var(--nt-fg-muted);
    }
  </style>
</head>
<body>
  ${chaptersHtml}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('[data-action="open-scene"]').forEach((node) => {
      node.addEventListener('click', () => {
        const rawUri = node.getAttribute('data-uri');
        if (!rawUri) return;
        vscode.postMessage({ type: 'openScene', uri: decodeURIComponent(rawUri) });
      });
    });
  </script>
</body>
</html>`;
}

function renderChapter(chapter: ChapterCardModel): string {
  return `<section class="chapter">
    <div class="chapter-header">${escapeHtml(chapter.title)}</div>
    ${chapter.scenes.map((scene) => renderSceneCard(scene)).join('')}
  </section>`;
}

function renderSceneCard(scene: SceneCardModel): string {
  const dot = scene.status
    ? `<span class="status-dot dot-${scene.status}" title="${STATUS_LABEL[scene.status]}"></span>`
    : '';
  const synopsisText = scene.synopsis || 'No synopsis';
  const muted = scene.synopsis ? '' : ' style="font-style:italic;opacity:0.6"';
  return `<button class="scene-row" data-action="open-scene" data-uri="${encodeURIComponent(scene.uri)}">
    ${dot}<span class="scene-title">${escapeHtml(scene.title)}</span><span class="scene-synopsis"${muted}>${escapeHtml(synopsisText)}</span>
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


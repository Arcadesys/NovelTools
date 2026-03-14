import * as path from 'path';
import * as vscode from 'vscode';
import { clearManuscriptCache, getManuscript } from './sceneList';
import type { SceneStatus } from './projectData';

const PANEL_VIEW_TYPE = 'noveltools.sceneOutline';

interface OutlineScene {
  chapterIndex: number;
  sceneIndex: number;
  title: string;
  relativePath: string;
  uri: string;
  status?: SceneStatus;
}

interface OutlineChapter {
  chapterIndex: number;
  title: string;
  scenes: OutlineScene[];
}

interface OutlineModel {
  manuscriptTitle: string;
  hasData: boolean;
  chapterCount: number;
  sceneCount: number;
  chapters: OutlineChapter[];
}

const STATUS_EMOJI: Record<SceneStatus, string> = {
  done: '🟢',
  drafted: '🟡',
  spiked: '🔴',
};

const COMMAND_WHITELIST = new Set([
  'noveltools.refreshManuscript',
  'noveltools.openProjectYaml',
  'noveltools.buildProjectYaml',
  'noveltools.openStitchedManuscript',
]);

let activePanel: vscode.WebviewPanel | undefined;

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

async function buildOutlineModel(): Promise<OutlineModel> {
  const result = await getManuscript();
  if (!result.data) {
    return {
      manuscriptTitle: 'Manuscript',
      hasData: false,
      chapterCount: 0,
      sceneCount: 0,
      chapters: [],
    };
  }
  const baseDir = result.data.projectFileUri
    ? path.dirname(result.data.projectFileUri.fsPath)
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const chapters: OutlineChapter[] = result.data.chapters.map((chapter, chapterIndex) => {
    const title = chapter.title ?? `Chapter ${chapterIndex + 1}`;
    const scenes: OutlineScene[] = chapter.sceneUris.map((uri, sceneIndex) => {
      const fallbackPath = baseDir ? path.relative(baseDir, uri.fsPath) : uri.fsPath;
      const scenePath = chapter.scenePaths[sceneIndex] ?? fallbackPath;
      const pathKey = scenePath.split(path.sep).join('/');
      const status = result.data?.sceneStatus?.[pathKey];
      return {
        chapterIndex,
        sceneIndex,
        title: path.basename(uri.fsPath, path.extname(uri.fsPath)),
        relativePath: vscode.workspace.asRelativePath(uri),
        uri: uri.toString(),
        status,
      };
    });
    return { chapterIndex, title, scenes };
  });
  const sceneCount = chapters.reduce((n, ch) => n + ch.scenes.length, 0);
  return {
    manuscriptTitle: result.data.title ?? 'Manuscript',
    hasData: true,
    chapterCount: chapters.length,
    sceneCount,
    chapters,
  };
}

function renderOutlineHtml(webview: vscode.Webview, nonce: string, model: OutlineModel): string {
  const chaptersHtml = model.hasData
    ? model.chapters
        .map(
          (ch) => `
    <div class="chapter" data-chapter-index="${ch.chapterIndex}">
      <button type="button" class="chapter-toggle" aria-expanded="true" data-chapter-index="${ch.chapterIndex}">
        <span class="chevron">▼</span>
        <span class="chapter-title">${escapeHtml(ch.title)}</span>
        <span class="chapter-meta">${ch.scenes.length} scene${ch.scenes.length === 1 ? '' : 's'}</span>
      </button>
      <ul class="scene-list">
        ${ch.scenes
          .map(
            (s) => `
          <li>
            <button type="button" class="scene-link" data-uri="${encodeURIComponent(s.uri)}">
              ${s.status ? STATUS_EMOJI[s.status] + ' ' : ''}${escapeHtml(s.title)}
            </button>
          </li>`
          )
          .join('')}
      </ul>
    </div>`
        )
        .join('')
    : `<div class="empty">No manuscript data. Build a project file from your markdown scenes.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scene Outline</title>
  <style>
    :root {
      --nt-fg: var(--vscode-editor-foreground);
      --nt-fg-muted: var(--vscode-descriptionForeground);
      --nt-border: var(--vscode-panel-border);
      --nt-hover: var(--vscode-list-hoverBackground);
      --nt-focus: var(--vscode-focusBorder);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 16px;
      font: 13px/1.5 var(--vscode-font-family, ui-sans-serif, system-ui, sans-serif);
      color: var(--nt-fg);
      background: var(--vscode-editor-background);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--nt-border);
    }
    .header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .meta {
      color: var(--nt-fg-muted);
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 6px;
    }
    .action-btn {
      border: 1px solid var(--nt-border);
      border-radius: 6px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font: inherit;
      font-size: 12px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .chapter {
      margin-bottom: 4px;
    }
    .chapter-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 8px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--nt-fg);
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }
    .chapter-toggle:hover {
      background: var(--nt-hover);
    }
    .chevron {
      font-size: 10px;
      transition: transform 0.15s ease;
      color: var(--nt-fg-muted);
    }
    .chapter.collapsed .chevron {
      transform: rotate(-90deg);
    }
    .chapter-title {
      font-weight: 600;
      flex: 1;
    }
    .chapter-meta {
      color: var(--nt-fg-muted);
      font-size: 11px;
    }
    .scene-list {
      list-style: none;
      margin: 0 0 4px 0;
      padding: 0 0 0 20px;
    }
    .chapter.collapsed .scene-list {
      display: none;
    }
    .scene-list li {
      margin: 2px 0;
    }
    .scene-link {
      display: block;
      width: 100%;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--nt-fg);
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .scene-link:hover {
      background: var(--nt-hover);
      color: var(--vscode-editorLink-activeForeground);
    }
    .empty {
      color: var(--nt-fg-muted);
      padding: 16px;
    }
  </style>
</head>
<body>
  <section class="header">
    <div>
      <h2>${escapeHtml(model.manuscriptTitle)}</h2>
      <span class="meta">${model.chapterCount} chapters · ${model.sceneCount} scenes</span>
    </div>
    <div class="actions">
      <button class="action-btn" data-command="noveltools.refreshManuscript">Refresh</button>
      <button class="action-btn" data-command="noveltools.openProjectYaml">Open Project File</button>
      <button class="action-btn" data-command="noveltools.openStitchedManuscript">Open Stitched</button>
    </div>
  </section>
  ${chaptersHtml}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.chapter-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chapter = btn.closest('.chapter');
        if (chapter) chapter.classList.toggle('collapsed');
      });
    });
    document.querySelectorAll('.scene-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uri = btn.getAttribute('data-uri');
        if (uri) vscode.postMessage({ type: 'openScene', uri: decodeURIComponent(uri) });
      });
    });
    document.querySelectorAll('[data-command]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-command');
        if (cmd) vscode.postMessage({ type: 'runCommand', command: cmd });
      });
    });
  </script>
</body>
</html>`;
}

async function updatePanel(panel: vscode.WebviewPanel): Promise<void> {
  const nonce = createNonce();
  try {
    const model = await buildOutlineModel();
    panel.webview.html = renderOutlineHtml(panel.webview, nonce, model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.html = `<!DOCTYPE html><html><body><p>Failed to load outline: ${escapeHtml(message)}</p></body></html>`;
  }
}

export function registerSceneOutlineEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openSceneOutline', async () => {
      if (activePanel) {
        activePanel.reveal(vscode.ViewColumn.One);
        await updatePanel(activePanel);
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        'Scene Outline',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      activePanel = panel;
      panel.onDidDispose(() => {
        if (activePanel === panel) activePanel = undefined;
      });
      panel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const m = message as { type: string; uri?: string; command?: string };
        if (m.type === 'openScene' && typeof m.uri === 'string') {
          const uri = vscode.Uri.parse(m.uri);
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
          return;
        }
        if (m.type === 'runCommand' && typeof m.command === 'string' && COMMAND_WHITELIST.has(m.command)) {
          await vscode.commands.executeCommand(m.command);
          clearManuscriptCache();
          await updatePanel(panel);
        }
      });
      await updatePanel(panel);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (activePanel && (doc.uri.fsPath.endsWith('.json') || doc.uri.fsPath.endsWith('.md') || doc.uri.fsPath.endsWith('.yaml') || doc.uri.fsPath.endsWith('.yml'))) {
        void updatePanel(activePanel);
      }
    })
  );
}

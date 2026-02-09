"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCorkboardView = registerCorkboardView;
const vscode = __importStar(require("vscode"));
const sceneList_1 = require("./sceneList");
const projectYaml_1 = require("./projectYaml");
const VIEW_ID = 'noveltools.manuscript';
function toCorkboardData(data) {
    if (!data)
        return null;
    return {
        title: data.title ?? 'Manuscript',
        canReorder: data.projectFileUri != null,
        chapters: data.chapters.map((ch) => ({
            title: ch.title ?? `Chapter ${data.chapters.indexOf(ch) + 1}`,
            scenePaths: ch.scenePaths,
            sceneUris: ch.sceneUris.map((u) => u.toString()),
        })),
    };
}
async function writeProjectYaml(uri, data) {
    const yaml = (0, projectYaml_1.serializeToYaml)(data);
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, yaml);
    await vscode.workspace.applyEdit(edit);
}
function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function getCorkboardHtml(webview, initialData) {
    const script = `
    const vscode = acquireVsCodeApi();
    let manuscript = null;

    function render(data) {
      manuscript = data;
      const root = document.getElementById('corkboard');
      if (!data || !data.chapters || data.chapters.length === 0) {
        root.innerHTML = '<div class="empty">No manuscript. Add a <code>noveltools.yaml</code> to get started.</div>';
        return;
      }

      let html = '';
      data.chapters.forEach((ch, chIdx) => {
        const rot = (chIdx % 3) * 1.2 - 1.2;
        html += \`
          <div class="chapter-card" data-chapter-index="\${chIdx}" style="--rot: \${rot}deg">
            <div class="pin"></div>
            <div class="chapter-title">\${escapeHtml(ch.title)}</div>
            <div class="scene-list">
              \${ch.sceneUris.map((uri, scIdx) => \`
                <div class="scene-card" data-chapter-index="\${chIdx}" data-scene-index="\${scIdx}" data-uri="\${escapeAttr(uri)}" title="\${escapeAttr(ch.scenePaths[scIdx] || '')}">
                  <span class="scene-label">\${escapeHtml((ch.scenePaths[scIdx] || '').split(/[/\\\\]/).pop() || 'Scene')}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
      });
      root.innerHTML = html;

      root.querySelectorAll('.scene-card').forEach(el => {
        el.addEventListener('click', () => {
          vscode.postMessage({ type: 'open', uri: el.dataset.uri });
        });
      });

      if (data.canReorder) {
        setupDragDrop(root, data);
      }
    }

    function escapeHtml(s) {
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }
    function escapeAttr(s) {
      return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function setupDragDrop(root, data) {
      let dragged = null;
      root.querySelectorAll('.chapter-card').forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', e => {
          dragged = { type: 'chapter', chapterIndex: parseInt(card.dataset.chapterIndex, 10) };
          e.dataTransfer.setData('text/plain', JSON.stringify(dragged));
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
      });
      root.querySelectorAll('.scene-card').forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', e => {
          dragged = {
            type: 'scene',
            chapterIndex: parseInt(card.dataset.chapterIndex, 10),
            sceneIndex: parseInt(card.dataset.sceneIndex, 10),
          };
          e.dataTransfer.setData('text/plain', JSON.stringify(dragged));
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
      });

      root.querySelectorAll('.chapter-card, .scene-card').forEach(dropTarget => {
        dropTarget.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          dropTarget.classList.add('drop-target');
        });
        dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('drop-target'));
        dropTarget.addEventListener('drop', e => {
          e.preventDefault();
          dropTarget.classList.remove('drop-target');
          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          let src;
          try { src = JSON.parse(raw); } catch { return; }
          const isChapter = dropTarget.classList.contains('chapter-card');
          const isScene = dropTarget.classList.contains('scene-card');
          const toCh = isChapter ? parseInt(dropTarget.dataset.chapterIndex, 10) : parseInt(dropTarget.closest('.chapter-card').dataset.chapterIndex, 10);
          const toSc = isScene ? parseInt(dropTarget.dataset.sceneIndex, 10) : (data.chapters[toCh]?.sceneUris?.length ?? 0);
          if (src.type === 'chapter') {
            if (src.chapterIndex === toCh) return;
            vscode.postMessage({ type: 'reorderChapter', fromIndex: src.chapterIndex, toIndex: toCh });
          } else if (src.type === 'scene') {
            if (src.chapterIndex === toCh && src.sceneIndex === toSc) return;
            vscode.postMessage({
              type: 'moveScene',
              fromChapter: src.chapterIndex,
              fromScene: src.sceneIndex,
              toChapter: toCh,
              toScene: toSc,
            });
          }
        });
      });
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'data') render(msg.data);
    });

    const initial = document.getElementById('initial-data');
    if (initial && initial.value) {
      try { render(JSON.parse(initial.value)); } catch (_) {}
    }
  `;
    const emptyMessage = initialData == null
        ? 'No manuscript. Add a <code>noveltools.yaml</code> to get started.'
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      min-height: 100%;
      font-family: 'Georgia', 'Palatino', serif;
      font-size: 13px;
      background: #8b7355;
      background-image:
        radial-gradient(ellipse at 20% 30%, rgba(160,130,95,0.4) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 70%, rgba(120,95,65,0.3) 0%, transparent 50%),
        linear-gradient(180deg, #9a7f5f 0%, #7d6345 50%, #6b5438 100%);
      background-attachment: fixed;
    }
    #corkboard {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-content: flex-start;
    }
    .empty {
      color: rgba(255,255,255,0.9);
      padding: 16px;
      text-align: center;
      background: rgba(0,0,0,0.15);
      border-radius: 8px;
      width: 100%;
    }
    .empty code { background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; }
    .chapter-card {
      position: relative;
      width: 200px;
      min-height: 80px;
      padding: 10px 12px 12px;
      padding-top: 18px;
      background: #faf6ed;
      background: linear-gradient(165deg, #fffef9 0%, #f5f0e1 100%);
      border-radius: 2px;
      box-shadow:
        2px 2px 4px rgba(0,0,0,0.15),
        0 4px 12px rgba(0,0,0,0.1);
      transform: rotate(var(--rot, 0deg));
      cursor: default;
      border: 1px solid rgba(180,160,120,0.4);
    }
    .chapter-card.dragging { opacity: 0.6; }
    .chapter-card.drop-target { outline: 2px solid rgba(100,80,50,0.6); outline-offset: 2px; }
    .pin {
      position: absolute;
      top: -4px;
      left: 50%;
      transform: translateX(-50%);
      width: 14px;
      height: 14px;
      background: radial-gradient(circle at 30% 30%, #c9302c, #8b2020);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
    }
    .chapter-title {
      font-weight: bold;
      color: #2c2416;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      font-size: 14px;
    }
    .scene-list { display: flex; flex-direction: column; gap: 4px; }
    .scene-card {
      padding: 4px 8px;
      background: rgba(255,255,255,0.7);
      border-radius: 2px;
      border-left: 3px solid #a08060;
      cursor: pointer;
      font-size: 12px;
      color: #3d3528;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scene-card:hover {
      background: rgba(255,255,255,0.95);
      border-left-color: #6b5438;
    }
    .scene-card.dragging { opacity: 0.5; }
    .scene-card.drop-target { background: rgba(180,160,120,0.3); }
  </style>
</head>
<body>
  <input type="hidden" id="initial-data" value="${initialData ? escapeAttr(JSON.stringify(initialData)) : ''}" />
  <div id="corkboard">${emptyMessage ? `<div class="empty">${emptyMessage}</div>` : ''}</div>
  <script>${script}</script>
</body>
</html>`;
}
function registerCorkboardView(context) {
    let resolveRefresh = null;
    const provider = {
        resolveWebviewView(webviewView, _context, _token) {
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [],
            };
            const updateContent = async () => {
                const result = await (0, sceneList_1.getManuscript)();
                const data = toCorkboardData(result.data);
                webviewView.webview.html = getCorkboardHtml(webviewView.webview, data);
            };
            webviewView.webview.onDidReceiveMessage(async (msg) => {
                if (msg.type === 'open' && typeof msg.uri === 'string') {
                    try {
                        await vscode.window.showTextDocument(vscode.Uri.parse(msg.uri));
                    }
                    catch (_) {
                        // ignore
                    }
                    return;
                }
                if (msg.type === 'reorderChapter' && typeof msg.fromIndex === 'number' && typeof msg.toIndex === 'number') {
                    const result = await (0, sceneList_1.getManuscript)();
                    const projectUri = result.data?.projectFileUri;
                    if (!projectUri)
                        return;
                    const next = (0, projectYaml_1.reorderChapters)(result.data, msg.fromIndex, msg.toIndex);
                    await writeProjectYaml(projectUri, next);
                    (0, sceneList_1.clearManuscriptCache)();
                    await updateContent();
                    return;
                }
                if (msg.type === 'moveScene' &&
                    typeof msg.fromChapter === 'number' &&
                    typeof msg.fromScene === 'number' &&
                    typeof msg.toChapter === 'number' &&
                    typeof msg.toScene === 'number') {
                    const result = await (0, sceneList_1.getManuscript)();
                    const projectUri = result.data?.projectFileUri;
                    if (!projectUri)
                        return;
                    const next = (0, projectYaml_1.moveScene)(result.data, msg.fromChapter, msg.fromScene, msg.toChapter, msg.toScene);
                    await writeProjectYaml(projectUri, next);
                    (0, sceneList_1.clearManuscriptCache)();
                    await updateContent();
                }
            });
            resolveRefresh = updateContent;
            updateContent();
        },
    };
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.refreshManuscript', async () => {
        (0, sceneList_1.clearManuscriptCache)();
        if (resolveRefresh)
            await resolveRefresh();
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        const name = doc.uri.path.split(/[/\\]/).pop();
        if (name === 'noveltools.yaml' || name?.endsWith('manuscript.yaml')) {
            (0, sceneList_1.clearManuscriptCache)();
            if (resolveRefresh)
                resolveRefresh();
        }
    }));
}
//# sourceMappingURL=corkboardView.js.map
import * as path from 'path';
import * as vscode from 'vscode';
import { getManuscript, clearManuscriptCache } from './sceneList';
import { SceneMetadataEntry, ManuscriptData, CharacterEntry, LocationEntry } from './projectData';
import { writeProject } from './projectFile';

interface MetadataModel {
  scenePath: string;
  sceneTitle: string;
  metadata: SceneMetadataEntry;
  characters: CharacterEntry[];
  locations: LocationEntry[];
}

type WebviewMessage =
  | { type: 'save'; scenePath: string; metadata: SceneMetadataEntry }
  | { type: 'addCharacter'; name: string; description?: string }
  | { type: 'addLocation'; name: string; description?: string }
  | { type: 'removeCharacter'; name: string }
  | { type: 'removeLocation'; name: string };

let currentPanel: vscode.WebviewPanel | undefined;
let currentScenePath: string | undefined;

export function registerMetadataPanel(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.editSceneMetadata', async (arg?: string | { type: string; data?: ManuscriptData; chapterIndex?: number; sceneIndex?: number }) => {
      let scenePath: string | undefined;
      if (typeof arg === 'string') {
        scenePath = arg;
      } else if (arg && typeof arg === 'object' && arg.data && arg.chapterIndex !== undefined && arg.sceneIndex !== undefined) {
        scenePath = arg.data.chapters[arg.chapterIndex]?.scenePaths[arg.sceneIndex];
      }
      if (!scenePath) scenePath = await pickScene();
      if (!scenePath) return;
      await openMetadataPanel(context, scenePath);
    }),
    vscode.commands.registerCommand('noveltools.addCharacter', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Character name', placeHolder: 'e.g. Fenton' });
      if (!name?.trim()) return;
      const description = await vscode.window.showInputBox({ prompt: `Description for ${name} (optional)` });
      await addRegistryEntry('characters', name.trim(), description?.trim());
    }),
    vscode.commands.registerCommand('noveltools.addLocation', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Location name', placeHolder: 'e.g. The Two-Flat' });
      if (!name?.trim()) return;
      const description = await vscode.window.showInputBox({ prompt: `Description for ${name} (optional)` });
      await addRegistryEntry('locations', name.trim(), description?.trim());
    }),
    vscode.commands.registerCommand('noveltools.manageCharacters', () => showRegistryQuickPick('characters')),
    vscode.commands.registerCommand('noveltools.manageLocations', () => showRegistryQuickPick('locations'))
  );
}

async function pickScene(): Promise<string | undefined> {
  const result = await getManuscript();
  if (!result?.data) return undefined;
  const items = result.data.chapters.flatMap((ch, ci) =>
    ch.scenePaths.map((sp, si) => ({
      label: path.basename(sp, '.md').replace(/[-_]/g, ' '),
      description: ch.title ?? `Chapter ${ci + 1}`,
      detail: sp,
      scenePath: sp,
    }))
  );
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select scene to edit metadata' });
  return picked?.scenePath;
}

async function openMetadataPanel(context: vscode.ExtensionContext, scenePath: string): Promise<void> {
  const result = await getManuscript();
  if (!result?.data) return;
  const data = result.data;
  const meta = data.sceneMetadata?.[scenePath] ?? {};
  const model: MetadataModel = {
    scenePath,
    sceneTitle: path.basename(scenePath, '.md').replace(/[-_]/g, ' '),
    metadata: meta,
    characters: data.characters ?? [],
    locations: data.locations ?? [],
  };

  if (currentPanel && currentScenePath === scenePath) {
    currentPanel.webview.postMessage({ type: 'update', model });
    currentPanel.reveal();
    return;
  }

  if (currentPanel) {
    currentPanel.dispose();
  }

  currentScenePath = scenePath;
  const panel = vscode.window.createWebviewPanel(
    'noveltools.metadataPanel',
    `Metadata: ${model.sceneTitle}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  currentPanel = panel;
  panel.webview.html = getMetadataHtml(panel.webview, model);

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === 'save') {
      await saveMetadata(msg.scenePath, msg.metadata);
      panel.webview.postMessage({ type: 'saved' });
    } else if (msg.type === 'addCharacter') {
      await addRegistryEntry('characters', msg.name, msg.description);
      await refreshPanel(panel, currentScenePath!);
    } else if (msg.type === 'addLocation') {
      await addRegistryEntry('locations', msg.name, msg.description);
      await refreshPanel(panel, currentScenePath!);
    } else if (msg.type === 'removeCharacter') {
      await removeRegistryEntry('characters', msg.name);
      await refreshPanel(panel, currentScenePath!);
    } else if (msg.type === 'removeLocation') {
      await removeRegistryEntry('locations', msg.name);
      await refreshPanel(panel, currentScenePath!);
    }
  });

  panel.onDidDispose(() => {
    if (currentPanel === panel) {
      currentPanel = undefined;
      currentScenePath = undefined;
    }
  });
}

async function refreshPanel(panel: vscode.WebviewPanel, scenePath: string): Promise<void> {
  const result = await getManuscript();
  if (!result?.data) return;
  const meta = result.data.sceneMetadata?.[scenePath] ?? {};
  const model: MetadataModel = {
    scenePath,
    sceneTitle: path.basename(scenePath, '.md').replace(/[-_]/g, ' '),
    metadata: meta,
    characters: result.data.characters ?? [],
    locations: result.data.locations ?? [],
  };
  panel.webview.postMessage({ type: 'update', model });
}

async function saveMetadata(scenePath: string, metadata: SceneMetadataEntry): Promise<void> {
  const result = await getManuscript();
  if (!result?.data?.projectFileUri) return;
  const data = result.data;
  const sceneMetadata = { ...(data.sceneMetadata ?? {}) };
  const cleaned: SceneMetadataEntry = {};
  if (metadata.synopsis?.trim()) cleaned.synopsis = metadata.synopsis.trim();
  if (metadata.pov?.trim()) cleaned.pov = metadata.pov.trim();
  if (metadata.setting?.trim()) cleaned.setting = metadata.setting.trim();
  if (metadata.timeline?.trim()) cleaned.timeline = metadata.timeline.trim();
  if (metadata.tags && metadata.tags.length > 0) cleaned.tags = metadata.tags.filter((t) => t.trim());
  if (Object.keys(cleaned).length > 0) {
    sceneMetadata[scenePath] = cleaned;
  } else {
    delete sceneMetadata[scenePath];
  }
  const updated: ManuscriptData = { ...data, sceneMetadata };
  await writeProject(data.projectFileUri!, updated);
  clearManuscriptCache();
  void vscode.commands.executeCommand('noveltools.refreshManuscript');
}

async function addRegistryEntry(kind: 'characters' | 'locations', name: string, description?: string): Promise<void> {
  const result = await getManuscript();
  if (!result?.data?.projectFileUri) return;
  const data = result.data;
  const list = [...(data[kind] ?? [])];
  if (list.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    vscode.window.showInformationMessage(`${name} already exists in ${kind}.`);
    return;
  }
  list.push({ name, ...(description ? { description } : {}) });
  list.sort((a, b) => a.name.localeCompare(b.name));
  const updated: ManuscriptData = { ...data, [kind]: list };
  await writeProject(data.projectFileUri!, updated);
  clearManuscriptCache();
}

async function removeRegistryEntry(kind: 'characters' | 'locations', name: string): Promise<void> {
  const result = await getManuscript();
  if (!result?.data?.projectFileUri) return;
  const data = result.data;
  const list = (data[kind] ?? []).filter((e) => e.name !== name);
  const updated: ManuscriptData = { ...data, [kind]: list.length > 0 ? list : undefined };
  await writeProject(data.projectFileUri!, updated);
  clearManuscriptCache();
}

async function showRegistryQuickPick(kind: 'characters' | 'locations'): Promise<void> {
  const result = await getManuscript();
  if (!result?.data) return;
  const list = result.data[kind] ?? [];
  const label = kind === 'characters' ? 'Character' : 'Location';
  if (list.length === 0) {
    const add = await vscode.window.showInformationMessage(`No ${kind} defined yet.`, `Add ${label}`);
    if (add) void vscode.commands.executeCommand(kind === 'characters' ? 'noveltools.addCharacter' : 'noveltools.addLocation');
    return;
  }
  const items: (vscode.QuickPickItem & { action?: string; entryName?: string })[] = [
    { label: `$(add) Add ${label}`, action: 'add' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    ...list.map((e) => ({
      label: e.name,
      description: e.description ?? '',
      action: 'remove' as const,
      entryName: e.name,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Manage ${kind} (select to remove)`,
  });
  if (!picked) return;
  if (picked.action === 'add') {
    void vscode.commands.executeCommand(kind === 'characters' ? 'noveltools.addCharacter' : 'noveltools.addLocation');
  } else if (picked.action === 'remove' && picked.entryName) {
    const confirm = await vscode.window.showWarningMessage(`Remove "${picked.entryName}" from ${kind}?`, 'Remove', 'Cancel');
    if (confirm === 'Remove') await removeRegistryEntry(kind, picked.entryName);
  }
}

function getMetadataHtml(webview: vscode.Webview, model: MetadataModel): string {
  const nonce = getNonce();
  const meta = model.metadata;
  const charsJson = JSON.stringify(model.characters);
  const locsJson = JSON.stringify(model.locations);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scene Metadata</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
    h2 { margin: 0 0 16px 0; font-size: 1.2em; }
    .field { margin-bottom: 12px; }
    .field label { display: block; margin-bottom: 4px; font-weight: 600; font-size: 0.85em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .field input, .field textarea, .field select { width: 100%; box-sizing: border-box; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font-family: inherit; font-size: 0.95em; }
    .field textarea { resize: vertical; min-height: 40px; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; font-size: 0.8em; }
    .tag button { background: none; border: none; color: inherit; cursor: pointer; padding: 0; font-size: 1.1em; line-height: 1; }
    .btn { padding: 6px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 0.9em; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    .saved { color: var(--vscode-testing-iconPassed); font-size: 0.85em; margin-left: 8px; display: none; }
    .section { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--vscode-widget-border, #333); }
    .section h3 { margin: 0 0 8px 0; font-size: 1em; }
    .registry-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
    .registry-item .name { font-weight: 500; }
    .registry-item .desc { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: 8px; }
  </style>
</head>
<body>
  <h2>${escapeHtml(model.sceneTitle)}</h2>

  <div class="field">
    <label>Synopsis</label>
    <textarea id="synopsis" rows="2" placeholder="One-line scene summary">${escapeHtml(meta.synopsis ?? '')}</textarea>
  </div>

  <div class="field">
    <label>POV Character</label>
    <input id="pov" type="text" list="char-list" value="${escapeHtml(meta.pov ?? '')}" placeholder="Who's perspective?" />
    <datalist id="char-list">${model.characters.map((c) => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist>
  </div>

  <div class="field">
    <label>Setting</label>
    <input id="setting" type="text" list="loc-list" value="${escapeHtml(meta.setting ?? '')}" placeholder="Where does this scene take place?" />
    <datalist id="loc-list">${model.locations.map((l) => `<option value="${escapeHtml(l.name)}">`).join('')}</datalist>
  </div>

  <div class="field">
    <label>Timeline</label>
    <input id="timeline" type="text" value="${escapeHtml(meta.timeline ?? '')}" placeholder="When in the story (date, time, or marker)" />
  </div>

  <div class="field">
    <label>Tags</label>
    <div class="tags" id="tags-container"></div>
    <div style="display:flex;gap:4px;margin-top:4px;">
      <input id="tag-input" type="text" placeholder="Add tag…" style="flex:1" />
      <button class="btn btn-secondary" id="add-tag-btn">+</button>
    </div>
  </div>

  <div class="actions">
    <button class="btn" id="save-btn">Save</button>
    <span class="saved" id="saved-msg">Saved</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const scenePath = ${JSON.stringify(model.scenePath)};
    let tags = ${JSON.stringify(meta.tags ?? [])};

    function renderTags() {
      const container = document.getElementById('tags-container');
      container.innerHTML = tags.map((t, i) =>
        '<span class="tag">' + t + '<button data-idx="' + i + '">×</button></span>'
      ).join('');
      container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          tags.splice(parseInt(btn.dataset.idx), 1);
          renderTags();
        });
      });
    }
    renderTags();

    document.getElementById('add-tag-btn').addEventListener('click', addTag);
    document.getElementById('tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTag();
    });

    function addTag() {
      const input = document.getElementById('tag-input');
      const val = input.value.trim();
      if (val && !tags.includes(val)) {
        tags.push(val);
        renderTags();
      }
      input.value = '';
    }

    document.getElementById('save-btn').addEventListener('click', () => {
      vscode.postMessage({
        type: 'save',
        scenePath,
        metadata: {
          synopsis: document.getElementById('synopsis').value,
          pov: document.getElementById('pov').value,
          setting: document.getElementById('setting').value,
          timeline: document.getElementById('timeline').value,
          tags: tags.length > 0 ? tags : undefined,
        }
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'saved') {
        const el = document.getElementById('saved-msg');
        el.style.display = 'inline';
        setTimeout(() => { el.style.display = 'none'; }, 2000);
      } else if (msg.type === 'update') {
        const m = msg.model.metadata;
        document.getElementById('synopsis').value = m.synopsis || '';
        document.getElementById('pov').value = m.pov || '';
        document.getElementById('setting').value = m.setting || '';
        document.getElementById('timeline').value = m.timeline || '';
        tags = m.tags || [];
        renderTags();
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

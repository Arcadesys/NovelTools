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
exports.registerManuscriptView = registerManuscriptView;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const sceneList_1 = require("./sceneList");
const projectYaml_1 = require("./projectYaml");
const projectFile_1 = require("./projectFile");
const VIEW_ID = 'noveltools.manuscript';
const MIME_TREE = `application/vnd.code.tree.${VIEW_ID}`;
const QUICK_START_FALLBACK = `# NovelTools Quick Start

1. Create a project file
   - Run "NovelTools: Build Project YAML" to create \`noveltools.yaml\` from your scene files.

2. Use the Manuscript view
   - Drag chapters and scenes to reorder. Changes are written back to the YAML.

3. Read the stitched manuscript
   - Run "NovelTools: Open Stitched Manuscript" to view the whole draft at once.

Tips
- Settings live under "NovelTools" in VS Code Settings.
- Word counts and typewriter sounds are optional toggles.
`;
const STATUS_EMOJI = {
    done: '🟢',
    drafted: '🟡',
    spiked: '🔴',
};
const STATUS_ICON = {
    done: 'pass-filled',
    drafted: 'pencil',
    spiked: 'circle-slash',
};
function formatSceneCount(count) {
    return `${count} ${count === 1 ? 'scene' : 'scenes'}`;
}
function formatChapterCount(count) {
    return `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
}
function normalizePathForCompare(input) {
    return input.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}
function isConfiguredProjectFile(uri) {
    const configured = normalizePathForCompare((0, config_1.getProjectFile)());
    if (!configured)
        return false;
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder)
        return false;
    const relative = normalizePathForCompare(path.relative(folder.uri.fsPath, uri.fsPath));
    if (configured.includes('/'))
        return relative === configured;
    return path.posix.basename(relative) === configured;
}
function isIndexLikeFileName(name) {
    return /index\.(yaml|yml|md)$/i.test(name) || /manuscript\.(yaml|yml)$/i.test(name);
}
function sceneTitleFromUri(uri) {
    const stem = path.basename(uri.fsPath, path.extname(uri.fsPath));
    const pretty = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return pretty || path.basename(uri.fsPath);
}
function getConfiguredProjectUri() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder)
        return null;
    const configured = (0, config_1.getProjectFile)().trim();
    if (!configured)
        return null;
    const segments = configured.split(/[/\\]/).filter(Boolean);
    if (segments.length === 0)
        return null;
    return vscode.Uri.joinPath(folder.uri, ...segments);
}
function getTreeItemLabel(node) {
    switch (node.type) {
        case 'root':
            return node.label;
        case 'document':
            return node.label;
        case 'chapter':
            return node.label;
        case 'scene': {
            const prefix = node.status ? `${STATUS_EMOJI[node.status]} ` : '';
            return `${prefix}${node.label}`;
        }
    }
}
function registerManuscriptView(context) {
    const treeDataProvider = new ManuscriptTreeDataProvider(context);
    const treeView = vscode.window.createTreeView(VIEW_ID, {
        treeDataProvider,
        dragAndDropController: treeDataProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    treeView.onDidChangeSelection(async (e) => {
        if (e.selection.length !== 1)
            return;
        const node = e.selection[0];
        if (!node)
            return;
        if (node.type === 'scene') {
            await vscode.window.showTextDocument(node.uri);
        }
        else if (node.type === 'document') {
            await (0, sceneList_1.setActiveProjectUri)(node.projectFileUri);
            treeDataProvider.refresh();
        }
    });
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.refreshManuscript', () => {
        (0, sceneList_1.clearManuscriptCache)();
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.buildProjectYaml', async () => {
        const result = await (0, sceneList_1.getManuscript)();
        if (!result.data) {
            await vscode.window.showInformationMessage('No manuscript files found. Configure noveltools.sceneFiles or noveltools.sceneGlob, or add markdown files.');
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length)
            return;
        const name = (0, config_1.getProjectFile)();
        const segments = name.split(/[/\\]/);
        const targetUri = segments.length > 1
            ? vscode.Uri.joinPath(folders[0].uri, ...segments)
            : vscode.Uri.joinPath(folders[0].uri, name);
        await (0, projectFile_1.buildProjectYamlToFile)(targetUri, result.data);
        (0, sceneList_1.clearManuscriptCache)();
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.convertLongformToProjectYaml', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            await vscode.window.showInformationMessage('Open a workspace folder first.');
            return;
        }
        let sourceUri;
        const activeDoc = vscode.window.activeTextEditor?.document;
        const activeName = activeDoc?.uri.path.split(/[/\\]/).pop() ?? '';
        const isIndexLike = /index\.(yaml|yml|md)$/i.test(activeName) || activeName.endsWith('manuscript.yaml');
        if (activeDoc && isIndexLike && vscode.workspace.getWorkspaceFolder(activeDoc.uri)) {
            sourceUri = activeDoc.uri;
        }
        if (!sourceUri) {
            const allIndex = await (0, sceneList_1.findAllIndexYaml)();
            if (allIndex.length === 0) {
                await vscode.window.showInformationMessage('No index files found. Create or open a Longform index (e.g. Index.YAML or index.yaml) and try again.');
                return;
            }
            const picked = await vscode.window.showQuickPick(allIndex.map((u) => ({
                label: vscode.workspace.asRelativePath(u),
                uri: u,
            })), { title: 'Select a Longform index to convert', matchOnDescription: true });
            if (!picked)
                return;
            sourceUri = picked.uri;
        }
        const bytes = await vscode.workspace.fs.readFile(sourceUri);
        const content = new TextDecoder().decode(bytes);
        const data = (0, projectYaml_1.parseLongformStrict)(content, sourceUri) ?? (0, projectYaml_1.parseLongformIndexYaml)(content, sourceUri);
        if (!data || data.flatUris.length === 0) {
            await vscode.window.showWarningMessage("This file doesn't appear to be a Longform index, or it has no scenes. Use a file with longform frontmatter and a scenes list.");
            return;
        }
        const name = (0, config_1.getProjectFile)();
        const segments = name.split(/[/\\]/);
        const targetUri = segments.length > 1
            ? vscode.Uri.joinPath(folders[0].uri, ...segments)
            : vscode.Uri.joinPath(folders[0].uri, name);
        try {
            await vscode.workspace.fs.stat(targetUri);
            const overwrite = await vscode.window.showWarningMessage(`"${vscode.workspace.asRelativePath(targetUri)}" already exists. Overwrite with converted project YAML?`, { modal: true }, 'Overwrite');
            if (overwrite !== 'Overwrite')
                return;
        }
        catch {
            // file doesn't exist, proceed
        }
        const dataForNovelTools = {
            ...data,
            longformMeta: undefined,
            projectFileUri: targetUri,
        };
        await (0, projectFile_1.buildProjectYamlToFile)(targetUri, dataForNovelTools);
        await (0, sceneList_1.setActiveProjectUri)(targetUri);
        (0, sceneList_1.clearManuscriptCache)();
        treeDataProvider.refresh();
        await vscode.window.showInformationMessage(`Converted Longform index to ${vscode.workspace.asRelativePath(targetUri)}. You can now use it as your project file.`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openProjectYaml', async () => {
        try {
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'Command started', data: { workspaceFolders: !!vscode.workspace.workspaceFolders?.length }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => { });
            // #endregion
            const openAndFocus = async (uri) => {
                // #region agent log
                fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openAndFocus', message: 'Opening file', data: { uri: uri.fsPath, uriScheme: uri.scheme }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
                // #endregion
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    // #region agent log
                    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openAndFocus', message: 'Document opened', data: { uri: uri.fsPath, fileName: doc.fileName }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
                    // #endregion
                    await vscode.window.showTextDocument(doc, { preview: false });
                    // #region agent log
                    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openAndFocus', message: 'Document shown', data: { uri: uri.fsPath }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
                    // #endregion
                    await (0, sceneList_1.setActiveProjectUri)(uri);
                    (0, sceneList_1.clearManuscriptCache)(uri);
                    treeDataProvider.refresh();
                }
                catch (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openAndFocus', message: 'Error opening file', data: { uri: uri.fsPath, error: String(error), errorMessage: error instanceof Error ? error.message : 'unknown' }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
                    // #endregion
                    throw error;
                }
            };
            const folders = vscode.workspace.workspaceFolders;
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'Checking workspace folders', data: { hasFolders: !!folders?.length, folderCount: folders?.length ?? 0 }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => { });
            // #endregion
            if (!folders?.length) {
                await vscode.window.showInformationMessage('Open a workspace folder first.');
                return;
            }
            // Show file picker to let user select a project YAML file
            const defaultUri = getConfiguredProjectUri();
            const defaultPath = defaultUri ? defaultUri.fsPath : undefined;
            // #region agent log
            const defaultUriExists = defaultUri ? await vscode.workspace.fs.stat(defaultUri).then(() => true, () => false) : false;
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'Before showOpenDialog', data: { defaultUri: defaultUri?.fsPath, defaultUriExists, workspaceRoot: folders[0].uri.fsPath, projectFileConfig: (0, config_1.getProjectFile)() }, timestamp: Date.now(), hypothesisId: 'H3,H5' }) }).catch(() => { });
            // #endregion
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'Calling showOpenDialog', data: {}, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
            // #endregion
            const selectedUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                defaultUri: defaultUri || folders[0].uri,
                openLabel: 'Open Project YAML',
                filters: {
                    'YAML files': ['yaml', 'yml', 'YAML', 'YML'],
                    'All files': ['*']
                },
                title: 'Select Project YAML File'
            });
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'After showOpenDialog', data: { selectedUri: selectedUri?.map(u => u.fsPath), selectedUriLength: selectedUri?.length, selectedUriIsUndefined: selectedUri === undefined, selectedUriIsNull: selectedUri === null }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => { });
            // #endregion
            if (selectedUri && selectedUri.length > 0) {
                await openAndFocus(selectedUri[0]);
                return;
            }
            // If user cancelled, check if there's an existing project file and offer to open it
            const result = await (0, sceneList_1.getManuscript)();
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'After getManuscript', data: { hasProjectFileUri: !!result.projectFileUri, projectFileUri: result.projectFileUri?.fsPath, hasData: !!result.data }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
            if (result.projectFileUri) {
                const choice = await vscode.window.showInformationMessage(`Found existing project file: ${vscode.workspace.asRelativePath(result.projectFileUri)}. Open it?`, 'Open', 'Cancel');
                if (choice === 'Open') {
                    await openAndFocus(result.projectFileUri);
                }
                return;
            }
            // No project file found - offer to create one
            const configuredUri = getConfiguredProjectUri();
            if (configuredUri) {
                const rel = vscode.workspace.asRelativePath(configuredUri);
                const choice = await vscode.window.showInformationMessage(`No project YAML found. Create ${rel}?`, 'Create and Open', 'Build Project YAML', 'Cancel');
                if (choice === 'Create and Open') {
                    const parent = vscode.Uri.joinPath(configuredUri, '..');
                    await vscode.workspace.fs.createDirectory(parent);
                    const starter = 'title: ""\nchapters: []\n';
                    await vscode.workspace.fs.writeFile(configuredUri, Buffer.from(starter, 'utf8'));
                    await openAndFocus(configuredUri);
                    return;
                }
                if (choice === 'Build Project YAML') {
                    await vscode.commands.executeCommand('noveltools.buildProjectYaml');
                }
            }
        }
        catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:openProjectYaml', message: 'Command error', data: { error: String(error), errorMessage: error instanceof Error ? error.message : 'unknown', errorStack: error instanceof Error ? error.stack : undefined }, timestamp: Date.now(), hypothesisId: 'H1,H2,H3' }) }).catch(() => { });
            // #endregion
            await vscode.window.showErrorMessage(`Failed to open project YAML: ${error instanceof Error ? error.message : String(error)}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'noveltools');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.showQuickStart', async () => {
        await openQuickStart(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openStitchedSelection', async (nodeOrItem) => {
        const selectionFromTree = treeView.selection;
        const sceneNodes = selectionFromTree.filter((n) => n.type === 'scene');
        let selectedUris = sceneNodes.map((n) => n.uri);
        if (selectedUris.length === 0) {
            const item = nodeOrItem;
            const itemUri = item && typeof item === 'object' && 'resourceUri' in item
                ? item.resourceUri
                : undefined;
            if (itemUri)
                selectedUris = [itemUri];
        }
        if (selectedUris.length === 0) {
            await vscode.window.showInformationMessage('Select one or more scenes in the Manuscript sidebar (Shift+Click), then run "Open Stitched Selection".');
            return;
        }
        const result = await (0, sceneList_1.getManuscript)();
        if (!result.data) {
            await vscode.window.showInformationMessage('No manuscript loaded.');
            return;
        }
        const selectedSet = new Set(selectedUris.map((u) => u.toString()));
        const lines = [];
        let stitchedCount = 0;
        let currentChapterIndex = -1;
        lines.push('# Stitched Selection', '');
        lines.push(`> ${selectedSet.size} selected ${selectedSet.size === 1 ? 'scene' : 'scenes'}, ordered by project YAML.`, '');
        for (let chapterIndex = 0; chapterIndex < result.data.chapters.length; chapterIndex++) {
            const chapter = result.data.chapters[chapterIndex];
            for (let sceneIndex = 0; sceneIndex < chapter.sceneUris.length; sceneIndex++) {
                const uri = chapter.sceneUris[sceneIndex];
                if (!selectedSet.has(uri.toString()))
                    continue;
                if (currentChapterIndex !== chapterIndex) {
                    const chapterLabel = chapter.title ?? `Chapter ${chapterIndex + 1}`;
                    lines.push(`## ${chapterLabel}`, '');
                    currentChapterIndex = chapterIndex;
                }
                const sceneTitle = sceneTitleFromUri(uri);
                lines.push(`### ${chapterIndex + 1}.${sceneIndex + 1} ${sceneTitle}`);
                lines.push(`*Source:* \`${vscode.workspace.asRelativePath(uri)}\``, '');
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    lines.push(doc.getText().trimEnd(), '');
                }
                catch {
                    lines.push(`> [!warning] Could not read \`${vscode.workspace.asRelativePath(uri)}\`.`, '');
                }
                lines.push('---', '');
                stitchedCount++;
            }
        }
        if (stitchedCount === 0) {
            await vscode.window.showInformationMessage('None of the selected scenes were found in the current manuscript order.');
            return;
        }
        lines[2] = `> ${stitchedCount} stitched ${stitchedCount === 1 ? 'scene' : 'scenes'}, ordered by project YAML.`;
        const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n').trimEnd(),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.renameChapter', async (nodeOrItem) => {
        let selection = (nodeOrItem ?? treeView.selection[0]);
        if (selection?.type !== 'chapter') {
            const item = nodeOrItem ?? treeView.selection[0];
            const label = item && typeof item === 'object' && 'label' in item ? item.label : undefined;
            if (label !== undefined && item && typeof item === 'object' && item.contextValue === 'chapter') {
                const result = await (0, sceneList_1.getManuscript)();
                if (result.data?.projectFileUri) {
                    const chapterIndex = result.data.chapters.findIndex((ch, i) => (ch.title ?? `Chapter ${i + 1}`) === label);
                    if (chapterIndex >= 0) {
                        selection = {
                            type: 'chapter',
                            chapterIndex,
                            label: String(label),
                            data: result.data,
                        };
                    }
                }
            }
        }
        if (selection?.type !== 'chapter') {
            await vscode.window.showInformationMessage('Select a chapter in the Manuscript view to rename it.');
            return;
        }
        const currentName = selection.label;
        const name = await vscode.window.showInputBox({
            title: 'Rename Chapter',
            value: currentName,
            prompt: 'Enter the chapter name for the manuscript and YAML.',
        });
        if (name === undefined)
            return;
        const data = selection.data;
        if (!data.projectFileUri)
            return;
        const chapters = data.chapters.map((ch, i) => i === selection.chapterIndex ? { ...ch, title: name.trim() || undefined } : ch);
        const updated = {
            ...data,
            chapters,
            flatUris: chapters.flatMap((ch) => ch.sceneUris),
        };
        await (0, projectFile_1.writeProjectYaml)(data.projectFileUri, updated);
        (0, sceneList_1.clearManuscriptCache)(data.projectFileUri);
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.removeScene', async (nodeOrItem) => {
        let selection = (nodeOrItem ?? treeView.selection[0]);
        if (selection?.type !== 'scene') {
            const item = nodeOrItem ?? treeView.selection[0];
            const uri = item && typeof item === 'object' && 'resourceUri' in item ? item.resourceUri : undefined;
            if (uri && item && typeof item === 'object' && item.contextValue === 'scene') {
                const result = await (0, sceneList_1.getManuscript)();
                if (result.data?.projectFileUri) {
                    for (let ci = 0; ci < result.data.chapters.length; ci++) {
                        const si = result.data.chapters[ci].sceneUris.findIndex((u) => u.toString() === uri.toString());
                        if (si >= 0) {
                            selection = {
                                type: 'scene',
                                chapterIndex: ci,
                                sceneIndex: si,
                                uri,
                                label: item.label ?? path.basename(uri.fsPath),
                                data: result.data,
                            };
                            break;
                        }
                    }
                }
            }
        }
        if (selection?.type !== 'scene') {
            await vscode.window.showInformationMessage('Select a scene in the Manuscript view to remove it.');
            return;
        }
        const data = selection.data;
        if (!data.projectFileUri)
            return;
        const confirm = await vscode.window.showWarningMessage(`Remove "${selection.label}" from the manuscript? The file will not be deleted from disk.`, { modal: true }, 'Remove');
        if (confirm !== 'Remove')
            return;
        const updated = (0, projectYaml_1.removeScene)(data, selection.chapterIndex, selection.sceneIndex);
        await (0, projectFile_1.writeProjectYaml)(data.projectFileUri, updated);
        (0, sceneList_1.clearManuscriptCache)(data.projectFileUri);
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.deleteScene', async (nodeOrItem) => {
        let selection = (nodeOrItem ?? treeView.selection[0]);
        if (selection?.type !== 'scene') {
            const item = nodeOrItem ?? treeView.selection[0];
            const uri = item && typeof item === 'object' && 'resourceUri' in item ? item.resourceUri : undefined;
            if (uri && item && typeof item === 'object' && item.contextValue === 'scene') {
                const result = await (0, sceneList_1.getManuscript)();
                if (result.data?.projectFileUri) {
                    for (let ci = 0; ci < result.data.chapters.length; ci++) {
                        const si = result.data.chapters[ci].sceneUris.findIndex((u) => u.toString() === uri.toString());
                        if (si >= 0) {
                            selection = {
                                type: 'scene',
                                chapterIndex: ci,
                                sceneIndex: si,
                                uri,
                                label: item.label ?? path.basename(uri.fsPath),
                                data: result.data,
                            };
                            break;
                        }
                    }
                }
            }
        }
        if (selection?.type !== 'scene') {
            await vscode.window.showInformationMessage('Select a scene in the Manuscript view to delete.');
            return;
        }
        const data = selection.data;
        if (!data.projectFileUri)
            return;
        const fileLabel = path.basename(selection.uri.fsPath);
        const confirm = await vscode.window.showWarningMessage(`Delete scene "${selection.label}"? It will be removed from the manuscript and the file "${fileLabel}" will be deleted from disk. This cannot be undone.`, { modal: true }, 'Delete');
        if (confirm !== 'Delete')
            return;
        const updated = (0, projectYaml_1.removeScene)(data, selection.chapterIndex, selection.sceneIndex);
        await (0, projectFile_1.writeProjectYaml)(data.projectFileUri, updated);
        (0, sceneList_1.clearManuscriptCache)(data.projectFileUri);
        try {
            await vscode.workspace.fs.delete(selection.uri);
        }
        catch (err) {
            await vscode.window.showErrorMessage(`Removed from manuscript, but could not delete file: ${err instanceof Error ? err.message : String(err)}`);
        }
        const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === selection.uri.toString());
        if (doc) {
            await vscode.window.showTextDocument(doc, { preserveFocus: false });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.removeChapter', async (nodeOrItem) => {
        let selection = (nodeOrItem ?? treeView.selection[0]);
        if (selection?.type !== 'chapter') {
            const item = nodeOrItem ?? treeView.selection[0];
            const label = item && typeof item === 'object' && 'label' in item ? item.label : undefined;
            if (label !== undefined && item && typeof item === 'object' && item.contextValue === 'chapter') {
                const result = await (0, sceneList_1.getManuscript)();
                if (result.data?.projectFileUri) {
                    const chapterIndex = result.data.chapters.findIndex((ch, i) => (ch.title ?? `Chapter ${i + 1}`) === label);
                    if (chapterIndex >= 0) {
                        selection = {
                            type: 'chapter',
                            chapterIndex,
                            label: String(label),
                            data: result.data,
                        };
                    }
                }
            }
        }
        if (selection?.type !== 'chapter') {
            await vscode.window.showInformationMessage('Select a chapter in the Manuscript view to remove it.');
            return;
        }
        const data = selection.data;
        if (!data.projectFileUri)
            return;
        const ch = data.chapters[selection.chapterIndex];
        const sceneCount = ch?.sceneUris.length ?? 0;
        const confirm = await vscode.window.showWarningMessage(`Remove chapter "${selection.label}" and its ${sceneCount} scene(s) from the manuscript? Scene files will not be deleted from disk.`, { modal: true }, 'Remove');
        if (confirm !== 'Remove')
            return;
        const updated = (0, projectYaml_1.removeChapter)(data, selection.chapterIndex);
        await (0, projectFile_1.writeProjectYaml)(data.projectFileUri, updated);
        (0, sceneList_1.clearManuscriptCache)(data.projectFileUri);
        treeDataProvider.refresh();
    }));
    async function resolveSceneSelection(nodeOrItem) {
        let selection = (nodeOrItem ?? treeView.selection[0]);
        if (selection?.type === 'scene')
            return selection;
        const item = nodeOrItem ?? treeView.selection[0];
        const uri = item && typeof item === 'object' && 'resourceUri' in item ? item.resourceUri : undefined;
        if (!uri || !item || typeof item !== 'object' || item.contextValue !== 'scene')
            return undefined;
        const result = await (0, sceneList_1.getManuscript)();
        if (!result.data?.projectFileUri)
            return undefined;
        for (let ci = 0; ci < result.data.chapters.length; ci++) {
            const ch = result.data.chapters[ci];
            const si = ch.sceneUris.findIndex((u) => u.toString() === uri.toString());
            if (si >= 0) {
                const scenePath = ch.scenePaths[si] ?? path.relative(path.dirname(result.data.projectFileUri.fsPath), uri.fsPath);
                const pathKey = scenePath.split(path.sep).join('/');
                return {
                    type: 'scene',
                    chapterIndex: ci,
                    sceneIndex: si,
                    uri,
                    label: item.label ?? path.basename(uri.fsPath),
                    status: result.data.sceneStatus?.[pathKey],
                    data: result.data,
                };
            }
        }
        return undefined;
    }
    async function applySectionStatus(nodeOrItem, status) {
        const selection = await resolveSceneSelection(nodeOrItem);
        if (!selection) {
            await vscode.window.showInformationMessage('Select a scene in the Manuscript view to set its status.');
            return;
        }
        const data = selection.data;
        if (!data.projectFileUri) {
            await vscode.window.showInformationMessage('Section status is saved in the project YAML. Open or create a project file first.');
            return;
        }
        const ch = data.chapters[selection.chapterIndex];
        const scenePath = ch.scenePaths[selection.sceneIndex] ?? path.relative(path.dirname(data.projectFileUri.fsPath), selection.uri.fsPath);
        const pathKey = scenePath.split(path.sep).join('/');
        const sceneStatus = { ...data.sceneStatus };
        if (status === null) {
            delete sceneStatus[pathKey];
        }
        else {
            sceneStatus[pathKey] = status;
        }
        const updated = {
            ...data,
            sceneStatus: Object.keys(sceneStatus).length ? sceneStatus : undefined,
        };
        await (0, projectFile_1.writeProjectYaml)(data.projectFileUri, updated);
        (0, sceneList_1.clearManuscriptCache)(data.projectFileUri);
        treeDataProvider.refresh();
    }
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.setSectionStatusDone', (nodeOrItem) => applySectionStatus(nodeOrItem, 'done')));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.setSectionStatusDrafted', (nodeOrItem) => applySectionStatus(nodeOrItem, 'drafted')));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.setSectionStatusSpiked', (nodeOrItem) => applySectionStatus(nodeOrItem, 'spiked')));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.clearSectionStatus', (nodeOrItem) => applySectionStatus(nodeOrItem, null)));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.setSectionStatus', async (nodeOrItem) => {
        const selection = await resolveSceneSelection(nodeOrItem);
        if (!selection) {
            await vscode.window.showInformationMessage('Select a scene in the Manuscript view to set its status.');
            return;
        }
        const data = selection.data;
        if (!data.projectFileUri) {
            await vscode.window.showInformationMessage('Section status is saved in the project YAML. Open or create a project file first.');
            return;
        }
        const choice = await vscode.window.showQuickPick([
            { label: '🟢 Done', value: 'done' },
            { label: '🟡 Drafted', value: 'drafted' },
            { label: '🔴 Spiked out', value: 'spiked' },
            { label: '$(clear) Clear status', value: null },
        ], { title: 'Set section status', placeHolder: selection.label });
        if (choice === undefined)
            return;
        await applySectionStatus(nodeOrItem, choice.value);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.selectDocument', async () => {
        const allIndex = await (0, sceneList_1.findAllIndexYaml)();
        if (allIndex.length <= 1)
            return;
        const items = await Promise.all(allIndex.map(async (uri) => {
            const result = await (0, sceneList_1.getManuscriptByUri)(uri);
            const label = result.data?.title ?? vscode.workspace.asRelativePath(uri);
            return { label, uri, result };
        }));
        const picked = await vscode.window.showQuickPick(items.map((i) => ({ label: i.label, description: vscode.workspace.asRelativePath(i.uri), uri: i.uri })), { title: 'Select manuscript document', matchOnDescription: true });
        if (picked) {
            await (0, sceneList_1.setActiveProjectUri)(picked.uri);
            treeDataProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        const name = doc.uri.path.split(/[/\\]/).pop() ?? '';
        if (isConfiguredProjectFile(doc.uri) || isIndexLikeFileName(name)) {
            (0, sceneList_1.clearManuscriptCache)(doc.uri);
            treeDataProvider.refresh();
        }
    }));
}
class ManuscriptTreeDataProvider {
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.dragMimeTypes = [MIME_TREE];
        this.dropMimeTypes = [MIME_TREE];
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        const collapsible = element.type === 'root' || element.type === 'document'
            ? vscode.TreeItemCollapsibleState.Expanded
            : element.type === 'chapter'
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(getTreeItemLabel(element), collapsible);
        if (element.type === 'scene') {
            item.resourceUri = element.uri;
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [element.uri],
            };
        }
        if (element.type === 'root') {
            const chapterCount = element.data?.chapters.length ?? 0;
            const sceneCount = element.data?.flatUris.length ?? 0;
            if (element.data) {
                item.iconPath = new vscode.ThemeIcon('book');
                item.description = `${formatChapterCount(chapterCount)} · ${formatSceneCount(sceneCount)}`;
                item.tooltip = `${element.label}\n${chapterCount} chapters, ${sceneCount} scenes`;
            }
            else {
                item.iconPath = new vscode.ThemeIcon('warning');
                item.description = 'No parsed manuscript';
                item.tooltip = element.label;
                item.command = {
                    command: 'noveltools.openProjectYaml',
                    title: 'Open Project YAML',
                };
            }
        }
        if (element.type === 'document') {
            const rel = vscode.workspace.asRelativePath(element.projectFileUri);
            item.iconPath = new vscode.ThemeIcon('library');
            item.description = rel;
            const tooltip = new vscode.MarkdownString(undefined, true);
            tooltip.appendMarkdown(`**${element.label}**\n\n`);
            tooltip.appendCodeblock(rel);
            item.tooltip = tooltip;
        }
        if (element.type === 'chapter') {
            const chapter = element.data.chapters[element.chapterIndex];
            const sceneCount = chapter?.sceneUris.length ?? 0;
            item.iconPath = new vscode.ThemeIcon('book');
            item.description = formatSceneCount(sceneCount);
            item.tooltip = `${element.label}\n${formatSceneCount(sceneCount)}`;
        }
        if (element.type === 'scene') {
            const rel = vscode.workspace.asRelativePath(element.uri);
            if (element.status) {
                item.iconPath = new vscode.ThemeIcon(STATUS_ICON[element.status]);
                item.description = element.status;
            }
            const tooltip = new vscode.MarkdownString(undefined, true);
            tooltip.appendMarkdown(`**${element.label}**\n\n`);
            tooltip.appendCodeblock(rel);
            item.tooltip = tooltip;
        }
        item.contextValue = element.type;
        return item;
    }
    async getChildren(element) {
        try {
            const allIndex = await (0, sceneList_1.findAllIndexYaml)();
            if (allIndex.length > 1 && !element) {
                const nodes = [];
                for (const uri of allIndex) {
                    const result = await (0, sceneList_1.getManuscriptByUri)(uri);
                    const label = result.data?.title ?? vscode.workspace.asRelativePath(uri);
                    nodes.push({ type: 'document', label, projectFileUri: uri });
                }
                await updateViewContext(await (0, sceneList_1.getManuscript)());
                return nodes;
            }
            if (element?.type === 'document') {
                await (0, sceneList_1.setActiveProjectUri)(element.projectFileUri);
                const result = await (0, sceneList_1.getManuscriptByUri)(element.projectFileUri);
                await updateViewContext(result);
                // #region agent log
                if (!result.data) {
                    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:getChildren(document)', message: 'Document has no data', data: { uri: vscode.workspace.asRelativePath(element.projectFileUri) }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => { });
                    return [];
                }
                // #endregion
                return result.data.chapters.map((ch, i) => ({
                    type: 'chapter',
                    chapterIndex: i,
                    label: ch.title ?? `Chapter ${i + 1}`,
                    data: result.data,
                }));
            }
            const result = await (0, sceneList_1.getManuscript)();
            await updateViewContext(result);
            // #region agent log
            if (!element && result.data) {
                fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'manuscriptView.ts:getChildren(root)', message: 'Tree root data', data: { projectFileRelative: result.projectFileUri ? vscode.workspace.asRelativePath(result.projectFileUri) : null, chaptersCount: result.data.chapters.length, sceneCounts: result.data.chapters.map(c => c.sceneUris.length) }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => { });
            }
            // #endregion
            if (!result.data && !element) {
                if (result.projectFileUri) {
                    const rel = vscode.workspace.asRelativePath(result.projectFileUri);
                    return [{
                            type: 'root',
                            label: `Could not parse ${rel}. Fix YAML and refresh.`,
                            data: null,
                        }];
                }
                return [{
                        type: 'root',
                        label: 'No manuscript found. Build Project YAML to get started.',
                        data: null,
                    }];
            }
            if (element) {
                if (element.type === 'root' && element.data) {
                    return element.data.chapters.map((ch, i) => ({
                        type: 'chapter',
                        chapterIndex: i,
                        label: ch.title ?? `Chapter ${i + 1}`,
                        data: element.data,
                    }));
                }
                if (element.type === 'chapter') {
                    const ch = element.data.chapters[element.chapterIndex];
                    return ch.sceneUris.map((uri, i) => {
                        const scenePath = ch.scenePaths[i] ?? path.relative(element.data.projectFileUri ? path.dirname(element.data.projectFileUri.fsPath) : '', uri.fsPath);
                        const pathKey = scenePath.split(path.sep).join('/');
                        const status = element.data.sceneStatus?.[pathKey];
                        return {
                            type: 'scene',
                            chapterIndex: element.chapterIndex,
                            sceneIndex: i,
                            uri,
                            label: path.basename(uri.fsPath),
                            status,
                            data: element.data,
                        };
                    });
                }
                return [];
            }
            if (!result.data) {
                return [];
            }
            const label = result.data?.title ?? 'Manuscript';
            return [{ type: 'root', label, data: result.data ?? null }];
        }
        catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            console.error('[NovelTools] Manuscript tree load failed:', err);
            return [{
                    type: 'root',
                    label: `Manuscript view failed to load (${detail.slice(0, 120)}). Click to open project YAML.`,
                    data: null,
                }];
        }
    }
    async handleDrag(source, dataTransfer, _token) {
        const payload = source.map((n) => ({
            type: n.type,
            chapterIndex: n.type !== 'root' && n.type !== 'document' ? n.chapterIndex : -1,
            sceneIndex: n.type === 'scene' ? n.sceneIndex : -1,
            projectFileUri: n.type === 'chapter' || n.type === 'scene' ? n.data.projectFileUri?.toString() : undefined,
        }));
        dataTransfer.set(MIME_TREE, new vscode.DataTransferItem(JSON.stringify(payload)));
    }
    async handleDrop(target, dataTransfer, _token) {
        const item = dataTransfer.get(MIME_TREE);
        if (!item?.value)
            return;
        let payload;
        try {
            payload = JSON.parse(item.value);
        }
        catch {
            return;
        }
        if (payload.length === 0)
            return;
        const source = payload[0];
        const targetProjectUri = !target
            ? null
            : target.type === 'document'
                ? target.projectFileUri
                : target.type === 'chapter' || target.type === 'scene'
                    ? target.data.projectFileUri
                    : null;
        let result;
        if (targetProjectUri) {
            result = await (0, sceneList_1.getManuscriptByUri)(targetProjectUri);
        }
        else {
            result = await (0, sceneList_1.getManuscript)();
        }
        if (!result.data)
            return;
        if (!result.projectFileUri) {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length)
                return;
            const name = (0, config_1.getProjectFile)();
            const segments = name.split(/[/\\]/);
            const targetUri = segments.length > 1
                ? vscode.Uri.joinPath(folders[0].uri, ...segments)
                : vscode.Uri.joinPath(folders[0].uri, name);
            await (0, projectFile_1.buildProjectYamlToFile)(targetUri, result.data);
            (0, sceneList_1.clearManuscriptCache)();
            result = await (0, sceneList_1.getManuscript)();
        }
        if (!result.data || !result.projectFileUri)
            return;
        if (source.projectFileUri && result.projectFileUri && source.projectFileUri !== result.projectFileUri.toString()) {
            return;
        }
        if (source.type === 'chapter') {
            const fromIdx = source.chapterIndex;
            let toIdx;
            if (!target || target.type === 'document')
                toIdx = result.data.chapters.length - 1;
            else if (target.type === 'chapter')
                toIdx = target.chapterIndex;
            else if (target.type === 'scene')
                toIdx = target.chapterIndex;
            else
                return;
            if (fromIdx === toIdx)
                return;
            const next = (0, projectYaml_1.reorderChapters)(result.data, fromIdx, toIdx);
            await (0, projectFile_1.writeProjectYaml)(result.projectFileUri, next);
        }
        else if (source.type === 'scene') {
            const fromCh = source.chapterIndex;
            const fromSc = source.sceneIndex;
            let toCh;
            let toSc;
            if (!target || target.type === 'document') {
                toCh = result.data.chapters.length - 1;
                toSc = result.data.chapters[toCh].sceneUris.length;
            }
            else if (target.type === 'chapter') {
                toCh = target.chapterIndex;
                toSc = result.data.chapters[toCh].sceneUris.length;
            }
            else if (target.type === 'scene') {
                toCh = target.chapterIndex;
                toSc = target.sceneIndex;
            }
            else
                return;
            const next = (0, projectYaml_1.moveScene)(result.data, fromCh, fromSc, toCh, toSc);
            await (0, projectFile_1.writeProjectYaml)(result.projectFileUri, next);
        }
        (0, sceneList_1.clearManuscriptCache)(result.projectFileUri);
        this.refresh();
    }
}
async function updateViewContext(result) {
    await vscode.commands.executeCommand('setContext', 'noveltools.hasProjectFile', !!result.projectFileUri);
    await vscode.commands.executeCommand('setContext', 'noveltools.hasScenes', result.flatUris.length > 0);
    const allIndex = await (0, sceneList_1.findAllIndexYaml)();
    await vscode.commands.executeCommand('setContext', 'noveltools.hasMultipleDocuments', allIndex.length > 1);
}
async function openQuickStart(context) {
    const readmeUri = vscode.Uri.joinPath(context.extensionUri, 'README.md');
    try {
        const doc = await vscode.workspace.openTextDocument(readmeUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
    }
    catch {
        // Fall back to an in-memory quick start guide.
    }
    const doc = await vscode.workspace.openTextDocument({
        content: QUICK_START_FALLBACK,
        language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });
}
//# sourceMappingURL=manuscriptView.js.map
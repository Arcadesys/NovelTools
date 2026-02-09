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
function getTreeItemLabel(node) {
    switch (node.type) {
        case 'root':
            return node.label;
        case 'chapter':
            return node.label;
        case 'scene':
            return node.label;
    }
}
function registerManuscriptView(context) {
    const treeDataProvider = new ManuscriptTreeDataProvider();
    const treeView = vscode.window.createTreeView(VIEW_ID, {
        treeDataProvider,
        dragAndDropController: treeDataProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    treeView.onDidChangeSelection(async (e) => {
        const node = e.selection[0];
        if (node?.type === 'scene') {
            await vscode.window.showTextDocument(node.uri);
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
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openProjectYaml', async () => {
        const result = await (0, sceneList_1.getManuscript)();
        if (result.projectFileUri) {
            const doc = await vscode.workspace.openTextDocument(result.projectFileUri);
            await vscode.window.showTextDocument(doc, { preview: false });
            return;
        }
        const choice = await vscode.window.showInformationMessage('No project YAML found. Build one now?', 'Build Project YAML');
        if (choice === 'Build Project YAML') {
            await vscode.commands.executeCommand('noveltools.buildProjectYaml');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'noveltools');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.showQuickStart', async () => {
        await openQuickStart(context);
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        const name = doc.uri.path.split(/[/\\]/).pop();
        if (name === 'noveltools.yaml' || name?.endsWith('manuscript.yaml')) {
            (0, sceneList_1.clearManuscriptCache)();
            treeDataProvider.refresh();
        }
    }));
}
class ManuscriptTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.dragMimeTypes = [MIME_TREE];
        this.dropMimeTypes = [MIME_TREE];
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(getTreeItemLabel(element), element.type === 'root' ? vscode.TreeItemCollapsibleState.Expanded
            : element.type === 'chapter' ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None);
        if (element.type === 'scene') {
            item.resourceUri = element.uri;
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [element.uri],
            };
        }
        item.contextValue = element.type;
        return item;
    }
    async getChildren(element) {
        const result = await (0, sceneList_1.getManuscript)();
        await updateViewContext(result);
        if (!result.data && !element) {
            return [];
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
                return element.data.chapters[element.chapterIndex].sceneUris.map((uri, i) => ({
                    type: 'scene',
                    chapterIndex: element.chapterIndex,
                    sceneIndex: i,
                    uri,
                    label: uri.path.split(/[/\\]/).pop() ?? uri.fsPath,
                    data: element.data,
                }));
            }
            return [];
        }
        if (!result.data) {
            return [];
        }
        const label = result.data?.title ?? 'Manuscript';
        return [{ type: 'root', label, data: result.data ?? null }];
    }
    async handleDrag(source, dataTransfer, _token) {
        const payload = source.map((n) => ({
            type: n.type,
            chapterIndex: n.type !== 'root' ? n.chapterIndex : -1,
            sceneIndex: n.type === 'scene' ? n.sceneIndex : -1,
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
        let result = await (0, sceneList_1.getManuscript)();
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
        if (source.type === 'chapter') {
            const fromIdx = source.chapterIndex;
            let toIdx;
            if (!target)
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
            if (!target) {
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
        (0, sceneList_1.clearManuscriptCache)();
        this.refresh();
    }
}
async function updateViewContext(result) {
    await vscode.commands.executeCommand('setContext', 'noveltools.hasProjectFile', !!result.projectFileUri);
    await vscode.commands.executeCommand('setContext', 'noveltools.hasScenes', result.flatUris.length > 0);
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
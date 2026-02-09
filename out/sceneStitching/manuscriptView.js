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
const sceneList_1 = require("./sceneList");
const projectYaml_1 = require("./projectYaml");
const VIEW_ID = 'noveltools.manuscript';
const MIME_TREE = `application/vnd.code.tree.${VIEW_ID}`;
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
        if (!result.data && !element) {
            return [{ type: 'root', label: 'No manuscript. Add a noveltools.yaml to get started.', data: null }];
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
        const result = await (0, sceneList_1.getManuscript)();
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
            await writeProjectYaml(result.projectFileUri, next);
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
            await writeProjectYaml(result.projectFileUri, next);
        }
        (0, sceneList_1.clearManuscriptCache)();
        this.refresh();
    }
}
async function writeProjectYaml(uri, data) {
    const yaml = (0, projectYaml_1.serializeToYaml)(data);
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, yaml);
    await vscode.workspace.applyEdit(edit);
}
//# sourceMappingURL=manuscriptView.js.map
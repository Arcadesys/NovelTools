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
exports.registerWordCount = registerWordCount;
const vscode = __importStar(require("vscode"));
const counter_1 = require("./counter");
const config_1 = require("../config");
const sceneList_1 = require("../sceneStitching/sceneList");
let documentItem;
let manuscriptItem;
let manuscriptUrisCache = [];
function formatCount(n) {
    return n.toLocaleString();
}
function updateDocumentCount(doc) {
    if (!documentItem)
        return;
    if (!doc || doc.languageId !== 'markdown') {
        documentItem.hide();
        return;
    }
    const strip = (0, config_1.getWordCountStripMarkdown)();
    const count = strip ? (0, counter_1.countWords)(doc.getText(), true) : (0, counter_1.getDocumentWords)(doc);
    documentItem.text = `$(book) Words: ${formatCount(count)}`;
    documentItem.show();
}
async function updateManuscriptCount() {
    if (!manuscriptItem)
        return;
    const scope = (0, config_1.getWordCountManuscriptScope)();
    if (scope === 'workspace') {
        const files = await vscode.workspace.findFiles('**/*.md');
        manuscriptUrisCache = files;
    }
    else {
        const result = await (0, sceneList_1.getManuscriptUris)();
        manuscriptUrisCache = result.flatUris;
    }
    if (manuscriptUrisCache.length === 0) {
        manuscriptItem.hide();
        return;
    }
    const strip = (0, config_1.getWordCountStripMarkdown)();
    const total = await (0, counter_1.getManuscriptWordCount)(manuscriptUrisCache, strip);
    manuscriptItem.text = `$(library) Manuscript: ${formatCount(total)} words`;
    manuscriptItem.show();
}
function isManuscriptFile(uri) {
    return manuscriptUrisCache.some((u) => u.toString() === uri.toString());
}
function registerWordCount(context) {
    documentItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    manuscriptItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    context.subscriptions.push(documentItem, manuscriptItem);
    updateDocumentCount(vscode.window.activeTextEditor?.document);
    updateManuscriptCount();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
        updateDocumentCount(e?.document);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        const active = vscode.window.activeTextEditor?.document;
        if (active && e.document.uri.toString() === active.uri.toString()) {
            updateDocumentCount(active);
        }
        if ((0, config_1.getWordCountManuscriptScope)() === 'project' && isManuscriptFile(e.document.uri)) {
            updateManuscriptCount();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('noveltools')) {
            updateDocumentCount(vscode.window.activeTextEditor?.document);
            updateManuscriptCount();
        }
    }));
}
//# sourceMappingURL=statusBar.js.map
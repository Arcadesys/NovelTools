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
exports.registerMoveChapter = registerMoveChapter;
const vscode = __importStar(require("vscode"));
const sceneList_1 = require("./sceneList");
const projectYaml_1 = require("./projectYaml");
const projectFile_1 = require("./projectFile");
function registerMoveChapter(context) {
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.moveChapterUp', () => moveChapter(-1)), vscode.commands.registerCommand('noveltools.moveChapterDown', () => moveChapter(1)));
}
async function moveChapter(delta) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const result = await (0, sceneList_1.getManuscript)();
    if (!result.data || !result.projectFileUri) {
        await vscode.window.showInformationMessage('No project YAML file. Create a noveltools.yaml with chapters to move.');
        return;
    }
    const current = editor.document.uri.toString();
    let chapterIndex = -1;
    for (let i = 0; i < result.data.chapters.length; i++) {
        if (result.data.chapters[i].sceneUris.some((u) => u.toString() === current)) {
            chapterIndex = i;
            break;
        }
    }
    if (chapterIndex < 0) {
        await vscode.window.showInformationMessage('Current file is not in the manuscript.');
        return;
    }
    const toIndex = chapterIndex + delta;
    if (toIndex < 0 || toIndex >= result.data.chapters.length)
        return;
    const next = (0, projectYaml_1.reorderChapters)(result.data, chapterIndex, toIndex);
    await (0, projectFile_1.writeProjectYaml)(result.projectFileUri, next);
    (0, sceneList_1.clearManuscriptCache)();
}
//# sourceMappingURL=moveChapter.js.map
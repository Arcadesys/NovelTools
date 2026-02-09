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
exports.registerNavigation = registerNavigation;
const vscode = __importStar(require("vscode"));
const sceneList_1 = require("./sceneList");
function registerNavigation(context) {
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.nextScene', () => goAdjacentScene(1)), vscode.commands.registerCommand('noveltools.previousScene', () => goAdjacentScene(-1)), vscode.commands.registerCommand('noveltools.goToScene', goToScenePicker), vscode.commands.registerCommand('noveltools.nextChapter', () => goAdjacentChapter(1)), vscode.commands.registerCommand('noveltools.previousChapter', () => goAdjacentChapter(-1)), vscode.commands.registerCommand('noveltools.goToChapter', goToChapterPicker));
}
async function goAdjacentScene(delta) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const { flatUris } = await (0, sceneList_1.getManuscript)();
    if (flatUris.length === 0)
        return;
    const current = editor.document.uri.toString();
    const idx = flatUris.findIndex((u) => u.toString() === current);
    if (idx < 0)
        return;
    const nextIdx = (idx + delta + flatUris.length) % flatUris.length;
    const uri = flatUris[nextIdx];
    await vscode.window.showTextDocument(uri);
}
async function goToScenePicker() {
    const { data, flatUris } = await (0, sceneList_1.getManuscript)();
    if (flatUris.length === 0) {
        await vscode.window.showInformationMessage('No scenes in manuscript.');
        return;
    }
    const current = vscode.window.activeTextEditor?.document.uri.toString();
    const items = [];
    let chapterLabel = '';
    flatUris.forEach((uri, i) => {
        if (data?.chapters) {
            let chIdx = 0;
            let acc = 0;
            for (let c = 0; c < data.chapters.length; c++) {
                if (i < acc + data.chapters[c].sceneUris.length) {
                    chIdx = c;
                    break;
                }
                acc += data.chapters[c].sceneUris.length;
            }
            const ch = data.chapters[chIdx];
            chapterLabel = ch?.title ? ch.title : `Chapter ${chIdx + 1}`;
        }
        const label = uri.path.split(/[/\\]/).pop() ?? uri.fsPath;
        items.push({
            label,
            description: chapterLabel,
            uri,
        });
    });
    const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'Go to scene…',
    });
    if (picked)
        await vscode.window.showTextDocument(picked.uri);
}
async function goAdjacentChapter(delta) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.chapters.length === 0)
        return;
    const current = editor.document.uri.toString();
    let currentChIdx = -1;
    for (let i = 0; i < data.chapters.length; i++) {
        if (data.chapters[i].sceneUris.some((u) => u.toString() === current)) {
            currentChIdx = i;
            break;
        }
    }
    if (currentChIdx < 0)
        return;
    const nextChIdx = (currentChIdx + delta + data.chapters.length) % data.chapters.length;
    const firstUri = data.chapters[nextChIdx].sceneUris[0];
    if (firstUri)
        await vscode.window.showTextDocument(firstUri);
}
async function goToChapterPicker() {
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.chapters.length === 0) {
        await vscode.window.showInformationMessage('No chapters in manuscript.');
        return;
    }
    const items = data.chapters.map((ch, i) => ({
        label: ch.title ?? `Chapter ${i + 1}`,
        description: `${ch.sceneUris.length} scene(s)`,
        chapterIndex: i,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Go to chapter…' });
    if (picked) {
        const uri = data.chapters[picked.chapterIndex].sceneUris[0];
        if (uri)
            await vscode.window.showTextDocument(uri);
    }
}
//# sourceMappingURL=navigation.js.map
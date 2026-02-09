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
exports.registerMoveScene = registerMoveScene;
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const sceneList_1 = require("./sceneList");
const projectYaml_1 = require("./projectYaml");
const projectFile_1 = require("./projectFile");
function registerMoveScene(context) {
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.moveSceneUp', (node) => moveScene(node, -1)), vscode.commands.registerCommand('noveltools.moveSceneDown', (node) => moveScene(node, 1)));
}
async function moveScene(node, delta) {
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
    let fromCh = -1;
    let fromSc = -1;
    if (node?.type === 'scene') {
        fromCh = node.chapterIndex;
        fromSc = node.sceneIndex;
    }
    else {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const current = editor.document.uri.toString();
        for (let ch = 0; ch < result.data.chapters.length; ch++) {
            const chapter = result.data.chapters[ch];
            for (let sc = 0; sc < chapter.sceneUris.length; sc++) {
                if (chapter.sceneUris[sc].toString() === current) {
                    fromCh = ch;
                    fromSc = sc;
                    break;
                }
            }
            if (fromCh >= 0)
                break;
        }
    }
    if (fromCh < 0 || fromSc < 0) {
        await vscode.window.showInformationMessage('Current file is not in the manuscript.');
        return;
    }
    const chapters = result.data.chapters;
    const fromChapter = chapters[fromCh];
    if (!fromChapter)
        return;
    let toCh = fromCh;
    let toSc = fromSc;
    if (delta < 0) {
        if (fromSc > 0) {
            toSc = fromSc - 1;
        }
        else if (fromCh > 0) {
            toCh = fromCh - 1;
            toSc = chapters[toCh].sceneUris.length;
        }
        else {
            return;
        }
    }
    else {
        if (fromSc < fromChapter.sceneUris.length - 1) {
            toSc = fromSc + 1;
        }
        else if (fromCh < chapters.length - 1) {
            toCh = fromCh + 1;
            toSc = 0;
        }
        else {
            return;
        }
    }
    const next = (0, projectYaml_1.moveScene)(result.data, fromCh, fromSc, toCh, toSc);
    await (0, projectFile_1.writeProjectYaml)(result.projectFileUri, next);
    (0, sceneList_1.clearManuscriptCache)();
    await vscode.commands.executeCommand('noveltools.refreshManuscript');
}
//# sourceMappingURL=moveScene.js.map
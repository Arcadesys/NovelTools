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
exports.registerStitchedProvider = registerStitchedProvider;
const vscode = __importStar(require("vscode"));
const sceneList_1 = require("./sceneList");
const SCHEME = 'noveltools';
const AUTHORITY = 'stitched';
const MANUSCRIPT_PATH = 'manuscript';
function registerStitchedProvider(context) {
    const provider = new (class {
        provideTextDocumentContent(uri, _token) {
            return buildStitchedContent();
        }
    })();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openStitchedManuscript', async () => {
        const uri = vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${MANUSCRIPT_PATH}`);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    }));
}
async function buildStitchedContent() {
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.flatUris.length === 0)
        return 'No manuscript. Add a noveltools.yaml or scenes.';
    const parts = [];
    let chapterIndex = 0;
    for (const ch of data.chapters) {
        if (ch.title) {
            parts.push(`## ${ch.title}\n\n`);
        }
        else {
            chapterIndex++;
            parts.push(`## Chapter ${chapterIndex}\n\n`);
        }
        for (const uri of ch.sceneUris) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                parts.push(doc.getText());
                parts.push('\n\n');
            }
            catch {
                parts.push(`<!-- ${uri.fsPath} (unreadable) -->\n\n`);
            }
        }
    }
    return parts.join('').trimEnd();
}
//# sourceMappingURL=stitchedProvider.js.map
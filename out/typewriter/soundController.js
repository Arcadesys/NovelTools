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
exports.registerTypewriterSound = registerTypewriterSound;
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const soundWebview_1 = require("./soundWebview");
const THROTTLE_MS = 100;
const MAX_CHANGE_LENGTH = 20;
let lastPlayTime = 0;
function getSoundWebviewUri(context, webviewPanel) {
    const customPath = (0, config_1.getTypewriterSoundPath)();
    if (customPath) {
        try {
            return webviewPanel.webview.asWebviewUri(vscode.Uri.file(customPath));
        }
        catch {
            // fall through to bundled
        }
    }
    try {
        const wav = vscode.Uri.joinPath(context.extensionUri, 'media', 'typewriter.wav');
        return webviewPanel.webview.asWebviewUri(wav);
    }
    catch {
        return null;
    }
}
function registerTypewriterSound(context) {
    let soundPanel;
    function tryPlay() {
        if (!(0, config_1.getTypewriterSoundEnabled)())
            return;
        const now = Date.now();
        if (now - lastPlayTime < THROTTLE_MS)
            return;
        lastPlayTime = now;
        const volume = (0, config_1.getTypewriterSoundVolume)();
        if (!soundPanel) {
            soundPanel = (0, soundWebview_1.ensureSoundWebview)(context, {
                volume,
                soundWebviewUri: null,
            });
            soundPanel.onDidDispose(() => {
                soundPanel = undefined;
            });
        }
        const uri = soundPanel ? getSoundWebviewUri(context, soundPanel) : null;
        (0, soundWebview_1.playTypewriterSound)(context, { volume, soundWebviewUri: uri });
    }
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || e.document.uri.toString() !== editor.document.uri.toString())
            return;
        if (e.document.languageId !== 'markdown')
            return;
        let totalLen = 0;
        for (const change of e.contentChanges) {
            totalLen += change.text.length;
            if (change.rangeLength > 0)
                totalLen += change.rangeLength;
        }
        if (totalLen > MAX_CHANGE_LENGTH)
            return;
        tryPlay();
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('noveltools.typewriterSound') && soundPanel) {
            const volume = (0, config_1.getTypewriterSoundVolume)();
            const uri = getSoundWebviewUri(context, soundPanel);
            (0, soundWebview_1.updateSoundWebviewContent)(volume, uri);
        }
    }));
}
//# sourceMappingURL=soundController.js.map
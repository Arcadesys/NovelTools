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
exports.getProjectFile = getProjectFile;
exports.getSceneFiles = getSceneFiles;
exports.getSceneGlob = getSceneGlob;
exports.getTypewriterSoundEnabled = getTypewriterSoundEnabled;
exports.getTypewriterSoundVolume = getTypewriterSoundVolume;
exports.getTypewriterSoundPath = getTypewriterSoundPath;
exports.getWordCountStripMarkdown = getWordCountStripMarkdown;
exports.getWordCountManuscriptScope = getWordCountManuscriptScope;
const vscode = __importStar(require("vscode"));
const SECTION = 'noveltools';
function getProjectFile() {
    return vscode.workspace.getConfiguration(SECTION).get('projectFile') ?? 'noveltools.yaml';
}
function getSceneFiles() {
    return vscode.workspace.getConfiguration(SECTION).get('sceneFiles') ?? [];
}
function getSceneGlob() {
    return vscode.workspace.getConfiguration(SECTION).get('sceneGlob') ?? '**/*.md';
}
function getTypewriterSoundEnabled() {
    return vscode.workspace.getConfiguration(SECTION).get('typewriterSound.enabled') ?? true;
}
function getTypewriterSoundVolume() {
    return vscode.workspace.getConfiguration(SECTION).get('typewriterSound.volume') ?? 0.3;
}
function getTypewriterSoundPath() {
    return vscode.workspace.getConfiguration(SECTION).get('typewriterSound.path') ?? '';
}
function getWordCountStripMarkdown() {
    return vscode.workspace.getConfiguration(SECTION).get('wordCount.stripMarkdown') ?? false;
}
function getWordCountManuscriptScope() {
    const scope = vscode.workspace.getConfiguration(SECTION).get('wordCount.manuscriptScope') ?? 'project';
    return scope === 'workspace' ? 'workspace' : 'project';
}
//# sourceMappingURL=config.js.map
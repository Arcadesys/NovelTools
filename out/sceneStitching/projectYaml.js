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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scenePathsRelativeTo = scenePathsRelativeTo;
exports.parseProjectYaml = parseProjectYaml;
exports.serializeToYaml = serializeToYaml;
exports.reorderChapters = reorderChapters;
exports.moveScene = moveScene;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const yaml_1 = __importDefault(require("yaml"));
/** Returns scene paths relative to baseDir for serialization (forward slashes for portability). */
function scenePathsRelativeTo(baseDir, sceneUris) {
    const base = baseDir.fsPath;
    return sceneUris.map((uri) => {
        const rel = path.relative(base, uri.fsPath);
        return rel.split(path.sep).join('/');
    });
}
function parseProjectYaml(content, projectFileUri) {
    try {
        const raw = yaml_1.default.parse(content);
        if (!raw || !Array.isArray(raw.chapters))
            return null;
        const baseDir = vscode.Uri.joinPath(projectFileUri, '..');
        const chapters = [];
        const flatUris = [];
        for (const ch of raw.chapters) {
            const scenePaths = Array.isArray(ch.scenes) ? ch.scenes : [];
            const sceneUris = scenePaths.map((p) => {
                const path = typeof p === 'string' ? p : String(p);
                return vscode.Uri.joinPath(baseDir, path);
            });
            chapters.push({ title: ch.title, sceneUris, scenePaths });
            flatUris.push(...sceneUris);
        }
        return {
            title: raw.title,
            chapters,
            flatUris,
            projectFileUri,
        };
    }
    catch {
        return null;
    }
}
function serializeToYaml(data) {
    const raw = {
        title: data.title,
        chapters: data.chapters.map((ch) => ({
            title: ch.title,
            scenes: ch.scenePaths,
        })),
    };
    return yaml_1.default.stringify(raw, { lineWidth: 0 });
}
function reorderChapters(data, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0)
        return data;
    const chapters = [...data.chapters];
    const [removed] = chapters.splice(fromIndex, 1);
    chapters.splice(toIndex, 0, removed);
    const flatUris = chapters.flatMap((ch) => ch.sceneUris);
    return { ...data, chapters, flatUris };
}
function moveScene(data, fromChapterIdx, fromSceneIdx, toChapterIdx, toSceneIdx) {
    const chapters = data.chapters.map((ch) => ({
        ...ch,
        sceneUris: [...ch.sceneUris],
        scenePaths: [...ch.scenePaths],
    }));
    const fromCh = chapters[fromChapterIdx];
    const toCh = chapters[toChapterIdx];
    if (!fromCh || !toCh)
        return data;
    const [path] = fromCh.scenePaths.splice(fromSceneIdx, 1);
    const [uri] = fromCh.sceneUris.splice(fromSceneIdx, 1);
    toCh.scenePaths.splice(toSceneIdx, 0, path);
    toCh.sceneUris.splice(toSceneIdx, 0, uri);
    const flatUris = chapters.flatMap((ch) => ch.sceneUris);
    return { ...data, chapters, flatUris };
}
//# sourceMappingURL=projectYaml.js.map
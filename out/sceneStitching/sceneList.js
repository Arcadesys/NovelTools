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
exports.getManuscript = getManuscript;
exports.getManuscriptUris = getManuscriptUris;
exports.clearManuscriptCache = clearManuscriptCache;
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const projectYaml_1 = require("./projectYaml");
let cached = null;
async function findProjectFile() {
    const name = (0, config_1.getProjectFile)();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
        return null;
    for (const folder of folders) {
        const candidate = vscode.Uri.joinPath(folder.uri, name);
        try {
            await vscode.workspace.fs.readFile(candidate);
            return candidate;
        }
        catch {
            // try as path (e.g. draft/manuscript.yaml)
            const segments = name.split(/[/\\]/);
            const fileUri = segments.length > 1
                ? vscode.Uri.joinPath(folder.uri, ...segments)
                : candidate;
            try {
                await vscode.workspace.fs.readFile(fileUri);
                return fileUri;
            }
            catch {
                // continue
            }
        }
    }
    return null;
}
async function loadFromProjectFile(uri) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const data = (0, projectYaml_1.parseProjectYaml)(content, uri);
    if (data) {
        return { data, flatUris: data.flatUris, projectFileUri: uri };
    }
    return { data: null, flatUris: [], projectFileUri: uri };
}
async function loadFromConfig() {
    const sceneFiles = (0, config_1.getSceneFiles)();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
        return { data: null, flatUris: [], projectFileUri: null };
    const root = folders[0].uri;
    if (sceneFiles.length > 0) {
        const flatUris = sceneFiles.map((p) => vscode.Uri.joinPath(root, p));
        const data = {
            title: undefined,
            chapters: [{ title: undefined, sceneUris: flatUris, scenePaths: sceneFiles }],
            flatUris,
            projectFileUri: null,
        };
        return { data, flatUris, projectFileUri: null };
    }
    const glob = (0, config_1.getSceneGlob)();
    const found = await vscode.workspace.findFiles(glob);
    const sorted = found.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    const data = {
        title: undefined,
        chapters: [
            {
                title: undefined,
                sceneUris: sorted,
                scenePaths: sorted.map((u) => vscode.workspace.asRelativePath(u)),
            },
        ],
        flatUris: sorted,
        projectFileUri: null,
    };
    return { data, flatUris: sorted, projectFileUri: null };
}
async function getManuscript() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '';
    if (cached?.workspaceRoot === root) {
        return cached.result;
    }
    const projectUri = await findProjectFile();
    const result = projectUri
        ? await loadFromProjectFile(projectUri)
        : await loadFromConfig();
    cached = { result, workspaceRoot: root };
    return result;
}
/** Returns flat list of URIs for manuscript word count and navigation. */
async function getManuscriptUris() {
    return getManuscript();
}
function clearManuscriptCache() {
    cached = null;
}
//# sourceMappingURL=sceneList.js.map
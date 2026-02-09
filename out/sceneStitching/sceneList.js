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
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const projectYaml_1 = require("./projectYaml");
let cached = null;
function normalizePathForGrouping(scenePath) {
    return scenePath.replace(/\\/g, '/');
}
function groupScenesByFolder(scenePaths, sceneUris) {
    const order = [];
    const chaptersByKey = new Map();
    for (let i = 0; i < scenePaths.length; i++) {
        const scenePath = normalizePathForGrouping(scenePaths[i]);
        const dir = path.posix.dirname(scenePath);
        const key = dir === '.' ? '' : dir;
        let chapter = chaptersByKey.get(key);
        if (!chapter) {
            chapter = {
                title: dir === '.' ? 'Root' : path.posix.basename(dir),
                sceneUris: [],
                scenePaths: [],
            };
            chaptersByKey.set(key, chapter);
            order.push(key);
        }
        chapter.sceneUris.push(sceneUris[i]);
        chapter.scenePaths.push(scenePaths[i]);
    }
    const titleCounts = new Map();
    for (const key of order) {
        const title = chaptersByKey.get(key)?.title ?? '';
        titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    }
    for (const key of order) {
        const chapter = chaptersByKey.get(key);
        if (!chapter)
            continue;
        const title = chapter.title ?? '';
        if ((titleCounts.get(title) ?? 0) > 1) {
            chapter.title = key === '' ? 'Root' : key;
        }
    }
    return order.map((key) => chaptersByKey.get(key)).filter(Boolean);
}
function buildChapters(scenePaths, sceneUris, grouping) {
    if (grouping === 'folder') {
        return groupScenesByFolder(scenePaths, sceneUris);
    }
    return [{ title: undefined, sceneUris, scenePaths }];
}
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
    const grouping = (0, config_1.getChapterGrouping)();
    if (sceneFiles.length > 0) {
        const flatUris = sceneFiles.map((p) => vscode.Uri.joinPath(root, p));
        const chapters = buildChapters(sceneFiles, flatUris, grouping);
        const flattened = chapters.flatMap((ch) => ch.sceneUris);
        const data = {
            title: undefined,
            chapters,
            flatUris: flattened,
            projectFileUri: null,
        };
        return { data, flatUris: flattened, projectFileUri: null };
    }
    const glob = (0, config_1.getSceneGlob)();
    const found = await vscode.workspace.findFiles(glob);
    const sorted = found.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    if (sorted.length === 0) {
        return { data: null, flatUris: [], projectFileUri: null };
    }
    const scenePaths = sorted.map((u) => normalizePathForGrouping(vscode.workspace.asRelativePath(u)));
    const chapters = buildChapters(scenePaths, sorted, grouping);
    const flattened = chapters.flatMap((ch) => ch.sceneUris);
    const data = {
        title: undefined,
        chapters,
        flatUris: flattened,
        projectFileUri: null,
    };
    return { data, flatUris: flattened, projectFileUri: null };
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
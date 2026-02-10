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
exports.initSceneList = initSceneList;
exports.getActiveProjectUri = getActiveProjectUri;
exports.setActiveProjectUri = setActiveProjectUri;
exports.findAllIndexYaml = findAllIndexYaml;
exports.getManuscriptByUri = getManuscriptByUri;
exports.getManuscript = getManuscript;
exports.getManuscriptUris = getManuscriptUris;
exports.clearManuscriptCache = clearManuscriptCache;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const projectYaml_1 = require("./projectYaml");
const INDEX_YAML = 'index.yaml';
/** Additional index filenames to try when glob finds nothing (e.g. Index.YAML, Index.md). */
const INDEX_CANDIDATES = ['index.yaml', 'Index.yaml', 'Index.YAML', 'Index.md', 'index.md'];
const ACTIVE_PROJECT_URI_KEY = 'noveltools.activeProjectUri';
let extensionContext = null;
const cacheByUri = new Map();
let cacheWorkspaceRoot = null;
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
/** Called from extension activate to provide workspace state for active document. */
function initSceneList(context) {
    extensionContext = context;
}
function getWorkspaceKey() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '';
}
async function getActiveProjectUri() {
    if (!extensionContext)
        return null;
    const stored = extensionContext.workspaceState.get(ACTIVE_PROJECT_URI_KEY);
    if (!stored)
        return null;
    try {
        return vscode.Uri.parse(stored);
    }
    catch {
        return null;
    }
}
async function setActiveProjectUri(uri) {
    if (!extensionContext)
        return;
    await extensionContext.workspaceState.update(ACTIVE_PROJECT_URI_KEY, uri.toString());
}
/** Fallback globs when the configured glob finds nothing (handles brace-expansion edge cases). */
const FALLBACK_INDEX_GLOBS = [
    '**/Index.YAML',
    '**/Index.yaml',
    '**/index.yaml',
    '**/Index.md',
    '**/index.md',
    '**/*[iI]ndex*.yaml',
    '**/*[iI]ndex*.md',
];
/** Find all index.yaml files matching the configured glob. */
async function findAllIndexYaml() {
    // #region agent log
    const glob = (0, config_1.getIndexYamlGlob)();
    let found = await vscode.workspace.findFiles(glob);
    if (found.length === 0) {
        for (const fallback of FALLBACK_INDEX_GLOBS) {
            const extra = await vscode.workspace.findFiles(fallback);
            found = [...found, ...extra];
        }
    }
    const unique = Array.from(new Map(found.map((u) => [u.fsPath, u])).values());
    const sorted = unique.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sceneList.ts:findAllIndexYaml', message: 'Index files found', data: { count: sorted.length, paths: sorted.map(u => vscode.workspace.asRelativePath(u)) }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
    return sorted;
    // #endregion
}
async function findIndexYaml() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
        return null;
    for (const folder of folders) {
        for (const name of INDEX_CANDIDATES) {
            const candidate = vscode.Uri.joinPath(folder.uri, name);
            try {
                await vscode.workspace.fs.readFile(candidate);
                return candidate;
            }
            catch {
                // continue
            }
        }
    }
    return null;
}
async function findProjectFile() {
    const indexUri = await findIndexYaml();
    if (indexUri)
        return indexUri;
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
function isIndexYaml(uri) {
    const base = path.basename(uri.fsPath);
    const ext = path.extname(uri.fsPath).toLowerCase();
    const stem = base.slice(0, base.length - ext.length);
    return /^index$/i.test(stem) && (ext === '.yaml' || ext === '.yml');
}
async function loadFromProjectFile(uri) {
    // #region agent log
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const strict = (0, projectYaml_1.parseLongformStrict)(content, uri);
    const index = (0, projectYaml_1.parseIndexYaml)(content, uri);
    const longform = (0, projectYaml_1.parseLongformIndexYaml)(content, uri);
    let data = strict ?? index ?? longform;
    if (!data && !isIndexYaml(uri)) {
        data = (0, projectYaml_1.parseProjectYaml)(content, uri);
    }
    if (data?.chapters.some((ch) => ch.folderPath)) {
        const baseDir = vscode.Uri.joinPath(uri, '..');
        data = await (0, projectYaml_1.resolveChapterFolders)(data, baseDir);
    }
    const relativePath = vscode.workspace.asRelativePath(uri);
    fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sceneList.ts:loadFromProjectFile', message: 'Parse result', data: { uri: relativePath, contentLen: content.length, strictOk: !!strict, indexOk: !!index, longformOk: !!longform, dataOk: !!data }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => { });
    if (data) {
        return { data, flatUris: data.flatUris, projectFileUri: uri };
    }
    return { data: null, flatUris: [], projectFileUri: uri };
    // #endregion
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
function cacheKey(uri) {
    return uri?.toString() ?? 'config';
}
/** Load manuscript for a specific project file URI (cached per URI). */
async function getManuscriptByUri(uri) {
    const root = getWorkspaceKey();
    if (cacheWorkspaceRoot !== root) {
        cacheByUri.clear();
        cacheWorkspaceRoot = root;
    }
    const key = cacheKey(uri);
    const cached = cacheByUri.get(key);
    if (cached)
        return cached;
    const result = await loadFromProjectFile(uri);
    cacheByUri.set(key, result);
    return result;
}
async function getManuscript(projectFileUri) {
    const root = getWorkspaceKey();
    if (cacheWorkspaceRoot !== root) {
        cacheByUri.clear();
        cacheWorkspaceRoot = root;
    }
    if (projectFileUri) {
        return getManuscriptByUri(projectFileUri);
    }
    const allIndex = await findAllIndexYaml();
    if (allIndex.length > 1) {
        const activeUri = await getActiveProjectUri();
        const uri = activeUri && allIndex.some((u) => u.toString() === activeUri.toString())
            ? activeUri
            : allIndex[0];
        return getManuscriptByUri(uri);
    }
    if (allIndex.length === 1) {
        return getManuscriptByUri(allIndex[0]);
    }
    const singleUri = await findProjectFile();
    if (singleUri) {
        return getManuscriptByUri(singleUri);
    }
    const configKey = 'config';
    let result = cacheByUri.get(configKey);
    if (!result) {
        result = await loadFromConfig();
        cacheByUri.set(configKey, result);
    }
    return result;
}
/** Returns flat list of URIs for manuscript word count and navigation. */
async function getManuscriptUris() {
    return getManuscript();
}
function clearManuscriptCache(uri) {
    if (uri) {
        cacheByUri.delete(cacheKey(uri));
    }
    else {
        cacheByUri.clear();
        cacheWorkspaceRoot = null;
    }
}
//# sourceMappingURL=sceneList.js.map
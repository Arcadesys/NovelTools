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
exports.parseIndexYaml = parseIndexYaml;
exports.parseLongformStrict = parseLongformStrict;
exports.parseLongformIndexYaml = parseLongformIndexYaml;
exports.parseProjectYaml = parseProjectYaml;
exports.resolveChapterFolders = resolveChapterFolders;
exports.serializeToYaml = serializeToYaml;
exports.serializeToIndexYaml = serializeToIndexYaml;
exports.serializeToLongformYaml = serializeToLongformYaml;
exports.reorderChapters = reorderChapters;
exports.moveScene = moveScene;
exports.removeScene = removeScene;
exports.removeChapter = removeChapter;
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
const INDEX_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
/**
 * Parse index.yaml: optional YAML frontmatter (--- ... ---) for manuscript title,
 * then a YAML array of scene paths in order.
 */
function parseIndexYaml(content, indexFileUri) {
    try {
        const match = content.match(INDEX_FRONTMATTER_REGEX);
        let title;
        let body = content;
        let sceneStatus;
        if (match) {
            const frontmatter = yaml_1.default.parse(match[1]);
            title = frontmatter?.title != null ? String(frontmatter.title) : undefined;
            const raw = frontmatter?.sceneStatus;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                sceneStatus = {};
                for (const [k, v] of Object.entries(raw)) {
                    if (v === 'done' || v === 'drafted' || v === 'spiked')
                        sceneStatus[k] = v;
                }
                if (Object.keys(sceneStatus).length === 0)
                    sceneStatus = undefined;
            }
            body = match[2].trim();
        }
        const scenePathsRaw = body ? yaml_1.default.parse(body) : [];
        const scenePaths = Array.isArray(scenePathsRaw)
            ? scenePathsRaw.map((p) => (typeof p === 'string' ? p : String(p)))
            : [];
        const baseDir = vscode.Uri.joinPath(indexFileUri, '..');
        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
        const chapters = [
            { title: undefined, sceneUris, scenePaths },
        ];
        return {
            title,
            chapters,
            flatUris: sceneUris,
            projectFileUri: indexFileUri,
            sceneStatus,
        };
    }
    catch {
        return null;
    }
}
/** Flatten Longform nested scenes array to ordered list of scene names (depth-first). */
function flattenLongformScenes(nested) {
    const out = [];
    for (const item of nested) {
        if (typeof item === 'string') {
            out.push(item.trim());
        }
        else if (Array.isArray(item)) {
            out.push(...flattenLongformScenes(item));
        }
    }
    return out.filter(Boolean);
}
/** Convert Longform top-level scenes (string | nested array) to our chapters: each top-level item = one chapter. */
function longformScenesToChapters(nested, baseDir) {
    const chapters = [];
    const flatUris = [];
    for (const item of nested) {
        const names = typeof item === 'string' ? [item.trim()] : Array.isArray(item) ? flattenLongformScenes(item) : [];
        if (names.length === 0)
            continue;
        const scenePaths = names.map((n) => (n.endsWith('.md') ? n : `${n}.md`));
        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
        chapters.push({ title: undefined, sceneUris, scenePaths });
        flatUris.push(...sceneUris);
    }
    return { chapters, flatUris };
}
/**
 * Parse Longform index 1:1 (Obsidian Longform plugin format).
 * Index file has frontmatter with a `longform` entry: format, title, workflow, sceneFolder, scenes (nested array).
 * Scene names in YAML are without .md; files live at sceneFolder + name + ".md".
 * @see https://github.com/kevboh/longform/blob/main/docs/INDEX_FILE.md
 */
function parseLongformStrict(content, indexFileUri) {
    try {
        let raw;
        const match = content.match(INDEX_FRONTMATTER_REGEX);
        if (match) {
            raw = yaml_1.default.parse(match[1]);
        }
        else {
            // #region agent log
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'projectYaml.ts:parseLongformStrict', message: 'Frontmatter regex did not match', data: { contentStarts: content.slice(0, 80) }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => { });
            raw = yaml_1.default.parse(content);
            // #endregion
        }
        if (!raw || typeof raw !== 'object') {
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'projectYaml.ts:parseLongformStrict', message: 'Return null: no raw object', data: { match: !!match, frontLen: match ? match[1].length : 0 }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => { });
            return null;
        }
        const longform = raw.longform;
        if (!longform || typeof longform !== 'object' || longform === null) {
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'projectYaml.ts:parseLongformStrict', message: 'Return null: no longform', data: { hasLongform: !!raw.longform }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => { });
            return null;
        }
        // #endregion
        const lf = longform;
        const format = lf.format === 'single' || lf.format === 'scenes' ? lf.format : undefined;
        // #region agent log
        if (!format) {
            fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'projectYaml.ts:parseLongformStrict', message: 'Return null: no format', data: { formatVal: lf.format }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => { });
            return null;
        }
        // #endregion
        const title = lf.title != null ? String(lf.title) : undefined;
        const workflow = lf.workflow != null ? String(lf.workflow) : undefined;
        const sceneFolderRaw = lf.sceneFolder;
        const sceneFolder = sceneFolderRaw != null ? String(sceneFolderRaw).replace(/^\/+|\/+$/g, '') : '';
        const baseDir = sceneFolder !== ''
            ? vscode.Uri.joinPath(indexFileUri, '..', sceneFolder)
            : vscode.Uri.joinPath(indexFileUri, '..');
        const scenesRaw = lf.scenes;
        if (format === 'single') {
            const singleTitle = title ?? path.basename(indexFileUri.fsPath, path.extname(indexFileUri.fsPath));
            return {
                title: singleTitle,
                chapters: [{ title: undefined, sceneUris: [], scenePaths: [] }],
                flatUris: [],
                projectFileUri: indexFileUri,
                longformMeta: { format: 'single', sceneFolder, workflow, ...lf },
            };
        }
        if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
            return {
                title,
                chapters: [{ title: undefined, sceneUris: [], scenePaths: [] }],
                flatUris: [],
                projectFileUri: indexFileUri,
                longformMeta: { format: 'scenes', sceneFolder, workflow, ...lf },
            };
        }
        const { chapters, flatUris } = longformScenesToChapters(scenesRaw, baseDir);
        const chapterTitlesRaw = lf.chapterTitles;
        if (Array.isArray(chapterTitlesRaw) && chapterTitlesRaw.length === chapters.length) {
            for (let i = 0; i < chapters.length; i++) {
                const t = chapterTitlesRaw[i];
                if (t != null && typeof t === 'string')
                    chapters[i].title = t.trim() || undefined;
            }
        }
        const meta = {
            format: 'scenes',
            sceneFolder,
            workflow,
            ...lf,
        };
        const sceneStatusRaw = lf.sceneStatus;
        let sceneStatus;
        if (sceneStatusRaw && typeof sceneStatusRaw === 'object' && !Array.isArray(sceneStatusRaw)) {
            sceneStatus = {};
            for (const [k, v] of Object.entries(sceneStatusRaw)) {
                if (v === 'done' || v === 'drafted' || v === 'spiked')
                    sceneStatus[k] = v;
            }
            if (Object.keys(sceneStatus).length === 0)
                sceneStatus = undefined;
        }
        return {
            title,
            chapters: chapters.length > 0 ? chapters : [{ title: undefined, sceneUris: [], scenePaths: [] }],
            flatUris,
            projectFileUri: indexFileUri,
            sceneStatus,
            longformMeta: meta,
        };
    }
    catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'projectYaml.ts:parseLongformStrict', message: 'Return null: exception', data: { err: String(e) }, timestamp: Date.now(), hypothesisId: 'H5' }) }).catch(() => { });
        return null;
        // #endregion
    }
}
/** Chapter header patterns: "1. Title", "2. BORN TO BE WILDER", "-- How it used to be". */
function isChapterHeader(item) {
    return /^\d+\.\s+.+/.test(item) || /^--\s+.+/.test(item);
}
/**
 * Parse longform-style index (permissive): root or longform block with title, sceneFolder, scenes.
 * Supports: nested longform: { title, scenes }; scenes as object (chapter -> paths);
 * or flat array with inline chapter headers. Used when parseLongformStrict did not match.
 */
function parseLongformIndexYaml(content, indexFileUri) {
    try {
        let raw;
        const match = content.match(INDEX_FRONTMATTER_REGEX);
        if (match) {
            raw = yaml_1.default.parse(match[1]);
        }
        else {
            raw = yaml_1.default.parse(content);
        }
        if (!raw || typeof raw !== 'object')
            return null;
        const block = raw.longform && typeof raw.longform === 'object' && raw.longform !== null
            ? raw.longform
            : raw;
        const title = block.title != null ? String(block.title) : undefined;
        const sceneFolder = (block.sceneFolder ?? raw.sceneFolder) != null
            ? String(block.sceneFolder ?? raw.sceneFolder).replace(/^\/+|\/+$/g, '')
            : '';
        const baseDir = sceneFolder !== ''
            ? vscode.Uri.joinPath(indexFileUri, '..', sceneFolder)
            : vscode.Uri.joinPath(indexFileUri, '..');
        const chapters = [];
        const flatUris = [];
        const scenesRaw = block.scenes ?? raw.scenes;
        if (Array.isArray(scenesRaw)) {
            const items = scenesRaw.map((p) => (typeof p === 'string' ? p : String(p)).trim()).filter(Boolean);
            let currentChapter = { title: undefined, paths: [] };
            for (const item of items) {
                if (isChapterHeader(item)) {
                    if (currentChapter.paths.length > 0 || currentChapter.title !== undefined) {
                        const scenePaths = currentChapter.paths.map((p) => (p.endsWith('.md') ? p : `${p}.md`));
                        const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
                        chapters.push({ title: currentChapter.title, sceneUris, scenePaths });
                        flatUris.push(...sceneUris);
                    }
                    currentChapter = {
                        title: item.replace(/^(\d+\.\s+|--\s+)/, '').trim() || undefined,
                        paths: [],
                    };
                }
                else {
                    currentChapter.paths.push(item);
                }
            }
            if (currentChapter.paths.length > 0 || currentChapter.title !== undefined) {
                const scenePaths = currentChapter.paths.map((p) => (p.endsWith('.md') ? p : `${p}.md`));
                const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
                chapters.push({ title: currentChapter.title, sceneUris, scenePaths });
                flatUris.push(...sceneUris);
            }
        }
        else if (scenesRaw && typeof scenesRaw === 'object' && !Array.isArray(scenesRaw)) {
            const entries = Object.entries(scenesRaw);
            for (const [chTitle, list] of entries) {
                const arr = Array.isArray(list) ? list : [];
                const scenePaths = arr
                    .map((p) => (typeof p === 'string' ? p : String(p)).trim())
                    .filter(Boolean)
                    .map((p) => (p.endsWith('.md') ? p : `${p}.md`));
                const sceneUris = scenePaths.map((p) => vscode.Uri.joinPath(baseDir, p));
                chapters.push({ title: chTitle, sceneUris, scenePaths });
                flatUris.push(...sceneUris);
            }
        }
        if (chapters.length === 0 && !title)
            return null;
        const blockForStatus = block.sceneStatus ?? raw.sceneStatus;
        let sceneStatus;
        if (blockForStatus && typeof blockForStatus === 'object' && !Array.isArray(blockForStatus)) {
            sceneStatus = {};
            for (const [k, v] of Object.entries(blockForStatus)) {
                if (v === 'done' || v === 'drafted' || v === 'spiked')
                    sceneStatus[k] = v;
            }
            if (Object.keys(sceneStatus).length === 0)
                sceneStatus = undefined;
        }
        return {
            title,
            chapters: chapters.length > 0 ? chapters : [{ title: undefined, sceneUris: [], scenePaths: [] }],
            flatUris,
            projectFileUri: indexFileUri,
            sceneStatus,
        };
    }
    catch {
        return null;
    }
}
function normalizeRawChapter(ch) {
    if (typeof ch === 'string') {
        const folder = ch.trim();
        return folder ? { folder } : { scenes: [] };
    }
    const obj = ch;
    if (obj.folder != null && String(obj.folder).trim() !== '') {
        return { title: obj.title, folder: String(obj.folder).trim() };
    }
    return {
        title: obj.title,
        scenes: Array.isArray(obj.scenes) ? obj.scenes.map((p) => (typeof p === 'string' ? p : String(p))) : [],
    };
}
function parseProjectYaml(content, projectFileUri) {
    try {
        const raw = yaml_1.default.parse(content);
        if (!raw || !Array.isArray(raw.chapters))
            return null;
        const baseDir = vscode.Uri.joinPath(projectFileUri, '..');
        const chapters = [];
        const flatUris = [];
        for (const rawCh of raw.chapters) {
            const ch = normalizeRawChapter(rawCh);
            if (ch.folder !== undefined) {
                const folderPath = ch.folder;
                const folderName = path.basename(folderPath.replace(/\/$/, '')) || folderPath;
                chapters.push({
                    title: ch.title ?? folderName,
                    sceneUris: [],
                    scenePaths: [],
                    folderPath,
                });
                // flatUris filled by resolveChapterFolders
            }
            else {
                const scenePaths = ch.scenes ?? [];
                const sceneUris = scenePaths.map((p) => {
                    const pathStr = typeof p === 'string' ? p : String(p);
                    return vscode.Uri.joinPath(baseDir, pathStr);
                });
                chapters.push({ title: ch.title, sceneUris, scenePaths });
                flatUris.push(...sceneUris);
            }
        }
        let sceneStatus;
        const rawStatus = raw.sceneStatus;
        if (rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus)) {
            sceneStatus = {};
            for (const [k, v] of Object.entries(rawStatus)) {
                if (v === 'done' || v === 'drafted' || v === 'spiked')
                    sceneStatus[k] = v;
            }
            if (Object.keys(sceneStatus).length === 0)
                sceneStatus = undefined;
        }
        return {
            title: raw.title,
            chapters,
            flatUris,
            projectFileUri,
            sceneStatus,
        };
    }
    catch {
        return null;
    }
}
/** Resolve folder chapters by reading .md files from each chapter folder. Call after parseProjectYaml when chapters use folder. */
async function resolveChapterFolders(data, baseDir) {
    const hasFolder = data.chapters.some((ch) => ch.folderPath);
    if (!hasFolder)
        return data;
    const chapters = [];
    const flatUris = [];
    for (const ch of data.chapters) {
        if (!ch.folderPath) {
            chapters.push(ch);
            flatUris.push(...ch.sceneUris);
            continue;
        }
        const folderUri = vscode.Uri.joinPath(baseDir, ch.folderPath);
        let entries;
        try {
            entries = await vscode.workspace.fs.readDirectory(folderUri);
        }
        catch {
            chapters.push({ ...ch, sceneUris: [], scenePaths: [] });
            continue;
        }
        const mdNames = entries
            .filter(([name, type]) => type === vscode.FileType.File && /\.md$/i.test(name))
            .map(([name]) => name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const scenePaths = mdNames.map((name) => {
            const rel = ch.folderPath + '/' + name;
            return rel.split(path.sep).join('/');
        });
        const sceneUris = mdNames.map((name) => vscode.Uri.joinPath(folderUri, name));
        const folderName = path.basename(ch.folderPath.replace(/\/$/, '')) || ch.folderPath;
        chapters.push({
            title: ch.title ?? folderName,
            sceneUris,
            scenePaths,
            folderPath: ch.folderPath,
        });
        flatUris.push(...sceneUris);
    }
    return { ...data, chapters, flatUris };
}
function serializeToYaml(data) {
    const raw = {
        title: data.title,
        chapters: data.chapters.map((ch) => {
            if (ch.folderPath) {
                return ch.title !== path.basename(ch.folderPath.replace(/\/$/, ''))
                    ? { title: ch.title, folder: ch.folderPath }
                    : { folder: ch.folderPath };
            }
            return { title: ch.title, scenes: ch.scenePaths };
        }),
    };
    if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
        raw.sceneStatus = data.sceneStatus;
    }
    return yaml_1.default.stringify(raw, {
        lineWidth: 0,
        defaultStringType: 'QUOTE_DOUBLE',
    });
}
/** Serialize to index.yaml format: frontmatter with title, then YAML array of scene paths. */
function serializeToIndexYaml(data) {
    const scenePaths = data.chapters.flatMap((ch) => ch.scenePaths);
    const opts = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' };
    const front = { title: data.title ?? '' };
    if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
        front.sceneStatus = data.sceneStatus;
    }
    const frontStr = yaml_1.default.stringify(front, opts).trim();
    const body = yaml_1.default.stringify(scenePaths, opts).trim();
    return `---\n${frontStr}\n---\n${body}\n`;
}
/** Build Longform nested arrays from our chapters (flat list; no nesting preserved). */
function chaptersToLongformScenes(data) {
    const items = [];
    for (const ch of data.chapters) {
        const names = ch.scenePaths.map((p) => (p.endsWith('.md') ? p.slice(0, -3) : p));
        if (names.length === 1)
            items.push(names[0]);
        else if (names.length > 1)
            items.push(names);
    }
    return items;
}
/** Serialize to Longform index format: frontmatter with longform entry (format, title, workflow, sceneFolder, scenes, chapterTitles). */
function serializeToLongformYaml(data) {
    const meta = data.longformMeta;
    if (!meta)
        return serializeToIndexYaml(data);
    const scenes = chaptersToLongformScenes(data);
    const chapterTitles = data.chapters.map((ch) => ch.title ?? '');
    const { format: _f, sceneFolder: _s, workflow: _w, chapterTitles: _ct, ...rest } = meta;
    const longform = {
        ...rest,
        format: meta.format ?? 'scenes',
        sceneFolder: meta.sceneFolder ?? '/',
        scenes,
        chapterTitles,
    };
    if (data.title != null)
        longform.title = data.title;
    if (meta.workflow != null)
        longform.workflow = meta.workflow;
    if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
        longform.sceneStatus = data.sceneStatus;
    }
    const opts = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' };
    const front = yaml_1.default.stringify({ longform }, opts).trim();
    return `---\n${front}\n---\n`;
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
/** Remove a single scene from the manuscript. */
function removeScene(data, chapterIdx, sceneIdx) {
    const chapters = data.chapters.map((ch) => ({
        ...ch,
        sceneUris: [...ch.sceneUris],
        scenePaths: [...ch.scenePaths],
    }));
    const ch = chapters[chapterIdx];
    if (!ch || sceneIdx < 0 || sceneIdx >= ch.sceneUris.length)
        return data;
    const removedPath = ch.scenePaths[sceneIdx];
    ch.sceneUris.splice(sceneIdx, 1);
    ch.scenePaths.splice(sceneIdx, 1);
    const flatUris = chapters.flatMap((c) => c.sceneUris);
    const chaptersFiltered = chapters.filter((c) => c.sceneUris.length > 0);
    let sceneStatus = data.sceneStatus;
    const pathKey = typeof removedPath === 'string' ? removedPath.split(path.sep).join('/') : undefined;
    if (pathKey && sceneStatus && sceneStatus[pathKey]) {
        sceneStatus = { ...sceneStatus };
        delete sceneStatus[pathKey];
        if (Object.keys(sceneStatus).length === 0)
            sceneStatus = undefined;
    }
    return { ...data, chapters: chaptersFiltered, flatUris, sceneStatus };
}
/** Remove a chapter and all its scenes from the manuscript. */
function removeChapter(data, chapterIdx) {
    if (chapterIdx < 0 || chapterIdx >= data.chapters.length)
        return data;
    const chapters = data.chapters.filter((_, i) => i !== chapterIdx);
    const flatUris = chapters.flatMap((ch) => ch.sceneUris);
    return { ...data, chapters, flatUris };
}
//# sourceMappingURL=projectYaml.js.map
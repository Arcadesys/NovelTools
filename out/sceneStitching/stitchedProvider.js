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
exports.getStitchedManuscriptUri = getStitchedManuscriptUri;
exports.getStitchedChapterUri = getStitchedChapterUri;
exports.registerStitchedProvider = registerStitchedProvider;
exports.resolveChapterIndex = resolveChapterIndex;
exports.buildStitchedChapterContent = buildStitchedChapterContent;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const sceneList_1 = require("./sceneList");
const SCHEME = 'noveltools';
const AUTHORITY = 'stitched';
const MANUSCRIPT_PATH = 'manuscript';
const CHAPTER_PATH_PREFIX = 'chapter/';
/** URI for the full stitched manuscript. */
function getStitchedManuscriptUri() {
    return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${MANUSCRIPT_PATH}`);
}
/** URI for a single chapter's stitched content. */
function getStitchedChapterUri(chapterIndex) {
    return vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${CHAPTER_PATH_PREFIX}${chapterIndex}`);
}
function parseChapterIndexFromUri(uri) {
    const path = uri.path.replace(/^\/+/, '');
    if (!path.startsWith(CHAPTER_PATH_PREFIX))
        return null;
    const indexStr = path.slice(CHAPTER_PATH_PREFIX.length);
    const index = parseInt(indexStr, 10);
    if (!Number.isInteger(index) || index < 0)
        return null;
    return index;
}
function registerStitchedProvider(context) {
    const provider = new (class {
        provideTextDocumentContent(uri, _token) {
            const chapterIndex = parseChapterIndexFromUri(uri);
            if (chapterIndex !== null) {
                return buildStitchedChapterContent(chapterIndex);
            }
            return buildStitchedContent();
        }
    })();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openStitchedManuscript', async () => {
        const uri = getStitchedManuscriptUri();
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.openStitchedChapter', async (nodeOrItem) => {
        const chapterIndex = await resolveChapterIndex(nodeOrItem);
        if (chapterIndex === null)
            return;
        const uri = getStitchedChapterUri(chapterIndex);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noveltools.setChapterAsContext', async (nodeOrItem) => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            await vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        const chapterIndex = await resolveChapterIndex(nodeOrItem);
        if (chapterIndex === null)
            return;
        const content = await buildStitchedChapterContent(chapterIndex);
        const relPath = (0, config_1.getChapterContextPath)().replace(/\\/g, '/');
        const segments = relPath.split('/').filter(Boolean);
        if (segments.length === 0) {
            await vscode.window.showErrorMessage('Invalid noveltools.chapterContextPath.');
            return;
        }
        const fileUri = vscode.Uri.joinPath(folder.uri, ...segments);
        if (segments.length > 1) {
            const parentUri = vscode.Uri.joinPath(folder.uri, ...segments.slice(0, -1));
            await vscode.workspace.fs.createDirectory(parentUri);
        }
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
        const { data } = await (0, sceneList_1.getManuscript)();
        const ch = data?.chapters[chapterIndex];
        const chapterLabel = ch?.title ?? `Chapter ${chapterIndex + 1}`;
        await vscode.window.showTextDocument(fileUri, { preview: false, viewColumn: vscode.ViewColumn.One });
        await vscode.window.showInformationMessage(`"${chapterLabel}" written to ${relPath}. @-mention this file in chat for review, or add a Cursor rule that references it.`);
    }));
}
function countWords(text) {
    const matches = text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu);
    return matches?.length ?? 0;
}
function formatSceneCount(count) {
    return `${count} ${count === 1 ? 'scene' : 'scenes'}`;
}
function chapterHeading(title, chapterIndex) {
    const fallback = `Chapter ${chapterIndex + 1}`;
    const trimmed = title?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
function sceneHeading(uri, sceneIndex) {
    const stem = path.basename(uri.fsPath, path.extname(uri.fsPath));
    const pretty = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return pretty || `Scene ${sceneIndex + 1}`;
}
function renderStitchedHeader(title, chapterCount, sceneCount, wordCount) {
    const generatedAt = new Date().toLocaleString();
    return [
        `# ${title}`,
        '',
        `> Stitched with NovelTools on ${generatedAt}.`,
        '',
        `**${chapterCount} chapters** · **${sceneCount} scenes** · **${wordCount.toLocaleString()} words**`,
        '',
    ].join('\n');
}
async function collectStitchedScenes(sceneUris) {
    const scenes = [];
    for (let i = 0; i < sceneUris.length; i++) {
        const uri = sceneUris[i];
        const source = vscode.workspace.asRelativePath(uri);
        const heading = sceneHeading(uri, i);
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const body = doc.getText().trimEnd();
            scenes.push({
                index: i,
                heading,
                source,
                body,
                wordCount: countWords(body),
                unreadable: false,
            });
        }
        catch {
            scenes.push({
                index: i,
                heading,
                source,
                body: `> [!warning]\n> Could not read \`${source}\`.`,
                wordCount: 0,
                unreadable: true,
            });
        }
    }
    return scenes;
}
function renderChapterBlock(chapter) {
    const out = [
        `## ${chapter.index + 1}. ${chapter.heading}`,
        '',
        `> ${formatSceneCount(chapter.scenes.length)}`,
        '',
    ];
    if (chapter.scenes.length === 0) {
        out.push('> _No scenes found in this chapter._', '', '---', '');
        return out.join('\n');
    }
    for (const scene of chapter.scenes) {
        out.push(`### ${chapter.index + 1}.${scene.index + 1} ${scene.heading}`);
        out.push('');
        out.push(scene.unreadable
            ? `*Source:* \`${scene.source}\``
            : `*Source:* \`${scene.source}\` · *${scene.wordCount.toLocaleString()} words*`);
        out.push('');
        out.push(scene.body);
        out.push('', '---', '');
    }
    return out.join('\n');
}
async function buildStitchedContent() {
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.flatUris.length === 0)
        return 'No manuscript. Add a noveltools.yaml or scenes.';
    const stitchedChapters = [];
    let totalWords = 0;
    let totalScenes = 0;
    for (let chapterIndex = 0; chapterIndex < data.chapters.length; chapterIndex++) {
        const ch = data.chapters[chapterIndex];
        const scenes = await collectStitchedScenes(ch.sceneUris);
        stitchedChapters.push({
            index: chapterIndex,
            heading: chapterHeading(ch.title, chapterIndex),
            scenes,
        });
        totalScenes += scenes.length;
        totalWords += scenes.reduce((sum, s) => sum + s.wordCount, 0);
    }
    const title = data.title?.trim() || 'Untitled Manuscript';
    const parts = [renderStitchedHeader(title, stitchedChapters.length, totalScenes, totalWords)];
    parts.push('## Contents', '');
    for (const chapter of stitchedChapters) {
        parts.push(`- ${chapter.index + 1}. ${chapter.heading} (${formatSceneCount(chapter.scenes.length)})`);
    }
    parts.push('', '---', '');
    for (const chapter of stitchedChapters) {
        parts.push(renderChapterBlock(chapter));
    }
    return parts.join('\n').trimEnd();
}
/**
 * Resolve chapter index from a tree item (when invoked from Manuscript view context menu)
 * or show a quick pick and return the selected index. Returns null if cancelled or no chapters.
 */
async function resolveChapterIndex(nodeOrItem) {
    const item = nodeOrItem;
    if (item && typeof item === 'object' && item.contextValue === 'chapter') {
        const label = typeof item.label === 'string'
            ? item.label
            : undefined;
        if (label !== undefined) {
            const { data } = await (0, sceneList_1.getManuscript)();
            if (data?.chapters) {
                const i = data.chapters.findIndex((ch, idx) => (ch.title ?? `Chapter ${idx + 1}`) === label);
                if (i >= 0)
                    return i;
            }
        }
    }
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.chapters.length === 0) {
        await vscode.window.showInformationMessage('No chapters in manuscript.');
        return null;
    }
    const items = data.chapters.map((ch, i) => ({
        label: ch.title ?? `Chapter ${i + 1}`,
        description: `${ch.sceneUris.length} scene(s)`,
        chapterIndex: i,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Open stitched chapter…' });
    return picked ? picked.chapterIndex : null;
}
/** Build stitched markdown for a single chapter (same format as full manuscript). */
async function buildStitchedChapterContent(chapterIndex) {
    const { data } = await (0, sceneList_1.getManuscript)();
    if (!data || data.chapters.length === 0)
        return 'No manuscript. Add a noveltools.yaml or scenes.';
    const ch = data.chapters[chapterIndex];
    if (!ch)
        return `Chapter ${chapterIndex + 1} not found.`;
    const heading = chapterHeading(ch.title, chapterIndex);
    const scenes = await collectStitchedScenes(ch.sceneUris);
    const totalWords = scenes.reduce((sum, s) => sum + s.wordCount, 0);
    const chapterData = {
        index: chapterIndex,
        heading,
        scenes,
    };
    return [
        renderStitchedHeader(heading, 1, scenes.length, totalWords),
        '---',
        '',
        renderChapterBlock(chapterData),
    ].join('\n').trimEnd();
}
//# sourceMappingURL=stitchedProvider.js.map
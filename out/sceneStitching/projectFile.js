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
exports.writeProjectYaml = writeProjectYaml;
exports.buildProjectYamlToFile = buildProjectYamlToFile;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const projectYaml_1 = require("./projectYaml");
function isIndexYaml(uri) {
    const base = path.basename(uri.fsPath);
    const ext = path.extname(base).toLowerCase();
    const stem = base.slice(0, base.length - ext.length);
    return /^index$/i.test(stem) && (ext === '.yaml' || ext === '.yml');
}
async function writeProjectYaml(uri, data) {
    const baseDir = vscode.Uri.joinPath(uri, '..');
    let yaml;
    if (data.longformMeta) {
        yaml = (0, projectYaml_1.serializeToLongformYaml)(data);
    }
    else if (isIndexYaml(uri)) {
        yaml = (0, projectYaml_1.serializeToIndexYaml)({
            ...data,
            chapters: [
                {
                    title: undefined,
                    sceneUris: data.flatUris,
                    scenePaths: (0, projectYaml_1.scenePathsRelativeTo)(baseDir, data.flatUris),
                },
            ],
            projectFileUri: uri,
        });
    }
    else {
        yaml = (0, projectYaml_1.serializeToYaml)(data, baseDir);
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, yaml);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
}
/** Create or overwrite project YAML at targetUri with data; scene paths are written relative to the file's directory. */
async function buildProjectYamlToFile(targetUri, data) {
    const baseDir = vscode.Uri.joinPath(targetUri, '..');
    if (data.longformMeta) {
        const yaml = (0, projectYaml_1.serializeToLongformYaml)(data);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
        return;
    }
    if (isIndexYaml(targetUri)) {
        const scenePaths = (0, projectYaml_1.scenePathsRelativeTo)(baseDir, data.flatUris);
        const dataForWrite = {
            ...data,
            chapters: [
                { title: undefined, sceneUris: data.flatUris, scenePaths },
            ],
            projectFileUri: targetUri,
        };
        const yaml = (0, projectYaml_1.serializeToIndexYaml)(dataForWrite);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
        return;
    }
    const chapters = data.chapters.map((ch) => ({
        ...ch,
        scenePaths: (0, projectYaml_1.scenePathsRelativeTo)(baseDir, ch.sceneUris),
    }));
    const dataForWrite = { ...data, chapters, projectFileUri: targetUri };
    const yaml = (0, projectYaml_1.serializeToYaml)(dataForWrite, baseDir);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
}
//# sourceMappingURL=projectFile.js.map
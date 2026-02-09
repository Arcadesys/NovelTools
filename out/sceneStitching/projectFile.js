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
const vscode = __importStar(require("vscode"));
const projectYaml_1 = require("./projectYaml");
async function writeProjectYaml(uri, data) {
    const yaml = (0, projectYaml_1.serializeToYaml)(data);
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
    const chapters = data.chapters.map((ch) => ({
        ...ch,
        scenePaths: (0, projectYaml_1.scenePathsRelativeTo)(baseDir, ch.sceneUris),
    }));
    const dataForWrite = { ...data, chapters, projectFileUri: targetUri };
    const yaml = (0, projectYaml_1.serializeToYaml)(dataForWrite);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
}
//# sourceMappingURL=projectFile.js.map
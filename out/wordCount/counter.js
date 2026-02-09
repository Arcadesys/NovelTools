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
exports.countWords = countWords;
exports.getDocumentWords = getDocumentWords;
exports.getManuscriptWordCount = getManuscriptWordCount;
const vscode = __importStar(require("vscode"));
/** Strip markdown syntax for a "reading" word count. */
function stripMarkdown(text) {
    return text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`[^`]+`/g, '')
        .replace(/^#+\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '');
}
function countWords(text, stripMarkdownOption = false) {
    const content = stripMarkdownOption ? stripMarkdown(text) : text;
    const tokens = content.split(/\s+/).filter((s) => s.length > 0);
    return tokens.length;
}
function getDocumentWords(doc) {
    return countWords(doc.getText());
}
async function getManuscriptWordCount(uris, stripMarkdownOption) {
    let total = 0;
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            total += countWords(doc.getText(), stripMarkdownOption);
        }
        catch {
            // skip missing or unreadable files
        }
    }
    return total;
}
//# sourceMappingURL=counter.js.map
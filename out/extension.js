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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const statusBar_1 = require("./wordCount/statusBar");
const navigation_1 = require("./sceneStitching/navigation");
const moveChapter_1 = require("./sceneStitching/moveChapter");
const moveScene_1 = require("./sceneStitching/moveScene");
const addScene_1 = require("./sceneStitching/addScene");
const stitchedProvider_1 = require("./sceneStitching/stitchedProvider");
const manuscriptView_1 = require("./sceneStitching/manuscriptView");
const sceneList_1 = require("./sceneStitching/sceneList");
function safeRegister(name, fn) {
    try {
        fn();
    }
    catch (err) {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[NovelTools] Failed to initialize ${name}:`, err);
        void vscode.window.showErrorMessage(`NovelTools startup issue in "${name}". ${detail}`);
    }
}
function activate(context) {
    (0, sceneList_1.initSceneList)(context);
    safeRegister('Manuscript View', () => (0, manuscriptView_1.registerManuscriptView)(context));
    safeRegister('Stitched Provider', () => (0, stitchedProvider_1.registerStitchedProvider)(context));
    safeRegister('Navigation', () => (0, navigation_1.registerNavigation)(context));
    safeRegister('Move Chapter', () => (0, moveChapter_1.registerMoveChapter)(context));
    safeRegister('Move Scene', () => (0, moveScene_1.registerMoveScene)(context));
    safeRegister('Add Scene', () => (0, addScene_1.registerAddScene)(context));
    safeRegister('Word Count', () => (0, statusBar_1.registerWordCount)(context));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
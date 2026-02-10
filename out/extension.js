"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const statusBar_1 = require("./wordCount/statusBar");
const navigation_1 = require("./sceneStitching/navigation");
const moveChapter_1 = require("./sceneStitching/moveChapter");
const moveScene_1 = require("./sceneStitching/moveScene");
const stitchedProvider_1 = require("./sceneStitching/stitchedProvider");
const manuscriptView_1 = require("./sceneStitching/manuscriptView");
const soundController_1 = require("./typewriter/soundController");
const sceneList_1 = require("./sceneStitching/sceneList");
function activate(context) {
    (0, sceneList_1.initSceneList)(context);
    (0, statusBar_1.registerWordCount)(context);
    (0, navigation_1.registerNavigation)(context);
    (0, moveChapter_1.registerMoveChapter)(context);
    (0, moveScene_1.registerMoveScene)(context);
    (0, stitchedProvider_1.registerStitchedProvider)(context);
    (0, manuscriptView_1.registerManuscriptView)(context);
    (0, soundController_1.registerTypewriterSound)(context);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
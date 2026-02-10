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
exports.ensureSoundWebview = ensureSoundWebview;
exports.updateSoundWebviewContent = updateSoundWebviewContent;
exports.playTypewriterSound = playTypewriterSound;
const vscode = __importStar(require("vscode"));
let panel;
function getHtml(soundUri, volume) {
    const soundSrc = soundUri
        ? `src="${soundUri.toString().replace(/"/g, '&quot;')}"`
        : '';
    const vol = Math.max(0, Math.min(1, volume));
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground);margin:12px;}</style>
</head>
<body>
<p>Typewriter sound is active. This panel runs in the background; you can close it or leave it open.</p>
<audio id="click" ${soundSrc} preload="auto"></audio>
<script>
(function() {
  const audio = document.getElementById('click');
  audio.volume = ${vol};
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  function playSound() {
    if (audio.src && audio.src !== location.href) {
      audio.currentTime = 0;
      audio.play().catch(function(){});
      return;
    }
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.04);
  }
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'play') playSound();
  });
})();
</script>
</body>
</html>`;
}
function ensureSoundWebview(context, options) {
    if (panel) {
        panel.webview.html = getHtml(options.soundWebviewUri, options.volume);
        return panel;
    }
    panel = vscode.window.createWebviewPanel('noveltoolsTypewriterSound', 'NovelTools Sound', { viewColumn: vscode.ViewColumn.One, preserveFocus: true }, { retainContextWhenHidden: true, enableScripts: true });
    panel.onDidDispose(() => {
        panel = undefined;
    });
    panel.webview.html = getHtml(options.soundWebviewUri, options.volume);
    return panel;
}
function updateSoundWebviewContent(volume, soundWebviewUri) {
    if (panel) {
        panel.webview.html = getHtml(soundWebviewUri, volume);
    }
}
function playTypewriterSound(context, options) {
    const p = ensureSoundWebview(context, options);
    p.webview.postMessage({ type: 'play' });
}
//# sourceMappingURL=soundWebview.js.map
import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;

function getHtml(soundUri: vscode.Uri | null, volume: number): string {
  const soundSrc = soundUri
    ? `src="${soundUri.toString().replace(/"/g, '&quot;')}"`
    : '';
  const vol = Math.max(0, Math.min(1, volume));
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
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

export function ensureSoundWebview(
  context: vscode.ExtensionContext,
  options: { volume: number; soundWebviewUri: vscode.Uri | null }
): vscode.WebviewPanel {
  if (panel) {
    panel.webview.html = getHtml(options.soundWebviewUri, options.volume);
    return panel;
  }
  panel = vscode.window.createWebviewPanel(
    'noveltoolsTypewriterSound',
    'NovelTools Sound',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { retainContextWhenHidden: true, enableScripts: true }
  );
  panel.onDidDispose(() => {
    panel = undefined;
  });
  panel.webview.html = getHtml(options.soundWebviewUri, options.volume);
  return panel;
}

export function updateSoundWebviewContent(
  volume: number,
  soundWebviewUri: vscode.Uri | null
): void {
  if (panel) {
    panel.webview.html = getHtml(soundWebviewUri, volume);
  }
}

export function playTypewriterSound(
  context: vscode.ExtensionContext,
  options: { volume: number; soundWebviewUri: vscode.Uri | null }
): void {
  const p = ensureSoundWebview(context, options);
  p.reveal(vscode.ViewColumn.One, true);
  p.webview.postMessage({ type: 'play' });
}

import * as vscode from 'vscode';
import { getManuscript } from './sceneList';

export function registerNavigation(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.nextScene', () => goAdjacentScene(1)),
    vscode.commands.registerCommand('noveltools.previousScene', () => goAdjacentScene(-1)),
    vscode.commands.registerCommand('noveltools.goToScene', goToScenePicker),
    vscode.commands.registerCommand('noveltools.nextChapter', () => goAdjacentChapter(1)),
    vscode.commands.registerCommand('noveltools.previousChapter', () => goAdjacentChapter(-1)),
    vscode.commands.registerCommand('noveltools.goToChapter', goToChapterPicker)
  );
}

async function goAdjacentScene(delta: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const { flatUris } = await getManuscript();
  if (flatUris.length === 0) return;
  const current = editor.document.uri.toString();
  const idx = flatUris.findIndex((u) => u.toString() === current);
  if (idx < 0) return;
  const nextIdx = (idx + delta + flatUris.length) % flatUris.length;
  const uri = flatUris[nextIdx];
  await vscode.window.showTextDocument(uri);
}

async function goToScenePicker(): Promise<void> {
  const { data, flatUris } = await getManuscript();
  if (flatUris.length === 0) {
    await vscode.window.showInformationMessage('No scenes in manuscript.');
    return;
  }
  const current = vscode.window.activeTextEditor?.document.uri.toString();
  type Item = vscode.QuickPickItem & { uri: vscode.Uri };
  const items: Item[] = [];
  let chapterLabel = '';
  flatUris.forEach((uri, i) => {
    if (data?.chapters) {
      let chIdx = 0;
      let acc = 0;
      for (let c = 0; c < data.chapters.length; c++) {
        if (i < acc + data.chapters[c].sceneUris.length) {
          chIdx = c;
          break;
        }
        acc += data.chapters[c].sceneUris.length;
      }
      const ch = data.chapters[chIdx];
      chapterLabel = ch?.title ? ch.title : `Chapter ${chIdx + 1}`;
    }
    const label = uri.path.split(/[/\\]/).pop() ?? uri.fsPath;
    items.push({
      label,
      description: chapterLabel,
      uri,
    });
  });
  const picked = await vscode.window.showQuickPick(items, {
    matchOnDescription: true,
    placeHolder: 'Go to scene…',
  });
  if (picked) await vscode.window.showTextDocument(picked.uri);
}

async function goAdjacentChapter(delta: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const { data } = await getManuscript();
  if (!data || data.chapters.length === 0) return;
  const current = editor.document.uri.toString();
  let currentChIdx = -1;
  for (let i = 0; i < data.chapters.length; i++) {
    if (data.chapters[i].sceneUris.some((u) => u.toString() === current)) {
      currentChIdx = i;
      break;
    }
  }
  if (currentChIdx < 0) return;
  const nextChIdx = (currentChIdx + delta + data.chapters.length) % data.chapters.length;
  const firstUri = data.chapters[nextChIdx].sceneUris[0];
  if (firstUri) await vscode.window.showTextDocument(firstUri);
}

async function goToChapterPicker(): Promise<void> {
  const { data } = await getManuscript();
  if (!data || data.chapters.length === 0) {
    await vscode.window.showInformationMessage('No chapters in manuscript.');
    return;
  }
  type Item = vscode.QuickPickItem & { chapterIndex: number };
  const items: Item[] = data.chapters.map((ch, i) => ({
    label: ch.title ?? `Chapter ${i + 1}`,
    description: `${ch.sceneUris.length} scene(s)`,
    chapterIndex: i,
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Go to chapter…' });
  if (picked) {
    const uri = data.chapters[picked.chapterIndex].sceneUris[0];
    if (uri) await vscode.window.showTextDocument(uri);
  }
}

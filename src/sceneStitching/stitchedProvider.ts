import * as vscode from 'vscode';
import { getManuscript } from './sceneList';

const SCHEME = 'noveltools';
const AUTHORITY = 'stitched';
const MANUSCRIPT_PATH = 'manuscript';

export function registerStitchedProvider(context: vscode.ExtensionContext): void {
  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(
      uri: vscode.Uri,
      _token: vscode.CancellationToken
    ): vscode.ProviderResult<string> {
      return buildStitchedContent();
    }
  })();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openStitchedManuscript', async () => {
      const uri = vscode.Uri.parse(`${SCHEME}://${AUTHORITY}/${MANUSCRIPT_PATH}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    })
  );
}

async function buildStitchedContent(): Promise<string> {
  const { data } = await getManuscript();
  if (!data || data.flatUris.length === 0) return 'No manuscript. Add a noveltools.yaml or scenes.';
  const parts: string[] = [];
  let chapterIndex = 0;
  for (const ch of data.chapters) {
    if (ch.title) {
      parts.push(`## ${ch.title}\n\n`);
    } else {
      chapterIndex++;
      parts.push(`## Chapter ${chapterIndex}\n\n`);
    }
    for (const uri of ch.sceneUris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        parts.push(doc.getText());
        parts.push('\n\n');
      } catch {
        parts.push(`<!-- ${uri.fsPath} (unreadable) -->\n\n`);
      }
    }
  }
  return parts.join('').trimEnd();
}

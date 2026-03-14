import * as vscode from 'vscode';

/** Strip markdown syntax for a "reading" word count. */
function stripMarkdown(text: string): string {
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

export function countWords(text: string, stripMarkdownOption = false): number {
  const content = stripMarkdownOption ? stripMarkdown(text) : text;
  const tokens = content.split(/\s+/).filter((s) => s.length > 0);
  return tokens.length;
}

export function getDocumentWords(doc: vscode.TextDocument): number {
  return countWords(doc.getText());
}

export async function getManuscriptWordCount(
  uris: vscode.Uri[],
  stripMarkdownOption: boolean
): Promise<number> {
  let total = 0;
  for (const uri of uris) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      total += countWords(doc.getText(), stripMarkdownOption);
    } catch (err) {
      console.warn(`[NovelTools] Could not read file for word count: ${uri.fsPath}`, err instanceof Error ? err.message : String(err));
    }
  }
  return total;
}

import * as vscode from 'vscode';
import { getDocumentWords, getManuscriptWordCount, countWords } from './counter';
import { getWordCountStripMarkdown, getWordCountManuscriptScope } from '../config';
import { getManuscriptUris } from '../sceneStitching/sceneList';

let documentItem: vscode.StatusBarItem;
let manuscriptItem: vscode.StatusBarItem;
let manuscriptUrisCache: vscode.Uri[] = [];

function formatCount(n: number): string {
  return n.toLocaleString();
}

function updateDocumentCount(doc: vscode.TextDocument | undefined): void {
  if (!documentItem) return;
  if (!doc || doc.languageId !== 'markdown') {
    documentItem.hide();
    return;
  }
  const strip = getWordCountStripMarkdown();
  const count = strip ? countWords(doc.getText(), true) : getDocumentWords(doc);
  documentItem.text = `$(book) Words: ${formatCount(count)}`;
  documentItem.show();
}

async function updateManuscriptCount(): Promise<void> {
  if (!manuscriptItem) return;
  const scope = getWordCountManuscriptScope();
  if (scope === 'workspace') {
    const files = await vscode.workspace.findFiles('**/*.md');
    manuscriptUrisCache = files;
  } else {
    const result = await getManuscriptUris();
    manuscriptUrisCache = result.flatUris;
  }
  if (manuscriptUrisCache.length === 0) {
    manuscriptItem.hide();
    return;
  }
  const strip = getWordCountStripMarkdown();
  const total = await getManuscriptWordCount(manuscriptUrisCache, strip);
  manuscriptItem.text = `$(library) Manuscript: ${formatCount(total)} words`;
  manuscriptItem.show();
}

function isManuscriptFile(uri: vscode.Uri): boolean {
  return manuscriptUrisCache.some((u) => u.toString() === uri.toString());
}

export function registerWordCount(context: vscode.ExtensionContext): void {
  documentItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  manuscriptItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  context.subscriptions.push(documentItem, manuscriptItem);

  updateDocumentCount(vscode.window.activeTextEditor?.document);
  updateManuscriptCount();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      updateDocumentCount(e?.document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const active = vscode.window.activeTextEditor?.document;
      if (active && e.document.uri.toString() === active.uri.toString()) {
        updateDocumentCount(active);
      }
      if (getWordCountManuscriptScope() === 'project' && isManuscriptFile(e.document.uri)) {
        updateManuscriptCount();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('noveltools')) {
        updateDocumentCount(vscode.window.activeTextEditor?.document);
        updateManuscriptCount();
      }
    })
  );
}

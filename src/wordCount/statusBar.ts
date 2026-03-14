import * as path from 'path';
import * as vscode from 'vscode';
import { getDocumentWords, getManuscriptWordCount, countWords } from './counter';
import { getWordCountStripMarkdown, getWordCountManuscriptScope, getProjectFile } from '../config';
import { getManuscript, getManuscriptUris } from '../sceneStitching/sceneList';
import { writeProject } from '../sceneStitching/projectFile';
import { clearManuscriptCache } from '../sceneStitching/sceneList';
import type { ManuscriptData } from '../sceneStitching/projectData';

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

function getCountableUris(data: ManuscriptData): vscode.Uri[] {
  const excluded = new Set<string>();
  if (data.sceneStatus) {
    for (const [pathKey, status] of Object.entries(data.sceneStatus)) {
      if (status === 'spiked') excluded.add(pathKey);
    }
  }
  if (excluded.size === 0) return data.flatUris;
  const baseDir = data.projectFileUri ? vscode.Uri.joinPath(data.projectFileUri, '..') : null;
  return data.flatUris.filter((uri) => {
    if (!baseDir) return true;
    const rel = path.relative(baseDir.fsPath, uri.fsPath).split(path.sep).join('/');
    return !excluded.has(rel);
  });
}

async function updateManuscriptCount(): Promise<void> {
  if (!manuscriptItem) return;
  const scope = getWordCountManuscriptScope();
  let wordCountTarget: number | undefined;
  if (scope === 'workspace') {
    const files = await vscode.workspace.findFiles('**/*.md');
    manuscriptUrisCache = files;
  } else {
    const result = await getManuscript();
    if (result.data) {
      manuscriptUrisCache = getCountableUris(result.data);
      wordCountTarget = result.data.wordCountTarget;
    } else {
      manuscriptUrisCache = result.flatUris;
    }
  }
  if (manuscriptUrisCache.length === 0) {
    manuscriptItem.hide();
    return;
  }
  const strip = getWordCountStripMarkdown();
  const total = await getManuscriptWordCount(manuscriptUrisCache, strip);
  if (wordCountTarget && wordCountTarget > 0) {
    manuscriptItem.text = `$(library) Manuscript: ${formatCount(total)} / ${formatCount(wordCountTarget)}`;
  } else {
    manuscriptItem.text = `$(library) Manuscript: ${formatCount(total)} words`;
  }
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

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setWordCountTarget', async () => {
      const result = await getManuscript();
      if (!result.data || !result.projectFileUri) {
        await vscode.window.showInformationMessage('Open or create a project file first.');
        return;
      }
      const current = result.data.wordCountTarget;
      const input = await vscode.window.showInputBox({
        title: 'Set Word Count Target',
        prompt: 'Enter a target word count for the manuscript (leave empty to clear)',
        value: current ? String(current) : '',
        placeHolder: '80000',
        validateInput: (v) => {
          if (v.trim() === '') return undefined;
          const n = Number(v);
          if (!Number.isInteger(n) || n <= 0) return 'Enter a positive integer.';
          return undefined;
        },
      });
      if (input === undefined) return;
      const target = input.trim() === '' ? undefined : Number(input);
      const updated: ManuscriptData = { ...result.data, wordCountTarget: target };
      await writeProject(result.projectFileUri, updated);
      clearManuscriptCache(result.projectFileUri);
      await updateManuscriptCount();
    })
  );
}

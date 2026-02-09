import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import { getManuscript, clearManuscriptCache } from './sceneList';
import {
  serializeToYaml,
  moveScene as moveSceneInData,
  reorderChapters,
  scenePathsRelativeTo,
} from './projectYaml';
import type { ManuscriptData } from './projectYaml';

const VIEW_ID = 'noveltools.manuscript';
const MIME_TREE = `application/vnd.code.tree.${VIEW_ID}`;

type TreeNode = RootNode | ChapterNode | SceneNode;

interface RootNode {
  type: 'root';
  label: string;
  data: ManuscriptData | null;
}

interface ChapterNode {
  type: 'chapter';
  chapterIndex: number;
  label: string;
  data: ManuscriptData;
}

interface SceneNode {
  type: 'scene';
  chapterIndex: number;
  sceneIndex: number;
  uri: vscode.Uri;
  label: string;
  data: ManuscriptData;
}

function getTreeItemLabel(node: TreeNode): string {
  switch (node.type) {
    case 'root':
      return node.label;
    case 'chapter':
      return node.label;
    case 'scene':
      return node.label;
  }
}

export function registerManuscriptView(context: vscode.ExtensionContext): void {
  const treeDataProvider = new ManuscriptTreeDataProvider();
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider,
    dragAndDropController: treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  treeView.onDidChangeSelection(async (e) => {
    const node = e.selection[0] as SceneNode | undefined;
    if (node?.type === 'scene') {
      await vscode.window.showTextDocument(node.uri);
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.refreshManuscript', () => {
      clearManuscriptCache();
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.buildProjectYaml', async () => {
      const result = await getManuscript();
      if (!result.data) {
        await vscode.window.showInformationMessage(
          'No manuscript files found. Configure noveltools.sceneFiles or noveltools.sceneGlob, or add markdown files.'
        );
        return;
      }
      const folders = vscode.workspace.workspaceFolders;
      if (!folders?.length) return;
      const name = getProjectFile();
      const segments = name.split(/[/\\]/);
      const targetUri =
        segments.length > 1
          ? vscode.Uri.joinPath(folders[0].uri, ...segments)
          : vscode.Uri.joinPath(folders[0].uri, name);
      await buildProjectYamlToFile(targetUri, result.data);
      clearManuscriptCache();
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const name = doc.uri.path.split(/[/\\]/).pop();
      if (name === 'noveltools.yaml' || name?.endsWith('manuscript.yaml')) {
        clearManuscriptCache();
        treeDataProvider.refresh();
      }
    })
  );
}

class ManuscriptTreeDataProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  dragMimeTypes = [MIME_TREE];
  dropMimeTypes = [MIME_TREE];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      getTreeItemLabel(element),
      element.type === 'root' ? vscode.TreeItemCollapsibleState.Expanded
        : element.type === 'chapter' ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    if (element.type === 'scene') {
      item.resourceUri = element.uri;
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [element.uri],
      };
    }
    item.contextValue = element.type;
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const result = await getManuscript();
    if (!result.data && !element) {
      return [{ type: 'root', label: 'No manuscript. Add a noveltools.yaml to get started.', data: null }];
    }
    if (element) {
      if (element.type === 'root' && element.data) {
        return element.data.chapters.map((ch, i) => ({
          type: 'chapter' as const,
          chapterIndex: i,
          label: ch.title ?? `Chapter ${i + 1}`,
          data: element.data!,
        }));
      }
      if (element.type === 'chapter') {
        return element.data.chapters[element.chapterIndex].sceneUris.map((uri, i) => ({
          type: 'scene' as const,
          chapterIndex: element.chapterIndex,
          sceneIndex: i,
          uri,
          label: uri.path.split(/[/\\]/).pop() ?? uri.fsPath,
          data: element.data,
        }));
      }
      return [];
    }
    const label = result.data?.title ?? 'Manuscript';
    return [{ type: 'root', label, data: result.data ?? null }];
  }

  async handleDrag(
    source: TreeNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const payload = source.map((n) => ({
      type: n.type,
      chapterIndex: n.type !== 'root' ? n.chapterIndex : -1,
      sceneIndex: n.type === 'scene' ? n.sceneIndex : -1,
    }));
    dataTransfer.set(MIME_TREE, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  async handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const item = dataTransfer.get(MIME_TREE);
    if (!item?.value) return;
    let payload: { type: string; chapterIndex: number; sceneIndex: number }[];
    try {
      payload = JSON.parse(item.value as string);
    } catch {
      return;
    }
    if (payload.length === 0) return;
    const source = payload[0];
    let result = await getManuscript();
    if (!result.data) return;
    if (!result.projectFileUri) {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders?.length) return;
      const name = getProjectFile();
      const segments = name.split(/[/\\]/);
      const targetUri =
        segments.length > 1
          ? vscode.Uri.joinPath(folders[0].uri, ...segments)
          : vscode.Uri.joinPath(folders[0].uri, name);
      await buildProjectYamlToFile(targetUri, result.data);
      clearManuscriptCache();
      result = await getManuscript();
    }
    if (!result.data || !result.projectFileUri) return;

    if (source.type === 'chapter') {
      const fromIdx = source.chapterIndex;
      let toIdx: number;
      if (!target) toIdx = result.data.chapters.length - 1;
      else if (target.type === 'chapter') toIdx = target.chapterIndex;
      else if (target.type === 'scene') toIdx = target.chapterIndex;
      else return;
      if (fromIdx === toIdx) return;
      const next = reorderChapters(result.data, fromIdx, toIdx);
      await writeProjectYaml(result.projectFileUri, next);
    } else if (source.type === 'scene') {
      const fromCh = source.chapterIndex;
      const fromSc = source.sceneIndex;
      let toCh: number;
      let toSc: number;
      if (!target) {
        toCh = result.data.chapters.length - 1;
        toSc = result.data.chapters[toCh].sceneUris.length;
      } else if (target.type === 'chapter') {
        toCh = target.chapterIndex;
        toSc = result.data.chapters[toCh].sceneUris.length;
      } else if (target.type === 'scene') {
        toCh = target.chapterIndex;
        toSc = target.sceneIndex;
      } else return;
      const next = moveSceneInData(result.data, fromCh, fromSc, toCh, toSc);
      await writeProjectYaml(result.projectFileUri, next);
    }
    clearManuscriptCache();
    this.refresh();
  }
}

async function writeProjectYaml(uri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const yaml = serializeToYaml(data);
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
  edit.replace(uri, fullRange, yaml);
  await vscode.workspace.applyEdit(edit);
}

/** Create or overwrite project YAML at targetUri with data; scene paths are written relative to the file's directory. */
async function buildProjectYamlToFile(targetUri: vscode.Uri, data: ManuscriptData): Promise<void> {
  const baseDir = vscode.Uri.joinPath(targetUri, '..');
  const chapters = data.chapters.map((ch) => ({
    ...ch,
    scenePaths: scenePathsRelativeTo(baseDir, ch.sceneUris),
  }));
  const dataForWrite: ManuscriptData = { ...data, chapters, projectFileUri: targetUri };
  const yaml = serializeToYaml(dataForWrite);
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, 'utf8'));
}

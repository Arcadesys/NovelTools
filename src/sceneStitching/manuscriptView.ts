import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile } from '../config';
import {
  getManuscript,
  getManuscriptByUri,
  clearManuscriptCache,
  findAllIndexYaml,
  setActiveProjectUri,
  type ManuscriptResult,
} from './sceneList';
import {
  moveScene as moveSceneInData,
  reorderChapters,
  removeScene as removeSceneInData,
  removeChapter as removeChapterInData,
  parseLongformStrict,
  parseLongformIndexYaml,
} from './projectYaml';
import { buildProjectYamlToFile, writeProjectYaml } from './projectFile';
import type { ManuscriptData, SceneStatus } from './projectYaml';

const VIEW_ID = 'noveltools.manuscript';
const MIME_TREE = `application/vnd.code.tree.${VIEW_ID}`;
const QUICK_START_FALLBACK = `# NovelTools Quick Start

1. Create a project file
   - Run "NovelTools: Build Project YAML" to create \`noveltools.yaml\` from your scene files.

2. Use the Manuscript view
   - Drag chapters and scenes to reorder. Changes are written back to the YAML.

3. Read the stitched manuscript
   - Run "NovelTools: Open Stitched Manuscript" to view the whole draft at once.

Tips
- Settings live under "NovelTools" in VS Code Settings.
- Word counts and typewriter sounds are optional toggles.
`;

type TreeNode = RootNode | DocumentNode | ChapterNode | SceneNode;

interface RootNode {
  type: 'root';
  label: string;
  data: ManuscriptData | null;
}

interface DocumentNode {
  type: 'document';
  label: string;
  projectFileUri: vscode.Uri;
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
  status?: SceneStatus;
  data: ManuscriptData;
}

const STATUS_EMOJI: Record<SceneStatus, string> = {
  done: '🟢',
  drafted: '🟡',
  spiked: '🔴',
};

function getTreeItemLabel(node: TreeNode): string {
  switch (node.type) {
    case 'root':
      return node.label;
    case 'document':
      return node.label;
    case 'chapter':
      return node.label;
    case 'scene': {
      const prefix = node.status ? `${STATUS_EMOJI[node.status]} ` : '';
      return `${prefix}${node.label}`;
    }
  }
}

export function registerManuscriptView(context: vscode.ExtensionContext): void {
  const treeDataProvider = new ManuscriptTreeDataProvider(context);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider,
    dragAndDropController: treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  treeView.onDidChangeSelection(async (e) => {
    const node = e.selection[0] as TreeNode | undefined;
    if (!node) return;
    if (node.type === 'scene') {
      await vscode.window.showTextDocument(node.uri);
    } else if (node.type === 'document') {
      await setActiveProjectUri(node.projectFileUri);
      treeDataProvider.refresh();
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
    vscode.commands.registerCommand('noveltools.convertLongformToProjectYaml', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders?.length) {
        await vscode.window.showInformationMessage('Open a workspace folder first.');
        return;
      }
      let sourceUri: vscode.Uri | undefined;
      const activeDoc = vscode.window.activeTextEditor?.document;
      const activeName = activeDoc?.uri.path.split(/[/\\]/).pop() ?? '';
      const isIndexLike = /index\.(yaml|yml|md)$/i.test(activeName) || activeName.endsWith('manuscript.yaml');
      if (activeDoc && isIndexLike && vscode.workspace.getWorkspaceFolder(activeDoc.uri)) {
        sourceUri = activeDoc.uri;
      }
      if (!sourceUri) {
        const allIndex = await findAllIndexYaml();
        if (allIndex.length === 0) {
          await vscode.window.showInformationMessage(
            'No index files found. Create or open a Longform index (e.g. Index.YAML or index.yaml) and try again.'
          );
          return;
        }
        const picked = await vscode.window.showQuickPick(
          allIndex.map((u) => ({
            label: vscode.workspace.asRelativePath(u),
            uri: u,
          })),
          { title: 'Select a Longform index to convert', matchOnDescription: true }
        );
        if (!picked) return;
        sourceUri = picked.uri;
      }
      const bytes = await vscode.workspace.fs.readFile(sourceUri);
      const content = new TextDecoder().decode(bytes);
      const data = parseLongformStrict(content, sourceUri) ?? parseLongformIndexYaml(content, sourceUri);
      if (!data || data.flatUris.length === 0) {
        await vscode.window.showWarningMessage(
          "This file doesn't appear to be a Longform index, or it has no scenes. Use a file with longform frontmatter and a scenes list."
        );
        return;
      }
      const name = getProjectFile();
      const segments = name.split(/[/\\]/);
      const targetUri =
        segments.length > 1
          ? vscode.Uri.joinPath(folders[0].uri, ...segments)
          : vscode.Uri.joinPath(folders[0].uri, name);
      try {
        await vscode.workspace.fs.stat(targetUri);
        const overwrite = await vscode.window.showWarningMessage(
          `"${vscode.workspace.asRelativePath(targetUri)}" already exists. Overwrite with converted project YAML?`,
          { modal: true },
          'Overwrite'
        );
        if (overwrite !== 'Overwrite') return;
      } catch {
        // file doesn't exist, proceed
      }
      const dataForNovelTools: ManuscriptData = {
        ...data,
        longformMeta: undefined,
        projectFileUri: targetUri,
      };
      await buildProjectYamlToFile(targetUri, dataForNovelTools);
      await setActiveProjectUri(targetUri);
      clearManuscriptCache();
      treeDataProvider.refresh();
      await vscode.window.showInformationMessage(
        `Converted Longform index to ${vscode.workspace.asRelativePath(targetUri)}. You can now use it as your project file.`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openProjectYaml', async () => {
      const result = await getManuscript();
      if (result.projectFileUri) {
        const doc = await vscode.workspace.openTextDocument(result.projectFileUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'No project YAML found. Build one now?',
        'Build Project YAML'
      );
      if (choice === 'Build Project YAML') {
        await vscode.commands.executeCommand('noveltools.buildProjectYaml');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'noveltools');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.showQuickStart', async () => {
      await openQuickStart(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.renameChapter', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
      if (selection?.type !== 'chapter') {
        const item = nodeOrItem ?? treeView.selection[0];
        const label = item && typeof item === 'object' && 'label' in item ? (item as vscode.TreeItem).label : undefined;
        if (label !== undefined && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'chapter') {
          const result = await getManuscript();
          if (result.data?.projectFileUri) {
            const chapterIndex = result.data.chapters.findIndex(
              (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === label
            );
            if (chapterIndex >= 0) {
              selection = {
                type: 'chapter',
                chapterIndex,
                label: String(label),
                data: result.data,
              };
            }
          }
        }
      }
      if (selection?.type !== 'chapter') {
        await vscode.window.showInformationMessage('Select a chapter in the Manuscript view to rename it.');
        return;
      }
      const currentName = selection.label;
      const name = await vscode.window.showInputBox({
        title: 'Rename Chapter',
        value: currentName,
        prompt: 'Enter the chapter name for the manuscript and YAML.',
      });
      if (name === undefined) return;
      const data = selection.data;
      if (!data.projectFileUri) return;
      const chapters = data.chapters.map((ch, i) =>
        i === selection.chapterIndex ? { ...ch, title: name.trim() || undefined } : ch
      );
      const updated: typeof data = {
        ...data,
        chapters,
        flatUris: chapters.flatMap((ch) => ch.sceneUris),
      };
      await writeProjectYaml(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.removeScene', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
      if (selection?.type !== 'scene') {
        const item = nodeOrItem ?? treeView.selection[0];
        const uri = item && typeof item === 'object' && 'resourceUri' in item ? (item as vscode.TreeItem).resourceUri : undefined;
        if (uri && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'scene') {
          const result = await getManuscript();
          if (result.data?.projectFileUri) {
            for (let ci = 0; ci < result.data.chapters.length; ci++) {
              const si = result.data.chapters[ci].sceneUris.findIndex((u) => u.toString() === uri.toString());
              if (si >= 0) {
                selection = {
                  type: 'scene',
                  chapterIndex: ci,
                  sceneIndex: si,
                  uri,
                  label: (item as vscode.TreeItem).label as string ?? path.basename(uri.fsPath),
                  data: result.data,
                };
                break;
              }
            }
          }
        }
      }
      if (selection?.type !== 'scene') {
        await vscode.window.showInformationMessage('Select a scene in the Manuscript view to remove it.');
        return;
      }
      const data = selection.data;
      if (!data.projectFileUri) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove "${selection.label}" from the manuscript? The file will not be deleted from disk.`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;
      const updated = removeSceneInData(data, selection.chapterIndex, selection.sceneIndex);
      await writeProjectYaml(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.deleteScene', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
      if (selection?.type !== 'scene') {
        const item = nodeOrItem ?? treeView.selection[0];
        const uri = item && typeof item === 'object' && 'resourceUri' in item ? (item as vscode.TreeItem).resourceUri : undefined;
        if (uri && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'scene') {
          const result = await getManuscript();
          if (result.data?.projectFileUri) {
            for (let ci = 0; ci < result.data.chapters.length; ci++) {
              const si = result.data.chapters[ci].sceneUris.findIndex((u) => u.toString() === uri.toString());
              if (si >= 0) {
                selection = {
                  type: 'scene',
                  chapterIndex: ci,
                  sceneIndex: si,
                  uri,
                  label: (item as vscode.TreeItem).label as string ?? path.basename(uri.fsPath),
                  data: result.data,
                };
                break;
              }
            }
          }
        }
      }
      if (selection?.type !== 'scene') {
        await vscode.window.showInformationMessage('Select a scene in the Manuscript view to delete.');
        return;
      }
      const data = selection.data;
      if (!data.projectFileUri) return;
      const fileLabel = path.basename(selection.uri.fsPath);
      const confirm = await vscode.window.showWarningMessage(
        `Delete scene "${selection.label}"? It will be removed from the manuscript and the file "${fileLabel}" will be deleted from disk. This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;
      const updated = removeSceneInData(data, selection.chapterIndex, selection.sceneIndex);
      await writeProjectYaml(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      try {
        await vscode.workspace.fs.delete(selection.uri);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Removed from manuscript, but could not delete file: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === selection!.uri.toString());
      if (doc) {
        await vscode.window.showTextDocument(doc, { preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.removeChapter', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
      if (selection?.type !== 'chapter') {
        const item = nodeOrItem ?? treeView.selection[0];
        const label = item && typeof item === 'object' && 'label' in item ? (item as vscode.TreeItem).label : undefined;
        if (label !== undefined && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'chapter') {
          const result = await getManuscript();
          if (result.data?.projectFileUri) {
            const chapterIndex = result.data.chapters.findIndex(
              (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === label
            );
            if (chapterIndex >= 0) {
              selection = {
                type: 'chapter',
                chapterIndex,
                label: String(label),
                data: result.data,
              };
            }
          }
        }
      }
      if (selection?.type !== 'chapter') {
        await vscode.window.showInformationMessage('Select a chapter in the Manuscript view to remove it.');
        return;
      }
      const data = selection.data;
      if (!data.projectFileUri) return;
      const ch = data.chapters[selection.chapterIndex];
      const sceneCount = ch?.sceneUris.length ?? 0;
      const confirm = await vscode.window.showWarningMessage(
        `Remove chapter "${selection.label}" and its ${sceneCount} scene(s) from the manuscript? Scene files will not be deleted from disk.`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;
      const updated = removeChapterInData(data, selection.chapterIndex);
      await writeProjectYaml(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      treeDataProvider.refresh();
    })
  );

  async function resolveSceneSelection(nodeOrItem?: TreeNode | vscode.TreeItem): Promise<SceneNode | undefined> {
    let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
    if (selection?.type === 'scene') return selection;
    const item = nodeOrItem ?? treeView.selection[0];
    const uri = item && typeof item === 'object' && 'resourceUri' in item ? (item as vscode.TreeItem).resourceUri : undefined;
    if (!uri || !item || typeof item !== 'object' || (item as vscode.TreeItem).contextValue !== 'scene') return undefined;
    const result = await getManuscript();
    if (!result.data?.projectFileUri) return undefined;
    for (let ci = 0; ci < result.data.chapters.length; ci++) {
      const ch = result.data.chapters[ci];
      const si = ch.sceneUris.findIndex((u) => u.toString() === uri.toString());
      if (si >= 0) {
        const scenePath = ch.scenePaths[si] ?? path.relative(path.dirname(result.data.projectFileUri.fsPath), uri.fsPath);
        const pathKey = scenePath.split(path.sep).join('/');
        return {
          type: 'scene',
          chapterIndex: ci,
          sceneIndex: si,
          uri,
          label: (item as vscode.TreeItem).label as string ?? path.basename(uri.fsPath),
          status: result.data.sceneStatus?.[pathKey],
          data: result.data,
        };
      }
    }
    return undefined;
  }

  async function applySectionStatus(nodeOrItem: TreeNode | vscode.TreeItem | undefined, status: SceneStatus | null): Promise<void> {
    const selection = await resolveSceneSelection(nodeOrItem);
    if (!selection) {
      await vscode.window.showInformationMessage('Select a scene in the Manuscript view to set its status.');
      return;
    }
    const data = selection.data;
    if (!data.projectFileUri) {
      await vscode.window.showInformationMessage('Section status is saved in the project YAML. Open or create a project file first.');
      return;
    }
    const ch = data.chapters[selection.chapterIndex];
    const scenePath = ch.scenePaths[selection.sceneIndex] ?? path.relative(path.dirname(data.projectFileUri.fsPath), selection.uri.fsPath);
    const pathKey = scenePath.split(path.sep).join('/');
    const sceneStatus = { ...data.sceneStatus };
    if (status === null) {
      delete sceneStatus[pathKey];
    } else {
      sceneStatus[pathKey] = status;
    }
    const updated: ManuscriptData = {
      ...data,
      sceneStatus: Object.keys(sceneStatus).length ? sceneStatus : undefined,
    };
    await writeProjectYaml(data.projectFileUri, updated);
    clearManuscriptCache(data.projectFileUri);
    treeDataProvider.refresh();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setSectionStatusDone', (nodeOrItem?: TreeNode | vscode.TreeItem) =>
      applySectionStatus(nodeOrItem, 'done')
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setSectionStatusDrafted', (nodeOrItem?: TreeNode | vscode.TreeItem) =>
      applySectionStatus(nodeOrItem, 'drafted')
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setSectionStatusSpiked', (nodeOrItem?: TreeNode | vscode.TreeItem) =>
      applySectionStatus(nodeOrItem, 'spiked')
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.clearSectionStatus', (nodeOrItem?: TreeNode | vscode.TreeItem) =>
      applySectionStatus(nodeOrItem, null)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.setSectionStatus', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      const selection = await resolveSceneSelection(nodeOrItem);
      if (!selection) {
        await vscode.window.showInformationMessage('Select a scene in the Manuscript view to set its status.');
        return;
      }
      const data = selection.data;
      if (!data.projectFileUri) {
        await vscode.window.showInformationMessage('Section status is saved in the project YAML. Open or create a project file first.');
        return;
      }
      const choice = await vscode.window.showQuickPick(
        [
          { label: '🟢 Done', value: 'done' as SceneStatus },
          { label: '🟡 Drafted', value: 'drafted' as SceneStatus },
          { label: '🔴 Spiked out', value: 'spiked' as SceneStatus },
          { label: '$(clear) Clear status', value: null },
        ],
        { title: 'Set section status', placeHolder: selection.label }
      );
      if (choice === undefined) return;
      await applySectionStatus(nodeOrItem, choice.value);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.selectDocument', async () => {
      const allIndex = await findAllIndexYaml();
      if (allIndex.length <= 1) return;
      const items = await Promise.all(
        allIndex.map(async (uri) => {
          const result = await getManuscriptByUri(uri);
          const label = result.data?.title ?? vscode.workspace.asRelativePath(uri);
          return { label, uri, result };
        })
      );
      const picked = await vscode.window.showQuickPick(
        items.map((i) => ({ label: i.label, description: vscode.workspace.asRelativePath(i.uri), uri: i.uri })),
        { title: 'Select manuscript document', matchOnDescription: true }
      );
      if (picked) {
        await setActiveProjectUri(picked.uri);
        treeDataProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const name = doc.uri.path.split(/[/\\]/).pop() ?? '';
      const isIndexLike = /index\.(yaml|md)$/i.test(name) || name?.endsWith('manuscript.yaml');
      if (name === 'noveltools.yaml' || isIndexLike) {
        clearManuscriptCache(doc.uri);
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

  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

  dragMimeTypes = [MIME_TREE];
  dropMimeTypes = [MIME_TREE];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const collapsible =
      element.type === 'root' || element.type === 'document'
        ? vscode.TreeItemCollapsibleState.Expanded
        : element.type === 'chapter'
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(getTreeItemLabel(element), collapsible);
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
    const allIndex = await findAllIndexYaml();
    if (allIndex.length > 1 && !element) {
      const nodes: DocumentNode[] = [];
      for (const uri of allIndex) {
        const result = await getManuscriptByUri(uri);
        const label = result.data?.title ?? vscode.workspace.asRelativePath(uri);
        nodes.push({ type: 'document', label, projectFileUri: uri });
      }
      await updateViewContext(await getManuscript());
      return nodes;
    }

    if (element?.type === 'document') {
      await setActiveProjectUri(element.projectFileUri);
      const result = await getManuscriptByUri(element.projectFileUri);
      await updateViewContext(result);
      // #region agent log
      if (!result.data) {
        fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:getChildren(document)',message:'Document has no data',data:{uri:vscode.workspace.asRelativePath(element.projectFileUri)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        return [];
      }
      // #endregion
      return result.data.chapters.map((ch, i) => ({
        type: 'chapter' as const,
        chapterIndex: i,
        label: ch.title ?? `Chapter ${i + 1}`,
        data: result.data!,
      }));
    }

    const result = await getManuscript();
    await updateViewContext(result);
    // #region agent log
    if (!element && result.data) {
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:getChildren(root)',message:'Tree root data',data:{projectFileRelative:result.projectFileUri?vscode.workspace.asRelativePath(result.projectFileUri):null,chaptersCount:result.data.chapters.length,sceneCounts:result.data.chapters.map(c=>c.sceneUris.length)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    }
    // #endregion
    if (!result.data && !element) {
      return [];
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
        const ch = element.data.chapters[element.chapterIndex];
        return ch.sceneUris.map((uri, i) => {
          const scenePath = ch.scenePaths[i] ?? path.relative(
            element.data.projectFileUri ? path.dirname(element.data.projectFileUri.fsPath) : '',
            uri.fsPath
          );
          const pathKey = scenePath.split(path.sep).join('/');
          const status = element.data.sceneStatus?.[pathKey];
          return {
            type: 'scene' as const,
            chapterIndex: element.chapterIndex,
            sceneIndex: i,
            uri,
            label: path.basename(uri.fsPath),
            status,
            data: element.data,
          };
        });
      }
      return [];
    }
    if (!result.data) {
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
      chapterIndex: n.type !== 'root' && n.type !== 'document' ? n.chapterIndex : -1,
      sceneIndex: n.type === 'scene' ? n.sceneIndex : -1,
      projectFileUri: n.type === 'chapter' || n.type === 'scene' ? n.data.projectFileUri?.toString() : undefined,
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
    let payload: { type: string; chapterIndex: number; sceneIndex: number; projectFileUri?: string }[];
    try {
      payload = JSON.parse(item.value as string);
    } catch {
      return;
    }
    if (payload.length === 0) return;
    const source = payload[0];

    const targetProjectUri =
      !target
        ? null
        : target.type === 'document'
          ? target.projectFileUri
          : target.type === 'chapter' || target.type === 'scene'
            ? target.data.projectFileUri
            : null;

    let result: ManuscriptResult;
    if (targetProjectUri) {
      result = await getManuscriptByUri(targetProjectUri);
    } else {
      result = await getManuscript();
    }
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

    if (source.projectFileUri && result.projectFileUri && source.projectFileUri !== result.projectFileUri.toString()) {
      return;
    }

    if (source.type === 'chapter') {
      const fromIdx = source.chapterIndex;
      let toIdx: number;
      if (!target || target.type === 'document') toIdx = result.data.chapters.length - 1;
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
      if (!target || target.type === 'document') {
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
    clearManuscriptCache(result.projectFileUri);
    this.refresh();
  }
}

async function updateViewContext(result: ManuscriptResult): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'noveltools.hasProjectFile', !!result.projectFileUri);
  await vscode.commands.executeCommand('setContext', 'noveltools.hasScenes', result.flatUris.length > 0);
  const allIndex = await findAllIndexYaml();
  await vscode.commands.executeCommand('setContext', 'noveltools.hasMultipleDocuments', allIndex.length > 1);
}

async function openQuickStart(context: vscode.ExtensionContext): Promise<void> {
  const readmeUri = vscode.Uri.joinPath(context.extensionUri, 'README.md');
  try {
    const doc = await vscode.workspace.openTextDocument(readmeUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    return;
  } catch {
    // Fall back to an in-memory quick start guide.
  }
  const doc = await vscode.workspace.openTextDocument({
    content: QUICK_START_FALLBACK,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

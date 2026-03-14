import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectFile, getStitchedSceneHeadingMode } from '../config';
import {
  getManuscript,
  getManuscriptByUri,
  clearManuscriptCache,
  findAllProjectFiles,
  setActiveProjectUri,
  type ManuscriptResult,
} from './sceneList';
import {
  moveScene as moveSceneInData,
  reorderChapters,
  removeScene as removeSceneInData,
  removeChapter as removeChapterInData,
} from './projectData';
import { buildProjectToFile, writeProject } from './projectFile';
import type { ManuscriptData, SceneStatus, SceneMetadataEntry } from './projectData';
import { buildSceneHeadingLine, buildSceneHeadingText } from './sceneHeading';

const VIEW_ID = 'noveltools.manuscript';
const MIME_TREE = `application/vnd.code.tree.${VIEW_ID}`;
const QUICK_START_FALLBACK = `# NovelTools Quick Start

1. Create a project file
   - Run "NovelTools: Build Project File" to create \`noveltools.json\` from your scene files.

2. Use the Manuscript view
   - Drag chapters and scenes to reorder. Changes are written back to the project file.

3. Read the stitched manuscript
   - Run "NovelTools: Open Stitched Manuscript" to view the whole draft at once.

Tips
- Settings live under "NovelTools" in VS Code Settings.
- Word counts are optional toggles.
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

function formatSceneCount(count: number): string {
  return `${count} ${count === 1 ? 'scene' : 'scenes'}`;
}

function formatChapterCount(count: number): string {
  return `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
}

function normalizePathForCompare(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}

function isConfiguredProjectFile(uri: vscode.Uri): boolean {
  const configured = normalizePathForCompare(getProjectFile());
  if (!configured) return false;
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return false;
  const relative = normalizePathForCompare(path.relative(folder.uri.fsPath, uri.fsPath));
  if (configured.includes('/')) return relative === configured;
  return path.posix.basename(relative) === configured;
}

function isIndexLikeFileName(name: string): boolean {
  return /index\.(json|md)$/i.test(name) || /manuscript\.json$/i.test(name);
}

function getConfiguredProjectUri(): vscode.Uri | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return null;
  const configured = getProjectFile().trim();
  if (!configured) return null;
  const segments = configured.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return null;
  return vscode.Uri.joinPath(folder.uri, ...segments);
}

function getTreeItemLabel(node: TreeNode): string {
  switch (node.type) {
    case 'root':
      return node.label;
    case 'document':
      return node.label;
    case 'chapter':
      return node.label;
    case 'scene':
      return node.label;
  }
}

/** TreeItem.label can be string or TreeItemLabel; normalize to string for comparisons. */
function treeItemLabelString(label: string | vscode.TreeItemLabel | undefined): string | undefined {
  if (label === undefined) return undefined;
  if (typeof label === 'string') return label;
  return label && typeof label === 'object' && 'label' in label ? (label as vscode.TreeItemLabel).label : undefined;
}

function isCaseOnlyFileRename(fromUri: vscode.Uri, toUri: vscode.Uri): boolean {
  return (
    fromUri.scheme === 'file' &&
    toUri.scheme === 'file' &&
    fromUri.fsPath !== toUri.fsPath &&
    fromUri.fsPath.toLowerCase() === toUri.fsPath.toLowerCase()
  );
}

async function renameFileOnDisk(fromUri: vscode.Uri, toUri: vscode.Uri): Promise<void> {
  if (fromUri.toString() === toUri.toString()) return;
  if (!isCaseOnlyFileRename(fromUri, toUri)) {
    await vscode.workspace.fs.rename(fromUri, toUri, { overwrite: false });
    return;
  }
  const tempName = `.noveltools-rename-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(toUri.fsPath)}`;
  const tempUri = vscode.Uri.joinPath(fromUri, '..', tempName);
  await vscode.workspace.fs.rename(fromUri, tempUri, { overwrite: false });
  try {
    await vscode.workspace.fs.rename(tempUri, toUri, { overwrite: false });
  } catch (err) {
    try {
      await vscode.workspace.fs.rename(tempUri, fromUri, { overwrite: false });
    } catch {
      // Best-effort rollback only.
    }
    throw err;
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
    if (e.selection.length !== 1) return;
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
    vscode.commands.registerCommand('noveltools.refreshManuscript', async () => {
      clearManuscriptCache();
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openSidebar', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.noveltools');
      await vscode.commands.executeCommand('workbench.action.focusSideBar');
      try {
        await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      } catch {
        // Older hosts might not expose per-view focus commands.
      }
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
      await buildProjectToFile(targetUri, result.data);
      clearManuscriptCache();
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.openProjectYaml', async () => {
      try {
      // #region agent log
      console.log('[NovelTools] openProjectYaml command started');
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'Command started',data:{workspaceFolders:!!vscode.workspace.workspaceFolders?.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      const openAndFocus = async (uri: vscode.Uri): Promise<void> => {
        // #region agent log
        fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openAndFocus',message:'Opening file',data:{uri:uri.fsPath,uriScheme:uri.scheme},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          // #region agent log
          fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openAndFocus',message:'Document opened',data:{uri:uri.fsPath,fileName:doc.fileName},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          await vscode.window.showTextDocument(doc, { preview: false });
          // #region agent log
          fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openAndFocus',message:'Document shown',data:{uri:uri.fsPath},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          await setActiveProjectUri(uri);
          clearManuscriptCache(uri);
          treeDataProvider.refresh();
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openAndFocus',message:'Error opening file',data:{uri:uri.fsPath,error:String(error),errorMessage:error instanceof Error ? error.message : 'unknown'},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          throw error;
        }
      };

      const folders = vscode.workspace.workspaceFolders;
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'Checking workspace folders',data:{hasFolders:!!folders?.length,folderCount:folders?.length ?? 0},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      // Show file picker to let user select a project file.
      // Only pass defaultUri for local (file:) workspaces so the native dialog can open;
      // remote schemes or no folder can prevent the picker from showing on some platforms.
      const firstFolder = folders?.[0];
      const defaultUri =
        firstFolder?.uri.scheme === 'file'
          ? vscode.Uri.file(firstFolder.uri.fsPath)
          : undefined;
      // #region agent log
      console.log('[NovelTools] Before showOpenDialog, defaultUri:', defaultUri?.fsPath ?? 'undefined');
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'Before showOpenDialog',data:{defaultUri:defaultUri?.fsPath,workspaceRoot:firstFolder?.uri.fsPath,projectFileConfig:getProjectFile()},timestamp:Date.now(),hypothesisId:'H3,H5'})}).catch(()=>{});
      // #endregion
      
      // #region agent log
      console.log('[NovelTools] Calling showOpenDialog');
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'Calling showOpenDialog',data:{},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      const dialogOptions: vscode.OpenDialogOptions = {
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Open Project File',
        filters: {
          'Project (JSON)': ['json'],
          'All files': ['*']
        },
        title: 'Select Project File (e.g. noveltools.json)'
      };
      if (defaultUri !== undefined) {
        dialogOptions.defaultUri = defaultUri;
      }
      const selectedUri = await vscode.window.showOpenDialog(dialogOptions);

      // #region agent log
      console.log('[NovelTools] After showOpenDialog, selectedUri:', selectedUri?.map(u => u.fsPath), 'length:', selectedUri?.length);
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'After showOpenDialog',data:{selectedUri:selectedUri?.map(u => u.fsPath),selectedUriLength:selectedUri?.length,selectedUriIsUndefined:selectedUri === undefined,selectedUriIsNull:selectedUri === null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      if (selectedUri && selectedUri.length > 0) {
        const uri = selectedUri[0];
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          const text = new TextDecoder('utf8').decode(bytes);
          const firstThree = text.split(/\r?\n/).slice(0, 3);
          const preview =
            firstThree.length > 0
              ? firstThree.join('\n').trimEnd()
              : '(empty file)';
          await vscode.window.showInformationMessage(
            'Preview — first 3 lines',
            { modal: true, detail: preview },
            'OK'
          );
        } catch {
          // If we can't read (e.g. remote file), skip preview and open
        }
        await openAndFocus(uri);
        return;
      }

      // If user cancelled, check if there's an existing project file and offer to open it
      // #region agent log
      console.log('[NovelTools] User cancelled file picker, checking for existing project file');
      // #endregion
      const result = await getManuscript();
      // #region agent log
      console.log('[NovelTools] After getManuscript, hasProjectFileUri:', !!result.projectFileUri, 'uri:', result.projectFileUri?.fsPath);
      fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'After getManuscript',data:{hasProjectFileUri:!!result.projectFileUri,projectFileUri:result.projectFileUri?.fsPath,hasData:!!result.data},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      if (result.projectFileUri) {
        const choice = await vscode.window.showInformationMessage(
          `Found existing project file: ${vscode.workspace.asRelativePath(result.projectFileUri)}. Open it?`,
          'Open',
          'Cancel'
        );
        if (choice === 'Open') {
          await openAndFocus(result.projectFileUri);
        }
        return;
      }

      // No project file found - offer to create one
      const configuredUri = getConfiguredProjectUri();
      if (configuredUri) {
        const rel = vscode.workspace.asRelativePath(configuredUri);
        const choice = await vscode.window.showInformationMessage(
          `No project file found. Create ${rel}?`,
          'Create and Open',
          'Build Project File',
          'Cancel'
        );
        if (choice === 'Create and Open') {
          const parent = vscode.Uri.joinPath(configuredUri, '..');
          await vscode.workspace.fs.createDirectory(parent);
          const isJson = configuredUri.fsPath.toLowerCase().endsWith('.json');
          const starter = isJson ? '{\n  "title": "",\n  "chapters": []\n}\n' : 'title: ""\nchapters: []\n';
          await vscode.workspace.fs.writeFile(configuredUri, Buffer.from(starter, 'utf8'));
          await openAndFocus(configuredUri);
          return;
        }
        if (choice === 'Build Project File') {
          await vscode.commands.executeCommand('noveltools.buildProjectYaml');
        }
      }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7247/ingest/c8aa33f8-be9b-4123-bf84-25f3a3583c8f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manuscriptView.ts:openProjectYaml',message:'Command error',data:{error:String(error),errorMessage:error instanceof Error ? error.message : 'unknown',errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),hypothesisId:'H1,H2,H3'})}).catch(()=>{});
        // #endregion
        await vscode.window.showErrorMessage(`Failed to open project file: ${error instanceof Error ? error.message : String(error)}`);
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
    vscode.commands.registerCommand('noveltools.openStitchedSelection', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      const selectionFromTree = treeView.selection as TreeNode[];
      const sceneNodes = selectionFromTree.filter((n): n is SceneNode => n.type === 'scene');

      let selectedUris = sceneNodes.map((n) => n.uri);
      if (selectedUris.length === 0) {
        const item = nodeOrItem as vscode.TreeItem | undefined;
        const itemUri = item && typeof item === 'object' && 'resourceUri' in item
          ? item.resourceUri
          : undefined;
        if (itemUri) selectedUris = [itemUri];
      }
      if (selectedUris.length === 0) {
        await vscode.window.showInformationMessage(
          'Select one or more scenes in the Manuscript sidebar (Shift+Click), then run "Open Stitched Selection".'
        );
        return;
      }

      const result = await getManuscript();
      if (!result.data) {
        await vscode.window.showInformationMessage('No manuscript loaded.');
        return;
      }

      const selectedSet = new Set(selectedUris.map((u) => u.toString()));
      const lines: string[] = [];
      let stitchedCount = 0;
      let currentChapterIndex = -1;
      const headingMode = getStitchedSceneHeadingMode();

      lines.push('# Stitched Selection', '');
      lines.push(`> ${selectedSet.size} selected ${selectedSet.size === 1 ? 'scene' : 'scenes'}, ordered by project file.`, '');

      for (let chapterIndex = 0; chapterIndex < result.data.chapters.length; chapterIndex++) {
        const chapter = result.data.chapters[chapterIndex];
        for (let sceneIndex = 0; sceneIndex < chapter.sceneUris.length; sceneIndex++) {
          const uri = chapter.sceneUris[sceneIndex];
          if (!selectedSet.has(uri.toString())) continue;

          if (currentChapterIndex !== chapterIndex) {
            const chapterLabel = chapter.title ?? `Chapter ${chapterIndex + 1}`;
            lines.push(`## ${chapterLabel}`, '');
            currentChapterIndex = chapterIndex;
          }

          const sceneHeading = buildSceneHeadingText(uri, sceneIndex, headingMode);
          lines.push(buildSceneHeadingLine(chapterIndex, sceneIndex, sceneHeading));
          lines.push(`*Source:* \`${vscode.workspace.asRelativePath(uri)}\``, '');
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            lines.push(doc.getText().trimEnd(), '');
          } catch {
            lines.push(`> [!warning] Could not read \`${vscode.workspace.asRelativePath(uri)}\`.`, '');
          }
          lines.push('---', '');
          stitchedCount++;
        }
      }

      if (stitchedCount === 0) {
        await vscode.window.showInformationMessage('None of the selected scenes were found in the current manuscript order.');
        return;
      }

      lines[2] = `> ${stitchedCount} stitched ${stitchedCount === 1 ? 'scene' : 'scenes'}, ordered by project file.`;
      const doc = await vscode.workspace.openTextDocument({
        content: lines.join('\n').trimEnd(),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.renameChapter', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      let selection = (nodeOrItem ?? treeView.selection[0]) as TreeNode | undefined;
      if (selection?.type !== 'chapter') {
        const item = nodeOrItem ?? treeView.selection[0];
        const rawLabel = item && typeof item === 'object' && 'label' in item ? (item as vscode.TreeItem).label : undefined;
        const labelStr = treeItemLabelString(rawLabel);
        if (labelStr !== undefined && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'chapter') {
          const allIndex = await findAllProjectFiles();
          const sources = allIndex.length > 1 ? allIndex : null;
          if (sources) {
            for (const projectUri of sources) {
              const result = await getManuscriptByUri(projectUri);
              if (!result.data?.projectFileUri) continue;
              const chapterIndex = result.data.chapters.findIndex(
                (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === labelStr
              );
              if (chapterIndex >= 0) {
                selection = {
                  type: 'chapter',
                  chapterIndex,
                  label: labelStr,
                  data: result.data,
                };
                break;
              }
            }
          } else {
            const result = await getManuscript();
            if (result.data?.projectFileUri) {
              const chapterIndex = result.data.chapters.findIndex(
                (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === labelStr
              );
              if (chapterIndex >= 0) {
                selection = {
                  type: 'chapter',
                  chapterIndex,
                  label: labelStr,
                  data: result.data,
                };
              }
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
        prompt: 'Enter the chapter name for the manuscript.',
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
      await writeProject(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.renameScene', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      const selection = await resolveSceneSelection(nodeOrItem);
      if (!selection) {
        await vscode.window.showInformationMessage('Select a scene in the Manuscript view to rename it.');
        return;
      }

      const currentName = path.basename(selection.uri.fsPath);
      const currentExt = path.extname(currentName);
      const rawName = await vscode.window.showInputBox({
        title: 'Rename Scene File',
        value: currentName,
        prompt: 'Enter a new filename for this scene.',
        validateInput: (value) => {
          const name = value.trim();
          if (!name) return 'Filename cannot be empty.';
          if (name === '.' || name === '..') return 'Enter a valid filename.';
          if (/[\\/]/.test(name)) return 'Enter a filename only (no path).';
          if (/[<>:"|?*]/.test(name)) return 'Filename contains invalid characters.';
          return undefined;
        },
      });
      if (rawName === undefined) return;

      const entered = rawName.trim();
      const nextName = path.extname(entered) ? entered : `${entered}${currentExt || ''}`;
      if (nextName === currentName) return;

      const oldUri = selection.uri;
      const newUri = vscode.Uri.joinPath(oldUri, '..', nextName);
      const sameTarget = oldUri.toString() === newUri.toString();
      if (sameTarget) return;

      try {
        await vscode.workspace.fs.stat(newUri);
        if (!isCaseOnlyFileRename(oldUri, newUri)) {
          await vscode.window.showErrorMessage(`A file named "${nextName}" already exists in this folder.`);
          return;
        }
      } catch {
        // Target path does not exist.
      }

      try {
        await renameFileOnDisk(oldUri, newUri);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Could not rename scene file: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      const data = selection.data;
      if (data.projectFileUri) {
        const chapters = data.chapters.map((ch) => ({
          ...ch,
          sceneUris: [...ch.sceneUris],
          scenePaths: [...ch.scenePaths],
        }));
        const chapter = chapters[selection.chapterIndex];
        if (!chapter || selection.sceneIndex < 0 || selection.sceneIndex >= chapter.sceneUris.length) {
          await vscode.window.showWarningMessage('Renamed file, but could not update manuscript metadata. Refresh the view.');
          clearManuscriptCache(data.projectFileUri);
          treeDataProvider.refresh();
          return;
        }

        const oldScenePath = (
          chapter.scenePaths[selection.sceneIndex] ??
          path.relative(path.dirname(data.projectFileUri.fsPath), oldUri.fsPath)
        )
          .split(path.sep)
          .join('/');
        const newScenePath = path
          .relative(path.dirname(data.projectFileUri.fsPath), newUri.fsPath)
          .split(path.sep)
          .join('/');

        chapter.sceneUris[selection.sceneIndex] = newUri;
        chapter.scenePaths[selection.sceneIndex] = newScenePath;

        let sceneStatus = data.sceneStatus;
        if (sceneStatus && oldScenePath in sceneStatus) {
          const nextStatus = { ...sceneStatus };
          nextStatus[newScenePath] = nextStatus[oldScenePath];
          if (oldScenePath !== newScenePath) delete nextStatus[oldScenePath];
          sceneStatus = Object.keys(nextStatus).length > 0 ? nextStatus : undefined;
        }

        const updated: ManuscriptData = {
          ...data,
          chapters,
          flatUris: chapters.flatMap((ch) => ch.sceneUris),
          sceneStatus,
        };

        try {
          await writeProject(data.projectFileUri, updated);
        } catch (err) {
          try {
            await renameFileOnDisk(newUri, oldUri);
          } catch (rollbackErr) {
            await vscode.window.showErrorMessage(
              `Scene file was renamed, but project file update failed and rollback also failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
            );
            clearManuscriptCache(data.projectFileUri);
            treeDataProvider.refresh();
            return;
          }
          await vscode.window.showErrorMessage(
            `Could not update project file after renaming. The file rename was reverted: ${err instanceof Error ? err.message : String(err)}`
          );
          clearManuscriptCache(data.projectFileUri);
          treeDataProvider.refresh();
          return;
        }
        clearManuscriptCache(data.projectFileUri);
      } else {
        clearManuscriptCache();
      }

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
      await writeProject(data.projectFileUri, updated);
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
      await writeProject(data.projectFileUri, updated);
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
        const rawLabel = item && typeof item === 'object' && 'label' in item ? (item as vscode.TreeItem).label : undefined;
        const labelStr = treeItemLabelString(rawLabel);
        if (labelStr !== undefined && item && typeof item === 'object' && (item as vscode.TreeItem).contextValue === 'chapter') {
          const allIndex = await findAllProjectFiles();
          const sources = allIndex.length > 1 ? allIndex : null;
          if (sources) {
            for (const projectUri of sources) {
              const result = await getManuscriptByUri(projectUri);
              if (!result.data?.projectFileUri) continue;
              const chapterIndex = result.data.chapters.findIndex(
                (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === labelStr
              );
              if (chapterIndex >= 0) {
                selection = {
                  type: 'chapter',
                  chapterIndex,
                  label: labelStr,
                  data: result.data,
                };
                break;
              }
            }
          } else {
            const result = await getManuscript();
            if (result.data?.projectFileUri) {
              const chapterIndex = result.data.chapters.findIndex(
                (ch, i) => (ch.title ?? `Chapter ${i + 1}`) === labelStr
              );
              if (chapterIndex >= 0) {
                selection = {
                  type: 'chapter',
                  chapterIndex,
                  label: labelStr,
                  data: result.data,
                };
              }
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
      await writeProject(data.projectFileUri, updated);
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
    if (!result.data) return undefined;
    for (let ci = 0; ci < result.data.chapters.length; ci++) {
      const ch = result.data.chapters[ci];
      const si = ch.sceneUris.findIndex((u) => u.toString() === uri.toString());
      if (si >= 0) {
        const scenePath = ch.scenePaths[si] ?? (
          result.data.projectFileUri
            ? path.relative(path.dirname(result.data.projectFileUri.fsPath), uri.fsPath)
            : path.basename(uri.fsPath)
        );
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
      await vscode.window.showInformationMessage('Section status is saved in the project file. Open or create a project file first.');
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
    await writeProject(data.projectFileUri, updated);
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
    vscode.commands.registerCommand('noveltools.setSceneSynopsis', async (nodeOrItem?: TreeNode | vscode.TreeItem) => {
      const selection = await resolveSceneSelection(nodeOrItem);
      if (!selection) {
        await vscode.window.showInformationMessage('Select a scene in the Manuscript view to set its synopsis.');
        return;
      }
      const data = selection.data;
      if (!data.projectFileUri) {
        await vscode.window.showInformationMessage('Synopsis is saved in the project file. Open or create a project file first.');
        return;
      }
      const ch = data.chapters[selection.chapterIndex];
      const scenePath = ch.scenePaths[selection.sceneIndex] ?? path.relative(path.dirname(data.projectFileUri.fsPath), selection.uri.fsPath);
      const pathKey = scenePath.split(path.sep).join('/');
      const existing = data.sceneMetadata?.[pathKey]?.synopsis ?? '';
      const synopsis = await vscode.window.showInputBox({
        title: 'Set Synopsis',
        prompt: `One-line synopsis for "${selection.label}"`,
        value: existing,
        placeHolder: 'A brief description of this scene...',
      });
      if (synopsis === undefined) return;
      const sceneMetadata = { ...data.sceneMetadata };
      if (synopsis.trim() === '') {
        if (sceneMetadata[pathKey]) {
          const entry = { ...sceneMetadata[pathKey] };
          delete entry.synopsis;
          if (Object.keys(entry).length === 0) {
            delete sceneMetadata[pathKey];
          } else {
            sceneMetadata[pathKey] = entry;
          }
        }
      } else {
        sceneMetadata[pathKey] = { ...sceneMetadata[pathKey], synopsis: synopsis.trim() };
      }
      const updated: ManuscriptData = {
        ...data,
        sceneMetadata: Object.keys(sceneMetadata).length ? sceneMetadata : undefined,
      };
      await writeProject(data.projectFileUri, updated);
      clearManuscriptCache(data.projectFileUri);
      treeDataProvider.refresh();
    })
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
        await vscode.window.showInformationMessage('Section status is saved in the project file. Open or create a project file first.');
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
      const allIndex = await findAllProjectFiles();
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
      if (isConfiguredProjectFile(doc.uri) || isIndexLikeFileName(name)) {
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
    if (element.type === 'root') {
      const chapterCount = element.data?.chapters.length ?? 0;
      const sceneCount = element.data?.flatUris.length ?? 0;
      if (element.data) {
        item.iconPath = new vscode.ThemeIcon('book');
        item.description = `${formatChapterCount(chapterCount)} · ${formatSceneCount(sceneCount)}`;
        item.tooltip = `${element.label}\n${chapterCount} chapters, ${sceneCount} scenes`;
      } else {
        item.iconPath = new vscode.ThemeIcon('warning');
        item.description = 'No parsed manuscript';
        item.tooltip = element.label;
        item.command = {
          command: 'noveltools.openProjectYaml',
          title: 'Open Project File',
        };
      }
    }
    if (element.type === 'document') {
      const rel = vscode.workspace.asRelativePath(element.projectFileUri);
      item.iconPath = new vscode.ThemeIcon('library');
      item.description = rel;
      const tooltip = new vscode.MarkdownString(undefined, true);
      tooltip.appendMarkdown(`**${element.label}**\n\n`);
      tooltip.appendCodeblock(rel);
      item.tooltip = tooltip;
    }
    if (element.type === 'chapter') {
      const chapter = element.data.chapters[element.chapterIndex];
      const sceneCount = chapter?.sceneUris.length ?? 0;
      item.iconPath = new vscode.ThemeIcon('book');
      item.description = formatSceneCount(sceneCount);
      item.tooltip = `${element.label}\n${formatSceneCount(sceneCount)}`;
    }
    if (element.type === 'scene') {
      const rel = vscode.workspace.asRelativePath(element.uri);
      const scenePath = element.data.chapters[element.chapterIndex]?.scenePaths[element.sceneIndex];
      const pathKey = scenePath?.split(path.sep).join('/');
      const synopsis = pathKey ? element.data.sceneMetadata?.[pathKey]?.synopsis : undefined;
      if (synopsis) {
        item.description = synopsis;
      }
      const tooltip = new vscode.MarkdownString(undefined, true);
      tooltip.appendMarkdown(`${element.label}\n\n`);
      if (synopsis) tooltip.appendMarkdown(`*${synopsis}*\n\n`);
      tooltip.appendCodeblock(rel);
      item.tooltip = tooltip;
    }
    item.contextValue = element.type;
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    try {
      const allIndex = await findAllProjectFiles();
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
        if (result.projectFileUri) {
          const rel = vscode.workspace.asRelativePath(result.projectFileUri);
          return [{
            type: 'root',
            label: `Could not parse ${rel}. Fix the project file and refresh.`,
            data: null,
          }];
        }
        return [{
          type: 'root',
          label: 'No manuscript found. Build Project File to get started.',
          data: null,
        }];
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
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[NovelTools] Manuscript tree load failed:', err);
      return [{
        type: 'root',
        label: `Manuscript view failed to load (${detail.slice(0, 120)}). Click to open project file.`,
        data: null,
      }];
    }
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
      await buildProjectToFile(targetUri, result.data);
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
      await writeProject(result.projectFileUri, next);
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
      await writeProject(result.projectFileUri, next);
    }
    clearManuscriptCache(result.projectFileUri);
    this.refresh();
  }
}

async function updateViewContext(result: ManuscriptResult): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'noveltools.hasProjectFile', !!result.projectFileUri);
  await vscode.commands.executeCommand('setContext', 'noveltools.hasScenes', result.flatUris.length > 0);
  const allIndex = await findAllProjectFiles();
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

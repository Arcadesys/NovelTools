import * as path from 'path';
import * as vscode from 'vscode';
import { getManuscript, clearManuscriptCache } from './sceneList';
import type { ManuscriptData, SceneStatus, SceneMetadataEntry } from './projectData';

const STATUS_ICONS: Record<SceneStatus, { icon: string; color: string }> = {
  drafted: { icon: 'pencil', color: 'charts.yellow' },
  revision: { icon: 'edit', color: 'charts.blue' },
  review: { icon: 'eye', color: 'charts.orange' },
  done: { icon: 'pass-filled', color: 'charts.green' },
  spiked: { icon: 'circle-slash', color: 'charts.red' },
  cut: { icon: 'close', color: 'descriptionForeground' },
};

interface OutlineSceneItem {
  kind: 'scene';
  scenePath: string;
  sceneUri: vscode.Uri;
  chapterTitle: string;
  chapterIndex: number;
  sceneIndex: number;
  status?: SceneStatus;
  metadata: SceneMetadataEntry;
}

interface OutlineChapterItem {
  kind: 'chapter';
  title: string;
  chapterIndex: number;
  sceneCount: number;
}

type OutlineItem = OutlineSceneItem | OutlineChapterItem;

class OutlineTreeProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private filterPov: string | undefined;
  private filterSetting: string | undefined;
  private filterTag: string | undefined;
  private sortBy: 'manuscript' | 'timeline' | 'pov' | 'status' = 'manuscript';

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFilter(key: 'pov' | 'setting' | 'tag', value: string | undefined): void {
    if (key === 'pov') this.filterPov = value;
    else if (key === 'setting') this.filterSetting = value;
    else if (key === 'tag') this.filterTag = value;
    this.refresh();
  }

  clearFilters(): void {
    this.filterPov = undefined;
    this.filterSetting = undefined;
    this.filterTag = undefined;
    this.refresh();
  }

  setSortBy(sort: 'manuscript' | 'timeline' | 'pov' | 'status'): void {
    this.sortBy = sort;
    this.refresh();
  }

  async getChildren(element?: OutlineItem): Promise<OutlineItem[]> {
    const result = await getManuscript();
    if (!result?.data) return [];
    const data = result.data;

    if (!element) {
      if (this.sortBy === 'manuscript') {
        return data.chapters.map((ch, ci) => ({
          kind: 'chapter' as const,
          title: ch.title ?? `Chapter ${ci + 1}`,
          chapterIndex: ci,
          sceneCount: ch.scenePaths.length,
        }));
      }
      return this.getFlatScenes(data);
    }

    if (element.kind === 'chapter') {
      const ch = data.chapters[element.chapterIndex];
      if (!ch) return [];
      return ch.scenePaths
        .map((sp, si) => this.buildSceneItem(data, sp, ch.sceneUris[si], element.title, element.chapterIndex, si))
        .filter((item): item is OutlineSceneItem => item !== null);
    }

    return [];
  }

  private buildSceneItem(
    data: ManuscriptData, scenePath: string, sceneUri: vscode.Uri,
    chapterTitle: string, chapterIndex: number, sceneIndex: number
  ): OutlineSceneItem | null {
    const status = data.sceneStatus?.[scenePath];
    const metadata = data.sceneMetadata?.[scenePath] ?? {};
    if (this.filterPov && metadata.pov?.toLowerCase() !== this.filterPov.toLowerCase()) return null;
    if (this.filterSetting && metadata.setting?.toLowerCase() !== this.filterSetting.toLowerCase()) return null;
    if (this.filterTag && !(metadata.tags ?? []).some((t) => t.toLowerCase() === this.filterTag!.toLowerCase())) return null;
    return { kind: 'scene', scenePath, sceneUri, chapterTitle, chapterIndex, sceneIndex, status, metadata };
  }

  private getFlatScenes(data: ManuscriptData): OutlineSceneItem[] {
    const scenes: OutlineSceneItem[] = [];
    for (let ci = 0; ci < data.chapters.length; ci++) {
      const ch = data.chapters[ci];
      const title = ch.title ?? `Chapter ${ci + 1}`;
      for (let si = 0; si < ch.scenePaths.length; si++) {
        const item = this.buildSceneItem(data, ch.scenePaths[si], ch.sceneUris[si], title, ci, si);
        if (item) scenes.push(item);
      }
    }
    if (this.sortBy === 'timeline') {
      scenes.sort((a, b) => (a.metadata.timeline ?? '').localeCompare(b.metadata.timeline ?? ''));
    } else if (this.sortBy === 'pov') {
      scenes.sort((a, b) => (a.metadata.pov ?? '').localeCompare(b.metadata.pov ?? ''));
    } else if (this.sortBy === 'status') {
      const order: Record<string, number> = { drafted: 0, revision: 1, review: 2, done: 3, spiked: 4, cut: 5 };
      scenes.sort((a, b) => (order[a.status ?? ''] ?? 99) - (order[b.status ?? ''] ?? 99));
    }
    return scenes;
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    if (element.kind === 'chapter') {
      const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${element.sceneCount} scene${element.sceneCount !== 1 ? 's' : ''}`;
      item.iconPath = new vscode.ThemeIcon('book');
      item.contextValue = 'outlineChapter';
      return item;
    }

    const scene = element;
    const title = path.basename(scene.scenePath, '.md').replace(/[-_]/g, ' ');
    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
    const descParts: string[] = [];
    if (scene.metadata.pov) descParts.push(scene.metadata.pov);
    if (scene.metadata.setting) descParts.push(`@ ${scene.metadata.setting}`);
    if (scene.metadata.timeline) descParts.push(`⏱ ${scene.metadata.timeline}`);
    item.description = descParts.join(' · ') || scene.metadata.synopsis || '';
    item.tooltip = this.buildTooltip(scene);

    if (scene.status && STATUS_ICONS[scene.status]) {
      const si = STATUS_ICONS[scene.status];
      item.iconPath = new vscode.ThemeIcon(si.icon, new vscode.ThemeColor(si.color));
    } else {
      item.iconPath = new vscode.ThemeIcon('file');
    }

    item.command = {
      command: 'vscode.open',
      title: 'Open Scene',
      arguments: [scene.sceneUri],
    };
    item.contextValue = 'outlineScene';
    return item;
  }

  private buildTooltip(scene: OutlineSceneItem): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    const title = path.basename(scene.scenePath, '.md').replace(/[-_]/g, ' ');
    md.appendMarkdown(`**${title}**\n\n`);
    if (scene.metadata.synopsis) md.appendMarkdown(`*${scene.metadata.synopsis}*\n\n`);
    if (scene.status) md.appendMarkdown(`Status: ${scene.status}\n\n`);
    if (scene.metadata.pov) md.appendMarkdown(`POV: ${scene.metadata.pov}\n\n`);
    if (scene.metadata.setting) md.appendMarkdown(`Setting: ${scene.metadata.setting}\n\n`);
    if (scene.metadata.timeline) md.appendMarkdown(`Timeline: ${scene.metadata.timeline}\n\n`);
    if (scene.metadata.tags?.length) md.appendMarkdown(`Tags: ${scene.metadata.tags.join(', ')}\n\n`);
    md.appendMarkdown(`*${scene.chapterTitle}* · Scene ${scene.sceneIndex + 1}`);
    return md;
  }
}

export function registerOutlineView(context: vscode.ExtensionContext): void {
  const provider = new OutlineTreeProvider();
  const treeView = vscode.window.createTreeView('noveltools.outline', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.refreshOutline', () => provider.refresh()),

    vscode.commands.registerCommand('noveltools.outlineFilterByPov', async () => {
      const result = await getManuscript();
      if (!result?.data) return;
      const povs = new Set<string>();
      for (const meta of Object.values(result.data.sceneMetadata ?? {})) {
        if (meta.pov) povs.add(meta.pov);
      }
      if (povs.size === 0) { vscode.window.showInformationMessage('No POV characters set on any scene.'); return; }
      const items = [{ label: '$(clear-all) Show All', pov: undefined as string | undefined }, ...Array.from(povs).sort().map((p) => ({ label: p, pov: p }))];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Filter by POV character' });
      if (picked !== undefined) provider.setFilter('pov', picked.pov);
    }),

    vscode.commands.registerCommand('noveltools.outlineFilterBySetting', async () => {
      const result = await getManuscript();
      if (!result?.data) return;
      const settings = new Set<string>();
      for (const meta of Object.values(result.data.sceneMetadata ?? {})) {
        if (meta.setting) settings.add(meta.setting);
      }
      if (settings.size === 0) { vscode.window.showInformationMessage('No settings defined on any scene.'); return; }
      const items = [{ label: '$(clear-all) Show All', setting: undefined as string | undefined }, ...Array.from(settings).sort().map((s) => ({ label: s, setting: s }))];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Filter by setting' });
      if (picked !== undefined) provider.setFilter('setting', picked.setting);
    }),

    vscode.commands.registerCommand('noveltools.outlineFilterByTag', async () => {
      const result = await getManuscript();
      if (!result?.data) return;
      const allTags = new Set<string>();
      for (const meta of Object.values(result.data.sceneMetadata ?? {})) {
        for (const t of meta.tags ?? []) allTags.add(t);
      }
      if (allTags.size === 0) { vscode.window.showInformationMessage('No tags set on any scene.'); return; }
      const items = [{ label: '$(clear-all) Show All', tag: undefined as string | undefined }, ...Array.from(allTags).sort().map((t) => ({ label: t, tag: t }))];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Filter by tag' });
      if (picked !== undefined) provider.setFilter('tag', picked.tag);
    }),

    vscode.commands.registerCommand('noveltools.outlineClearFilters', () => provider.clearFilters()),

    vscode.commands.registerCommand('noveltools.outlineSortBy', async () => {
      const options: { label: string; sort: 'manuscript' | 'timeline' | 'pov' | 'status' }[] = [
        { label: 'Manuscript Order', sort: 'manuscript' },
        { label: 'Timeline', sort: 'timeline' },
        { label: 'POV Character', sort: 'pov' },
        { label: 'Status', sort: 'status' },
      ];
      const picked = await vscode.window.showQuickPick(options, { placeHolder: 'Sort scenes by…' });
      if (picked) provider.setSortBy(picked.sort);
    }),

    vscode.commands.registerCommand('noveltools.outlineEditMetadata', (item: OutlineSceneItem) => {
      if (item?.scenePath) void vscode.commands.executeCommand('noveltools.editSceneMetadata', item.scenePath);
    })
  );

  // Auto-refresh when manuscript changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/{noveltools.json,*.noveltools.json}');
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(() => provider.refresh()),
    watcher.onDidCreate(() => provider.refresh()),
    watcher.onDidDelete(() => provider.refresh())
  );
}

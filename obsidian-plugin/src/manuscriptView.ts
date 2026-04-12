import {
  ItemView,
  Menu,
  Notice,
  WorkspaceLeaf,
  TFile,
} from 'obsidian';
import type NovelToolsPlugin from './main';
import type { ManuscriptData, SceneStatus } from './types';

export const VIEW_TYPE_MANUSCRIPT = 'noveltools-manuscript';

const STATUS_ICON: Record<SceneStatus, string> = {
  drafted: '🟡',
  revision: '🔵',
  review: '🟠',
  done: '🟢',
  spiked: '🔴',
  cut: '⚫',
};

export class ManuscriptView extends ItemView {
  plugin: NovelToolsPlugin;
  private data: ManuscriptData | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: NovelToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MANUSCRIPT;
  }

  getDisplayText(): string {
    return 'NovelTools Manuscript';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {
    // nothing to clean up
  }

  async refresh(): Promise<void> {
    this.data = await this.plugin.getManuscript();
    this.render();
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('noveltools-manuscript-view');

    if (!this.data || this.data.flatPaths.length === 0) {
      this.renderEmpty(container);
      return;
    }

    if (this.data.title) {
      container.createEl('div', {
        cls: 'noveltools-title',
        text: this.data.title,
      });
    }

    for (let ci = 0; ci < this.data.chapters.length; ci++) {
      this.renderChapter(container, ci);
    }

    // Footer actions
    const footer = container.createEl('div', { cls: 'noveltools-footer' });

    const compileBtn = footer.createEl('button', {
      cls: 'noveltools-btn',
      text: '📄 Compile',
    });
    compileBtn.addEventListener('click', () =>
      void this.plugin.compileManuscript()
    );

    const refreshBtn = footer.createEl('button', {
      cls: 'noveltools-btn',
      text: '🔄 Refresh',
    });
    refreshBtn.addEventListener('click', () => {
      this.plugin.clearCache();
      void this.refresh();
    });
  }

  private renderEmpty(container: HTMLElement): void {
    const el = container.createEl('div', { cls: 'noveltools-empty' });
    el.createEl('p', { text: 'No manuscript found.' });
    el.createEl('p', {
      text: 'Create a noveltools.json project file to get started.',
    });

    const newBtn = el.createEl('button', {
      cls: 'noveltools-btn',
      text: '+ New Project',
    });
    newBtn.addEventListener('click', () => void this.plugin.newProject());

    const buildBtn = el.createEl('button', {
      cls: 'noveltools-btn',
      text: '🔍 Build from Files',
    });
    buildBtn.addEventListener('click', () => void this.plugin.buildProject());
  }

  private renderChapter(container: HTMLElement, ci: number): void {
    const data = this.data!;
    const chapter = data.chapters[ci];

    const chapterEl = container.createEl('div', { cls: 'noveltools-chapter' });

    const headerEl = chapterEl.createEl('div', {
      cls: 'noveltools-chapter-header',
    });
    const toggleEl = headerEl.createEl('span', {
      cls: 'noveltools-chapter-toggle',
      text: '▼',
    });
    headerEl.createEl('span', {
      cls: 'noveltools-chapter-title',
      text: chapter.title ?? `Chapter ${ci + 1}`,
    });
    headerEl.createEl('span', {
      cls: 'noveltools-scene-count',
      text: `${chapter.scenePaths.length} scenes`,
    });

    // Chapter context menu
    headerEl.addEventListener('contextmenu', (e) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('Move Chapter Up')
          .setIcon('arrow-up')
          .onClick(() => void this.moveChapter(ci, -1))
      );
      menu.addItem((item) =>
        item
          .setTitle('Move Chapter Down')
          .setIcon('arrow-down')
          .onClick(() => void this.moveChapter(ci, 1))
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle('Add Scene')
          .setIcon('plus')
          .onClick(() => void this.addScene(ci))
      );
      menu.addItem((item) =>
        item
          .setTitle('Remove Chapter')
          .setIcon('trash')
          .onClick(() => void this.removeChapter(ci))
      );
      menu.showAtMouseEvent(e);
    });

    const scenesEl = chapterEl.createEl('div', { cls: 'noveltools-scenes' });

    // Toggle collapse on arrow click
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = scenesEl.hasClass('collapsed');
      scenesEl.toggleClass('collapsed', !collapsed);
      toggleEl.setText(collapsed ? '▼' : '▶');
    });

    for (let si = 0; si < chapter.scenePaths.length; si++) {
      this.renderScene(scenesEl, ci, si);
    }
  }

  private renderScene(
    container: HTMLElement,
    ci: number,
    si: number
  ): void {
    const data = this.data!;
    const chapter = data.chapters[ci];
    const scenePath = chapter.scenePaths[si];
    const status = data.sceneStatus?.[scenePath];
    const meta = data.sceneMetadata?.[scenePath];

    const fileName =
      scenePath.split('/').pop()?.replace(/\.md$/i, '') ?? scenePath;
    const displayName = fileName.replace(/[_-]+/g, ' ');

    const sceneEl = container.createEl('div', {
      cls: `noveltools-scene${status ? ` noveltools-status-${status}` : ''}`,
    });

    sceneEl.createEl('span', {
      cls: 'noveltools-status-icon',
      text: status ? STATUS_ICON[status] : '○',
    });

    sceneEl.createEl('span', {
      cls: 'noveltools-scene-name',
      text: displayName,
    });

    if (meta?.synopsis) {
      sceneEl.setAttr('title', meta.synopsis);
    }

    sceneEl.addEventListener('click', () => {
      void this.plugin.openFile(scenePath);
    });

    sceneEl.addEventListener('contextmenu', (e) => {
      const menu = new Menu();

      menu.addItem((item) =>
        item
          .setTitle('Open Scene')
          .setIcon('file-text')
          .onClick(() => void this.plugin.openFile(scenePath))
      );
      menu.addSeparator();

      // Status sub-items (inline, since Obsidian menus don't nest)
      const statusOptions: Array<{ value: SceneStatus | null; label: string }> = [
        { value: null, label: '○ Clear status' },
        { value: 'drafted', label: '🟡 Drafted' },
        { value: 'revision', label: '🔵 Revision' },
        { value: 'review', label: '🟠 Review' },
        { value: 'done', label: '🟢 Done' },
        { value: 'spiked', label: '🔴 Spiked' },
        { value: 'cut', label: '⚫ Cut' },
      ];
      for (const opt of statusOptions) {
        menu.addItem((item) =>
          item
            .setTitle(opt.label)
            .setChecked(status === opt.value)
            .onClick(() =>
              void this.plugin.setSceneStatusDirect(scenePath, opt.value)
            )
        );
      }

      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle('Move Scene Up')
          .setIcon('arrow-up')
          .onClick(() => void this.moveScene(ci, si, -1))
      );
      menu.addItem((item) =>
        item
          .setTitle('Move Scene Down')
          .setIcon('arrow-down')
          .onClick(() => void this.moveScene(ci, si, 1))
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle('Remove from Manuscript')
          .setIcon('x')
          .onClick(() => void this.removeScene(ci, si))
      );

      menu.showAtMouseEvent(e);
    });
  }

  // -------------------------------------------------------------------------
  // Mutation actions
  // -------------------------------------------------------------------------

  async moveChapter(ci: number, delta: number): Promise<void> {
    const data = this.data;
    if (!data || !data.projectFilePath) return;
    const newCi = ci + delta;
    if (newCi < 0 || newCi >= data.chapters.length) {
      new Notice('Cannot move chapter further.');
      return;
    }
    const chapters = [...data.chapters];
    [chapters[ci], chapters[newCi]] = [chapters[newCi], chapters[ci]];
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }

  async removeChapter(ci: number): Promise<void> {
    const data = this.data;
    if (!data || !data.projectFilePath) return;
    const chapters = data.chapters.filter((_, i) => i !== ci);
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }

  async addScene(ci: number): Promise<void> {
    const data = this.data;
    if (!data || !data.projectFilePath) return;

    const chapter = data.chapters[ci];
    const suggestedFolder = chapter.folderPath ?? '';

    // Prompt the user for a vault-relative path
    const onSubmit = async (rawPath: string): Promise<void> => {
      let scenePath = rawPath.trim();
      if (!scenePath) return;
      if (!scenePath.endsWith('.md')) scenePath += '.md';

      // Prefix with chapter folder if user gave a bare filename
      if (!scenePath.includes('/') && suggestedFolder) {
        scenePath = suggestedFolder + '/' + scenePath;
      }

      // Create the file if it doesn't exist
      const existing = this.plugin.app.vault.getAbstractFileByPath(scenePath);
      if (!existing) {
        try {
          // Ensure parent folder exists
          const parts = scenePath.split('/');
          if (parts.length > 1) {
            const dir = parts.slice(0, -1).join('/');
            if (!this.plugin.app.vault.getAbstractFileByPath(dir)) {
              await this.plugin.app.vault.createFolder(dir);
            }
          }
          await this.plugin.app.vault.create(scenePath, '');
        } catch (err) {
          new Notice(
            `Failed to create file: ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }

      const chapters = data.chapters.map((c) => ({
        ...c,
        scenePaths: [...c.scenePaths],
      }));
      chapters[ci].scenePaths.push(scenePath);
      const flatPaths = chapters.flatMap((c) => c.scenePaths);
      await this.plugin.writeProject({ ...data, chapters, flatPaths });
    };

    const modal = new (
      require('obsidian') as typeof import('obsidian')
    ).Modal(this.app);
    const { contentEl } = modal;
    contentEl.createEl('h2', { text: 'Add Scene' });
    contentEl.createEl('p', {
      text: 'Enter a vault-relative path for the new scene (e.g. chapter-01/scene-03.md).',
      cls: 'setting-item-description',
    });

    const input = contentEl.createEl('input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder = suggestedFolder
      ? suggestedFolder + '/scene.md'
      : 'chapter-01/scene.md';
    input.addClass('noveltools-modal-input');
    input.focus();

    const actions = contentEl.createEl('div', {
      cls: 'noveltools-modal-actions',
    });

    const cancelBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => modal.close());

    const okBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn mod-cta',
      text: 'Add',
    });
    okBtn.addEventListener('click', async () => {
      modal.close();
      await onSubmit(input.value);
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        modal.close();
        await onSubmit(input.value);
      }
      if (e.key === 'Escape') modal.close();
    });

    modal.open();
  }

  async moveScene(ci: number, si: number, delta: number): Promise<void> {
    const data = this.data;
    if (!data || !data.projectFilePath) return;
    const chapter = data.chapters[ci];
    const newSi = si + delta;
    if (newSi < 0 || newSi >= chapter.scenePaths.length) {
      new Notice('Cannot move scene further.');
      return;
    }
    const chapters = data.chapters.map((c) => ({
      ...c,
      scenePaths: [...c.scenePaths],
    }));
    const scenePaths = chapters[ci].scenePaths;
    [scenePaths[si], scenePaths[newSi]] = [scenePaths[newSi], scenePaths[si]];
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }

  async removeScene(ci: number, si: number): Promise<void> {
    const data = this.data;
    if (!data || !data.projectFilePath) return;
    const chapters = data.chapters.map((c) => ({
      ...c,
      scenePaths: [...c.scenePaths],
    }));
    chapters[ci].scenePaths.splice(si, 1);
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }
}

import {
  App,
  Modal,
  Notice,
  Plugin,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
} from 'obsidian';
import { ManuscriptView, VIEW_TYPE_MANUSCRIPT } from './manuscriptView';
import { NovelToolsSettingTab } from './settings';
import {
  ManuscriptData,
  NovelToolsSettings,
  DEFAULT_SETTINGS,
  ChapterData,
  SceneStatus,
} from './types';
import { parseProjectJson, serializeToJson } from './projectData';

export default class NovelToolsPlugin extends Plugin {
  settings: NovelToolsSettings = { ...DEFAULT_SETTINGS };
  private _manuscriptCache: ManuscriptData | null = null;
  wordCountEl!: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register manuscript sidebar view
    this.registerView(
      VIEW_TYPE_MANUSCRIPT,
      (leaf: WorkspaceLeaf) => new ManuscriptView(leaf, this)
    );

    // Ribbon icon
    this.addRibbonIcon('book-open', 'Open NovelTools Manuscript', () =>
      void this.activateManuscriptView()
    );

    // Status bar word count
    this.wordCountEl = this.addStatusBarItem();
    this.wordCountEl.addClass('noveltools-word-count');
    void this.updateWordCount();

    // Vault / workspace events
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () =>
        void this.updateWordCount()
      )
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile)) return;
        if (file.path === normalizePath(this.settings.projectFile)) {
          this.clearCache();
          void this.refreshManuscriptView();
        } else if (file.extension === 'md') {
          void this.updateWordCount();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('create', () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );

    // Commands
    this.addCommand({
      id: 'open-manuscript-view',
      name: 'Open Manuscript View',
      callback: () => void this.activateManuscriptView(),
    });
    this.addCommand({
      id: 'next-scene',
      name: 'Next Scene',
      callback: () => void this.navigateScene(1),
    });
    this.addCommand({
      id: 'previous-scene',
      name: 'Previous Scene',
      callback: () => void this.navigateScene(-1),
    });
    this.addCommand({
      id: 'next-chapter',
      name: 'Next Chapter',
      callback: () => void this.navigateChapter(1),
    });
    this.addCommand({
      id: 'previous-chapter',
      name: 'Previous Chapter',
      callback: () => void this.navigateChapter(-1),
    });
    this.addCommand({
      id: 'new-project',
      name: 'New Project',
      callback: () => void this.newProject(),
    });
    this.addCommand({
      id: 'build-project',
      name: 'Build Project from Vault Files',
      callback: () => void this.buildProject(),
    });
    this.addCommand({
      id: 'compile-manuscript',
      name: 'Compile Manuscript',
      callback: () => void this.compileManuscript(),
    });
    this.addCommand({
      id: 'set-scene-status',
      name: 'Set Scene Status…',
      editorCallback: (_editor, ctx) =>
        void this.setActiveSceneStatus(ctx.file),
    });
    this.addCommand({
      id: 'move-scene-up',
      name: 'Move Scene Up',
      editorCallback: (_editor, ctx) =>
        void this.moveActiveScene(-1, ctx.file),
    });
    this.addCommand({
      id: 'move-scene-down',
      name: 'Move Scene Down',
      editorCallback: (_editor, ctx) =>
        void this.moveActiveScene(1, ctx.file),
    });
    this.addCommand({
      id: 'refresh-manuscript',
      name: 'Refresh Manuscript View',
      callback: () => {
        this.clearCache();
        void this.refreshManuscriptView();
      },
    });

    // Settings tab
    this.addSettingTab(new NovelToolsSettingTab(this.app, this));

    // Initialise leaf
    if (this.app.workspace.layoutReady) {
      void this.initLeaf();
    } else {
      this.app.workspace.onLayoutReady(() => void this.initLeaf());
    }
  }

  async onunload(): Promise<void> {
    // nothing to dispose
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    ) as NovelToolsSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  clearCache(): void {
    this._manuscriptCache = null;
  }

  // ---------------------------------------------------------------------------
  // Manuscript data
  // ---------------------------------------------------------------------------

  async getManuscript(): Promise<ManuscriptData | null> {
    if (this._manuscriptCache) return this._manuscriptCache;

    const projectPath = normalizePath(this.settings.projectFile);
    const projectFile = this.app.vault.getAbstractFileByPath(projectPath);

    if (projectFile instanceof TFile) {
      const content = await this.app.vault.read(projectFile);
      let data = parseProjectJson(content, projectFile.path);
      if (data) {
        data = await this.resolveChapterFolders(data);
        this._manuscriptCache = data;
        return data;
      }
    }

    return null;
  }

  async resolveChapterFolders(data: ManuscriptData): Promise<ManuscriptData> {
    const chapters: ChapterData[] = [];
    for (const ch of data.chapters) {
      if (ch.folderPath && ch.scenePaths.length === 0) {
        const folderAbs = this.app.vault.getAbstractFileByPath(
          normalizePath(ch.folderPath)
        );
        if (folderAbs instanceof TFolder) {
          const mdFiles = folderAbs.children
            .filter(
              (f): f is TFile =>
                f instanceof TFile && f.extension === 'md'
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          chapters.push({ ...ch, scenePaths: mdFiles.map((f) => f.path) });
        } else {
          chapters.push(ch);
        }
      } else {
        chapters.push(ch);
      }
    }
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    return { ...data, chapters, flatPaths };
  }

  async writeProject(data: ManuscriptData): Promise<void> {
    if (!data.projectFilePath) return;
    const json = serializeToJson(data);
    const projectPath = normalizePath(data.projectFilePath);
    const file = this.app.vault.getAbstractFileByPath(projectPath);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, json);
    } else {
      await this.app.vault.create(projectPath, json);
    }
    this.clearCache();
    await this.refreshManuscriptView();
  }

  // ---------------------------------------------------------------------------
  // View management
  // ---------------------------------------------------------------------------

  async activateManuscriptView(): Promise<void> {
    const existing =
      this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_MANUSCRIPT, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async initLeaf(): Promise<void> {
    // Don't auto-open on startup — user must trigger via ribbon/command
  }

  async refreshManuscriptView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT);
    for (const leaf of leaves) {
      if (leaf.view instanceof ManuscriptView) {
        await leaf.view.refresh();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Word count
  // ---------------------------------------------------------------------------

  async updateWordCount(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      this.wordCountEl.setText('');
      return;
    }
    const content = await this.app.vault.read(file);
    const count = countWords(content, this.settings.wordCountStripMarkdown);
    this.wordCountEl.setText(`📖 ${count.toLocaleString()} words`);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigateScene(delta: number): Promise<void> {
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new Notice('No manuscript scenes found.');
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const idx = data.flatPaths.indexOf(activeFile.path);
    if (idx < 0) {
      new Notice('Current file is not in the manuscript.');
      return;
    }
    const nextIdx =
      (idx + delta + data.flatPaths.length) % data.flatPaths.length;
    await this.openFile(data.flatPaths[nextIdx]);
  }

  async navigateChapter(delta: number): Promise<void> {
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new Notice('No manuscript found.');
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    let currentChapterIdx = -1;
    for (let ci = 0; ci < data.chapters.length; ci++) {
      if (data.chapters[ci].scenePaths.includes(activeFile.path)) {
        currentChapterIdx = ci;
        break;
      }
    }
    if (currentChapterIdx < 0) {
      new Notice('Current file is not in the manuscript.');
      return;
    }

    const nextChapterIdx =
      (currentChapterIdx + delta + data.chapters.length) %
      data.chapters.length;
    const nextChapter = data.chapters[nextChapterIdx];
    if (nextChapter.scenePaths.length > 0) {
      await this.openFile(nextChapter.scenePaths[0]);
    }
  }

  async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (leaf) await leaf.openFile(file);
    }
  }

  // ---------------------------------------------------------------------------
  // Project management
  // ---------------------------------------------------------------------------

  async newProject(): Promise<void> {
    const modal = new InputModal(this.app, {
      title: 'New NovelTools Project',
      description: 'Enter a title for your novel.',
      placeholder: 'My Novel',
      defaultValue: '',
      submitLabel: 'Create',
      onSubmit: async (value: string) => {
        const projectTitle = value.trim() || 'My Novel';
        const projectPath = normalizePath(this.settings.projectFile);
        const data: ManuscriptData = {
          title: projectTitle,
          chapters: [],
          flatPaths: [],
          projectFilePath: projectPath,
        };
        const json = serializeToJson(data);
        const existing = this.app.vault.getAbstractFileByPath(projectPath);
        if (existing instanceof TFile) {
          const overwrite = await confirmModal(
            this.app,
            `${projectPath} already exists. Overwrite?`
          );
          if (!overwrite) return;
          await this.app.vault.modify(existing, json);
        } else {
          const parts = projectPath.split('/');
          if (parts.length > 1) {
            const dir = parts.slice(0, -1).join('/');
            if (!this.app.vault.getAbstractFileByPath(dir)) {
              await this.app.vault.createFolder(dir);
            }
          }
          await this.app.vault.create(projectPath, json);
        }
        this.clearCache();
        await this.refreshManuscriptView();
        new Notice(`Created project: ${projectPath}`);
      },
    });
    modal.open();
  }

  async buildProject(): Promise<void> {
    const mdFiles = this.app.vault
      .getMarkdownFiles()
      .filter(
        (f) =>
          !f.path.startsWith('.') &&
          f.path !== normalizePath(this.settings.projectFile)
      )
      .sort((a, b) => a.path.localeCompare(b.path));

    if (mdFiles.length === 0) {
      new Notice('No markdown files found in vault.');
      return;
    }

    let chapters: ChapterData[];

    if (this.settings.chapterGrouping === 'folder') {
      const folderMap = new Map<string, string[]>();
      const folderOrder: string[] = [];
      for (const file of mdFiles) {
        const folderPath = file.parent?.path ?? '';
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
          folderOrder.push(folderPath);
        }
        folderMap.get(folderPath)!.push(file.path);
      }
      chapters = folderOrder.map((fp) => ({
        title: fp === '' ? 'Root' : fp.split('/').pop() ?? fp,
        scenePaths: folderMap.get(fp)!,
        folderPath: fp || undefined,
      }));
    } else {
      chapters = [
        { title: undefined, scenePaths: mdFiles.map((f) => f.path) },
      ];
    }

    const projectPath = normalizePath(this.settings.projectFile);
    const data: ManuscriptData = {
      title: undefined,
      chapters,
      flatPaths: mdFiles.map((f) => f.path),
      projectFilePath: projectPath,
    };
    await this.writeProject(data);
    new Notice(`Built project file: ${projectPath}`);
  }

  async compileManuscript(): Promise<void> {
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new Notice('No manuscript found. Create a project file first.');
      return;
    }

    const parts: string[] = [];
    if (data.title) parts.push(`# ${data.title}\n`);

    for (let ci = 0; ci < data.chapters.length; ci++) {
      const chapter = data.chapters[ci];
      if (chapter.title) parts.push(`\n## ${chapter.title}\n`);

      for (let si = 0; si < chapter.scenePaths.length; si++) {
        const scenePath = chapter.scenePaths[si];
        const status = data.sceneStatus?.[scenePath];
        if (status === 'spiked' || status === 'cut') continue;

        const file = this.app.vault.getAbstractFileByPath(scenePath);
        if (!(file instanceof TFile)) continue;

        const headingMode = this.settings.stitchedSceneHeadingMode;
        if (headingMode !== 'none') {
          const stem = file.basename;
          const headingText =
            headingMode === 'sceneNumber'
              ? `Scene ${si + 1}`
              : stem.replace(/[_-]+/g, ' ').trim();
          parts.push(`\n### ${ci + 1}.${si + 1} ${headingText}\n`);
        }

        const content = await this.app.vault.read(file);
        parts.push('\n' + content.trim() + '\n');
      }
    }

    const compiled = parts.join('\n');
    const compiledPath = normalizePath('.noveltools/compiled-manuscript.md');
    const dir = '.noveltools';

    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    const existingFile = this.app.vault.getAbstractFileByPath(compiledPath);
    let compiledFile: TFile;
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, compiled);
      compiledFile = existingFile;
    } else {
      compiledFile = await this.app.vault.create(compiledPath, compiled);
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(compiledFile);
    new Notice('Manuscript compiled successfully.');
  }

  // ---------------------------------------------------------------------------
  // Scene status
  // ---------------------------------------------------------------------------

  async setActiveSceneStatus(file: TFile | null): Promise<void> {
    if (!file || file.extension !== 'md') {
      new Notice('Open a scene file first.');
      return;
    }
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath) {
      new Notice('No project file found. Create one first.');
      return;
    }

    const STATUS_OPTIONS: Array<{ value: SceneStatus | null; label: string }> =
      [
        { value: null, label: '○ Clear status' },
        { value: 'drafted', label: '🟡 Drafted' },
        { value: 'revision', label: '🔵 Revision' },
        { value: 'review', label: '🟠 Review' },
        { value: 'done', label: '🟢 Done' },
        { value: 'spiked', label: '🔴 Spiked' },
        { value: 'cut', label: '⚫ Cut' },
      ];

    const modal = new StatusPickerModal(
      this.app,
      STATUS_OPTIONS,
      async (status) => {
        await this.setSceneStatusDirect(file.path, status);
        new Notice(`Status set: ${status ?? 'cleared'}`);
      }
    );
    modal.open();
  }

  async setSceneStatusDirect(
    filePath: string,
    status: SceneStatus | null
  ): Promise<void> {
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath) return;
    const sceneStatus = { ...(data.sceneStatus ?? {}) };
    if (status === null) {
      delete sceneStatus[filePath];
    } else {
      sceneStatus[filePath] = status;
    }
    await this.writeProject({ ...data, sceneStatus });
  }

  async moveActiveScene(delta: number, file: TFile | null): Promise<void> {
    if (!file) return;
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath) return;

    for (let ci = 0; ci < data.chapters.length; ci++) {
      const ch = data.chapters[ci];
      const si = ch.scenePaths.indexOf(file.path);
      if (si < 0) continue;

      const newSi = si + delta;
      if (newSi < 0 || newSi >= ch.scenePaths.length) {
        new Notice('Cannot move scene further.');
        return;
      }
      const chapters = data.chapters.map((c) => ({
        ...c,
        scenePaths: [...c.scenePaths],
      }));
      const scenePaths = chapters[ci].scenePaths;
      [scenePaths[si], scenePaths[newSi]] = [
        scenePaths[newSi],
        scenePaths[si],
      ];
      const flatPaths = chapters.flatMap((c) => c.scenePaths);
      await this.writeProject({ ...data, chapters, flatPaths });
      return;
    }
    new Notice('Current file is not in the manuscript.');
  }
}

// ---------------------------------------------------------------------------
// Word count helper
// ---------------------------------------------------------------------------

function countWords(text: string, stripMarkdown: boolean): number {
  let t = text;
  if (stripMarkdown) {
    t = t.replace(/^#{1,6}\s+/gm, '');
    t = t.replace(/\*\*?([^*]+)\*\*?/g, '$1');
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    t = t.replace(/`[^`]+`/g, '');
    t = t.replace(/```[\s\S]*?```/g, '');
  }
  const words = t.match(/\S+/g);
  return words ? words.length : 0;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

interface InputModalOptions {
  title: string;
  description?: string;
  placeholder: string;
  defaultValue: string;
  submitLabel?: string;
  onSubmit: (value: string) => Promise<void>;
}

class InputModal extends Modal {
  private options: InputModalOptions;

  constructor(app: App, options: InputModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.options.title });
    if (this.options.description) {
      contentEl.createEl('p', {
        text: this.options.description,
        cls: 'setting-item-description',
      });
    }

    const input = contentEl.createEl('input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder = this.options.placeholder;
    input.value = this.options.defaultValue;
    input.addClass('noveltools-modal-input');
    input.focus();

    const actions = contentEl.createEl('div', {
      cls: 'noveltools-modal-actions',
    });
    const cancelBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn mod-cta',
      text: this.options.submitLabel ?? 'OK',
    });

    const submit = async (): Promise<void> => {
      this.close();
      await this.options.onSubmit(input.value);
    };

    submitBtn.addEventListener('click', () => void submit());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void submit();
      if (e.key === 'Escape') this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  private message: string;
  private resolve: (value: boolean) => void;

  constructor(
    app: App,
    message: string,
    resolve: (value: boolean) => void
  ) {
    super(app);
    this.message = message;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('p', { text: this.message });

    const actions = contentEl.createEl('div', {
      cls: 'noveltools-modal-actions',
    });

    const noBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn',
      text: 'Cancel',
    });
    noBtn.addEventListener('click', () => {
      this.resolve(false);
      this.close();
    });

    const yesBtn = actions.createEl('button', {
      cls: 'noveltools-modal-btn mod-cta',
      text: 'OK',
    });
    yesBtn.addEventListener('click', () => {
      this.resolve(true);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function confirmModal(app: App, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, message, resolve).open();
  });
}

class StatusPickerModal extends Modal {
  private options: Array<{ value: SceneStatus | null; label: string }>;
  private onSelect: (status: SceneStatus | null) => Promise<void>;

  constructor(
    app: App,
    options: Array<{ value: SceneStatus | null; label: string }>,
    onSelect: (status: SceneStatus | null) => Promise<void>
  ) {
    super(app);
    this.options = options;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Set Scene Status' });
    const list = contentEl.createEl('div', { cls: 'noveltools-status-list' });

    for (const opt of this.options) {
      const btn = list.createEl('button', {
        cls: 'noveltools-status-item',
        text: opt.label,
      });
      btn.addEventListener('click', () => {
        this.close();
        void this.onSelect(opt.value);
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

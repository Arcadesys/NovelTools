var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NovelToolsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/manuscriptView.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE_MANUSCRIPT = "noveltools-manuscript";
var STATUS_ICON = {
  drafted: "\u{1F7E1}",
  revision: "\u{1F535}",
  review: "\u{1F7E0}",
  done: "\u{1F7E2}",
  spiked: "\u{1F534}",
  cut: "\u26AB"
};
var ManuscriptView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.data = null;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_MANUSCRIPT;
  }
  getDisplayText() {
    return "NovelTools Manuscript";
  }
  getIcon() {
    return "book-open";
  }
  async onOpen() {
    await this.refresh();
  }
  async onClose() {
  }
  async refresh() {
    this.data = await this.plugin.getManuscript();
    this.render();
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("noveltools-manuscript-view");
    if (!this.data || this.data.flatPaths.length === 0) {
      this.renderEmpty(container);
      return;
    }
    if (this.data.title) {
      container.createEl("div", {
        cls: "noveltools-title",
        text: this.data.title
      });
    }
    for (let ci = 0; ci < this.data.chapters.length; ci++) {
      this.renderChapter(container, ci);
    }
    const footer = container.createEl("div", { cls: "noveltools-footer" });
    const compileBtn = footer.createEl("button", {
      cls: "noveltools-btn",
      text: "\u{1F4C4} Compile"
    });
    compileBtn.addEventListener(
      "click",
      () => void this.plugin.compileManuscript()
    );
    const refreshBtn = footer.createEl("button", {
      cls: "noveltools-btn",
      text: "\u{1F504} Refresh"
    });
    refreshBtn.addEventListener("click", () => {
      this.plugin.clearCache();
      void this.refresh();
    });
  }
  renderEmpty(container) {
    const el = container.createEl("div", { cls: "noveltools-empty" });
    el.createEl("p", { text: "No manuscript found." });
    el.createEl("p", {
      text: "Create a noveltools.json project file to get started."
    });
    const newBtn = el.createEl("button", {
      cls: "noveltools-btn",
      text: "+ New Project"
    });
    newBtn.addEventListener("click", () => void this.plugin.newProject());
    const buildBtn = el.createEl("button", {
      cls: "noveltools-btn",
      text: "\u{1F50D} Build from Files"
    });
    buildBtn.addEventListener("click", () => void this.plugin.buildProject());
  }
  renderChapter(container, ci) {
    var _a;
    const data = this.data;
    const chapter = data.chapters[ci];
    const chapterEl = container.createEl("div", { cls: "noveltools-chapter" });
    const headerEl = chapterEl.createEl("div", {
      cls: "noveltools-chapter-header"
    });
    const toggleEl = headerEl.createEl("span", {
      cls: "noveltools-chapter-toggle",
      text: "\u25BC"
    });
    headerEl.createEl("span", {
      cls: "noveltools-chapter-title",
      text: (_a = chapter.title) != null ? _a : `Chapter ${ci + 1}`
    });
    headerEl.createEl("span", {
      cls: "noveltools-scene-count",
      text: `${chapter.scenePaths.length} scenes`
    });
    headerEl.addEventListener("contextmenu", (e) => {
      const menu = new import_obsidian.Menu();
      menu.addItem(
        (item) => item.setTitle("Move Chapter Up").setIcon("arrow-up").onClick(() => void this.moveChapter(ci, -1))
      );
      menu.addItem(
        (item) => item.setTitle("Move Chapter Down").setIcon("arrow-down").onClick(() => void this.moveChapter(ci, 1))
      );
      menu.addSeparator();
      menu.addItem(
        (item) => item.setTitle("Add Scene").setIcon("plus").onClick(() => void this.addScene(ci))
      );
      menu.addItem(
        (item) => item.setTitle("Remove Chapter").setIcon("trash").onClick(() => void this.removeChapter(ci))
      );
      menu.showAtMouseEvent(e);
    });
    const scenesEl = chapterEl.createEl("div", { cls: "noveltools-scenes" });
    toggleEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const collapsed = scenesEl.hasClass("collapsed");
      scenesEl.toggleClass("collapsed", !collapsed);
      toggleEl.setText(collapsed ? "\u25BC" : "\u25B6");
    });
    for (let si = 0; si < chapter.scenePaths.length; si++) {
      this.renderScene(scenesEl, ci, si);
    }
  }
  renderScene(container, ci, si) {
    var _a, _b, _c, _d;
    const data = this.data;
    const chapter = data.chapters[ci];
    const scenePath = chapter.scenePaths[si];
    const status = (_a = data.sceneStatus) == null ? void 0 : _a[scenePath];
    const meta = (_b = data.sceneMetadata) == null ? void 0 : _b[scenePath];
    const fileName = (_d = (_c = scenePath.split("/").pop()) == null ? void 0 : _c.replace(/\.md$/i, "")) != null ? _d : scenePath;
    const displayName = fileName.replace(/[_-]+/g, " ");
    const sceneEl = container.createEl("div", {
      cls: `noveltools-scene${status ? ` noveltools-status-${status}` : ""}`
    });
    sceneEl.createEl("span", {
      cls: "noveltools-status-icon",
      text: status ? STATUS_ICON[status] : "\u25CB"
    });
    sceneEl.createEl("span", {
      cls: "noveltools-scene-name",
      text: displayName
    });
    if (meta == null ? void 0 : meta.synopsis) {
      sceneEl.setAttr("title", meta.synopsis);
    }
    sceneEl.addEventListener("click", () => {
      void this.plugin.openFile(scenePath);
    });
    sceneEl.addEventListener("contextmenu", (e) => {
      const menu = new import_obsidian.Menu();
      menu.addItem(
        (item) => item.setTitle("Open Scene").setIcon("file-text").onClick(() => void this.plugin.openFile(scenePath))
      );
      menu.addSeparator();
      const statusOptions = [
        { value: null, label: "\u25CB Clear status" },
        { value: "drafted", label: "\u{1F7E1} Drafted" },
        { value: "revision", label: "\u{1F535} Revision" },
        { value: "review", label: "\u{1F7E0} Review" },
        { value: "done", label: "\u{1F7E2} Done" },
        { value: "spiked", label: "\u{1F534} Spiked" },
        { value: "cut", label: "\u26AB Cut" }
      ];
      for (const opt of statusOptions) {
        menu.addItem(
          (item) => item.setTitle(opt.label).setChecked(status === opt.value).onClick(
            () => void this.plugin.setSceneStatusDirect(scenePath, opt.value)
          )
        );
      }
      menu.addSeparator();
      menu.addItem(
        (item) => item.setTitle("Move Scene Up").setIcon("arrow-up").onClick(() => void this.moveScene(ci, si, -1))
      );
      menu.addItem(
        (item) => item.setTitle("Move Scene Down").setIcon("arrow-down").onClick(() => void this.moveScene(ci, si, 1))
      );
      menu.addSeparator();
      menu.addItem(
        (item) => item.setTitle("Remove from Manuscript").setIcon("x").onClick(() => void this.removeScene(ci, si))
      );
      menu.showAtMouseEvent(e);
    });
  }
  // -------------------------------------------------------------------------
  // Mutation actions
  // -------------------------------------------------------------------------
  async moveChapter(ci, delta) {
    const data = this.data;
    if (!data || !data.projectFilePath)
      return;
    const newCi = ci + delta;
    if (newCi < 0 || newCi >= data.chapters.length) {
      new import_obsidian.Notice("Cannot move chapter further.");
      return;
    }
    const chapters = [...data.chapters];
    [chapters[ci], chapters[newCi]] = [chapters[newCi], chapters[ci]];
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }
  async removeChapter(ci) {
    const data = this.data;
    if (!data || !data.projectFilePath)
      return;
    const chapters = data.chapters.filter((_, i) => i !== ci);
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }
  async addScene(ci) {
    var _a;
    const data = this.data;
    if (!data || !data.projectFilePath)
      return;
    const chapter = data.chapters[ci];
    const suggestedFolder = (_a = chapter.folderPath) != null ? _a : "";
    const onSubmit = async (rawPath) => {
      let scenePath = rawPath.trim();
      if (!scenePath)
        return;
      if (!scenePath.endsWith(".md"))
        scenePath += ".md";
      if (!scenePath.includes("/") && suggestedFolder) {
        scenePath = suggestedFolder + "/" + scenePath;
      }
      const existing = this.plugin.app.vault.getAbstractFileByPath(scenePath);
      if (!existing) {
        try {
          const parts = scenePath.split("/");
          if (parts.length > 1) {
            const dir = parts.slice(0, -1).join("/");
            if (!this.plugin.app.vault.getAbstractFileByPath(dir)) {
              await this.plugin.app.vault.createFolder(dir);
            }
          }
          await this.plugin.app.vault.create(scenePath, "");
        } catch (err) {
          new import_obsidian.Notice(
            `Failed to create file: ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }
      const chapters = data.chapters.map((c) => ({
        ...c,
        scenePaths: [...c.scenePaths]
      }));
      chapters[ci].scenePaths.push(scenePath);
      const flatPaths = chapters.flatMap((c) => c.scenePaths);
      await this.plugin.writeProject({ ...data, chapters, flatPaths });
    };
    const modal = new (require("obsidian")).Modal(this.app);
    const { contentEl } = modal;
    contentEl.createEl("h2", { text: "Add Scene" });
    contentEl.createEl("p", {
      text: "Enter a vault-relative path for the new scene (e.g. chapter-01/scene-03.md).",
      cls: "setting-item-description"
    });
    const input = contentEl.createEl("input");
    input.type = "text";
    input.placeholder = suggestedFolder ? suggestedFolder + "/scene.md" : "chapter-01/scene.md";
    input.addClass("noveltools-modal-input");
    input.focus();
    const actions = contentEl.createEl("div", {
      cls: "noveltools-modal-actions"
    });
    const cancelBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn",
      text: "Cancel"
    });
    cancelBtn.addEventListener("click", () => modal.close());
    const okBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn mod-cta",
      text: "Add"
    });
    okBtn.addEventListener("click", async () => {
      modal.close();
      await onSubmit(input.value);
    });
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        modal.close();
        await onSubmit(input.value);
      }
      if (e.key === "Escape")
        modal.close();
    });
    modal.open();
  }
  async moveScene(ci, si, delta) {
    const data = this.data;
    if (!data || !data.projectFilePath)
      return;
    const chapter = data.chapters[ci];
    const newSi = si + delta;
    if (newSi < 0 || newSi >= chapter.scenePaths.length) {
      new import_obsidian.Notice("Cannot move scene further.");
      return;
    }
    const chapters = data.chapters.map((c) => ({
      ...c,
      scenePaths: [...c.scenePaths]
    }));
    const scenePaths = chapters[ci].scenePaths;
    [scenePaths[si], scenePaths[newSi]] = [scenePaths[newSi], scenePaths[si]];
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }
  async removeScene(ci, si) {
    const data = this.data;
    if (!data || !data.projectFilePath)
      return;
    const chapters = data.chapters.map((c) => ({
      ...c,
      scenePaths: [...c.scenePaths]
    }));
    chapters[ci].scenePaths.splice(si, 1);
    const flatPaths = chapters.flatMap((c) => c.scenePaths);
    await this.plugin.writeProject({ ...data, chapters, flatPaths });
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var NovelToolsSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "NovelTools Settings" });
    new import_obsidian2.Setting(containerEl).setName("Project file").setDesc(
      "Path (relative to vault root) of the noveltools.json project file."
    ).addText(
      (text) => text.setPlaceholder("noveltools.json").setValue(this.plugin.settings.projectFile).onChange(async (value) => {
        this.plugin.settings.projectFile = value || "noveltools.json";
        await this.plugin.saveSettings();
        this.plugin.clearCache();
        await this.plugin.refreshManuscriptView();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Chapter grouping").setDesc(
      "When building from files (no project file), group scenes by folder or keep flat."
    ).addDropdown(
      (drop) => drop.addOption("flat", "Flat (single chapter)").addOption("folder", "By folder").setValue(this.plugin.settings.chapterGrouping).onChange(async (value) => {
        this.plugin.settings.chapterGrouping = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Strip markdown for word count").setDesc("Remove markdown syntax before counting words.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.wordCountStripMarkdown).onChange(async (value) => {
        this.plugin.settings.wordCountStripMarkdown = value;
        await this.plugin.saveSettings();
        await this.plugin.updateWordCount();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Scene heading mode").setDesc("Controls scene heading text in the compiled manuscript output.").addDropdown(
      (drop) => drop.addOption("fileName", "File name").addOption("sceneNumber", "Scene number").addOption("none", "None").setValue(this.plugin.settings.stitchedSceneHeadingMode).onChange(async (value) => {
        this.plugin.settings.stitchedSceneHeadingMode = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  projectFile: "noveltools.json",
  chapterGrouping: "flat",
  wordCountStripMarkdown: false,
  wordCountScope: "project",
  chapterContextPath: ".noveltools/chapter-context.md",
  stitchedSceneHeadingMode: "fileName"
};

// src/projectData.ts
function posixDirname(p) {
  const idx = p.lastIndexOf("/");
  if (idx <= 0)
    return idx === 0 ? "/" : ".";
  return p.slice(0, idx);
}
function posixBasename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}
function normalizeRawChapter(ch) {
  if (typeof ch === "string") {
    const folder = ch.trim();
    return folder ? { folder } : { scenes: [] };
  }
  const obj = ch;
  if (obj.folder != null && String(obj.folder).trim() !== "") {
    const folder = String(obj.folder).trim();
    const scenes = Array.isArray(obj.scenes) ? obj.scenes.map((p) => typeof p === "string" ? p : String(p)) : void 0;
    return { title: obj.title, folder, scenes };
  }
  return {
    title: obj.title,
    scenes: Array.isArray(obj.scenes) ? obj.scenes.map((p) => typeof p === "string" ? p : String(p)) : []
  };
}
function rawToManuscriptData(raw, projectFilePath) {
  var _a, _b, _c, _d;
  if (!raw || !Array.isArray(raw.chapters))
    return null;
  const baseDir = posixDirname(projectFilePath);
  const chapters = [];
  for (const rawCh of raw.chapters) {
    const ch = normalizeRawChapter(rawCh);
    if (ch.folder !== void 0) {
      const folderPath = ch.folder.replace(/\/$/, "");
      const folderName = posixBasename(folderPath) || folderPath;
      const hasCustomScenes = Array.isArray(ch.scenes) && ch.scenes.length > 0;
      if (hasCustomScenes) {
        const scenePaths = ch.scenes.map((s) => {
          const str = typeof s === "string" ? s : String(s);
          if (str.includes("/"))
            return str;
          return folderPath + "/" + str;
        });
        chapters.push({
          title: (_a = ch.title) != null ? _a : folderName,
          scenePaths,
          folderPath
        });
      } else {
        chapters.push({
          title: (_b = ch.title) != null ? _b : folderName,
          scenePaths: [],
          folderPath
        });
      }
    } else {
      const scenePaths = ((_c = ch.scenes) != null ? _c : []).map(
        (p) => typeof p === "string" ? p : String(p)
      );
      const relDirs = scenePaths.map((p) => posixDirname(p));
      const firstDir = relDirs[0];
      const allSameDir = firstDir !== void 0 && firstDir !== "." && relDirs.every((d) => d === firstDir);
      if (allSameDir && scenePaths.length > 0) {
        const folderName = posixBasename(firstDir.replace(/\/$/, "")) || firstDir;
        chapters.push({
          title: (_d = ch.title) != null ? _d : folderName,
          scenePaths,
          folderPath: firstDir
        });
      } else {
        chapters.push({ title: ch.title, scenePaths });
      }
    }
  }
  const mergedChapters = mergeConsecutiveChaptersByFolder(chapters);
  let sceneStatus;
  const rawStatus = raw.sceneStatus;
  if (rawStatus && typeof rawStatus === "object" && !Array.isArray(rawStatus)) {
    sceneStatus = {};
    for (const [k, v] of Object.entries(rawStatus)) {
      if (v === "drafted" || v === "revision" || v === "review" || v === "done" || v === "spiked" || v === "cut") {
        sceneStatus[k] = v;
      }
    }
    if (Object.keys(sceneStatus).length === 0)
      sceneStatus = void 0;
  }
  let sceneMetadata;
  const rawMeta = raw.sceneMetadata;
  if (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
    sceneMetadata = {};
    for (const [k, v] of Object.entries(rawMeta)) {
      if (v && typeof v === "object") {
        const entry = {};
        if (typeof v.synopsis === "string")
          entry.synopsis = v.synopsis;
        if (typeof v.pov === "string")
          entry.pov = v.pov;
        if (typeof v.setting === "string")
          entry.setting = v.setting;
        if (typeof v.timeline === "string")
          entry.timeline = v.timeline;
        if (Array.isArray(v.tags))
          entry.tags = v.tags.filter((t) => typeof t === "string");
        if (Object.keys(entry).length > 0)
          sceneMetadata[k] = entry;
      }
    }
    if (Object.keys(sceneMetadata).length === 0)
      sceneMetadata = void 0;
  }
  const wordCountTarget = typeof raw.wordCountTarget === "number" && raw.wordCountTarget > 0 ? raw.wordCountTarget : void 0;
  let characters;
  if (Array.isArray(raw.characters)) {
    characters = raw.characters.filter((c) => c && typeof c.name === "string" && c.name.trim()).map((c) => ({
      name: c.name.trim(),
      ...typeof c.description === "string" ? { description: c.description } : {}
    }));
    if (characters.length === 0)
      characters = void 0;
  }
  let locations;
  if (Array.isArray(raw.locations)) {
    locations = raw.locations.filter((l) => l && typeof l.name === "string" && l.name.trim()).map((l) => ({
      name: l.name.trim(),
      ...typeof l.description === "string" ? { description: l.description } : {}
    }));
    if (locations.length === 0)
      locations = void 0;
  }
  const flatPaths = mergedChapters.flatMap((c) => c.scenePaths);
  return {
    title: raw.title,
    chapters: mergedChapters,
    flatPaths,
    projectFilePath,
    sceneStatus,
    sceneMetadata,
    wordCountTarget,
    characters,
    locations
  };
}
function mergeConsecutiveChaptersByFolder(chapters) {
  var _a, _b;
  if (chapters.length <= 1)
    return chapters;
  const result = [];
  let i = 0;
  while (i < chapters.length) {
    const ch = chapters[i];
    const folder = (_a = ch.folderPath) != null ? _a : ch.scenePaths[0] ? posixDirname(ch.scenePaths[0]) : void 0;
    if (!folder || ch.scenePaths.length === 0) {
      result.push(ch);
      i++;
      continue;
    }
    const merged = {
      title: ch.title,
      scenePaths: [...ch.scenePaths],
      folderPath: folder
    };
    i++;
    while (i < chapters.length) {
      const next = chapters[i];
      const nextFolder = (_b = next.folderPath) != null ? _b : next.scenePaths[0] ? posixDirname(next.scenePaths[0]) : void 0;
      if (nextFolder !== folder || next.scenePaths.length === 0)
        break;
      merged.scenePaths.push(...next.scenePaths);
      if (merged.title == null && next.title != null)
        merged.title = next.title;
      i++;
    }
    result.push(merged);
  }
  return result;
}
function parseProjectJson(content, projectFilePath) {
  try {
    const raw = JSON.parse(content);
    return raw ? rawToManuscriptData(raw, projectFilePath) : null;
  } catch (err) {
    console.warn(
      "[NovelTools] Failed to parse project file:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
function serializeToJson(data) {
  const raw = {
    title: data.title,
    chapters: data.chapters.map((ch) => {
      if (ch.folderPath) {
        const folderPath = ch.folderPath.replace(/\/$/, "");
        const base = folderPath + "/";
        const scenesRelative = ch.scenePaths.length > 0 ? ch.scenePaths.map(
          (p) => p.startsWith(base) ? p.slice(base.length) : p
        ) : void 0;
        const folderName = posixBasename(folderPath) || folderPath;
        const titleToWrite = ch.title !== void 0 && ch.title !== folderName ? ch.title : void 0;
        if (scenesRelative && scenesRelative.length > 0) {
          return titleToWrite !== void 0 ? { folder: ch.folderPath, title: titleToWrite, scenes: scenesRelative } : { folder: ch.folderPath, scenes: scenesRelative };
        }
        return titleToWrite !== void 0 ? { title: ch.title, folder: ch.folderPath } : { folder: ch.folderPath };
      }
      return { title: ch.title, scenes: ch.scenePaths };
    })
  };
  if (data.sceneStatus && Object.keys(data.sceneStatus).length > 0) {
    raw.sceneStatus = data.sceneStatus;
  }
  if (data.sceneMetadata && Object.keys(data.sceneMetadata).length > 0) {
    raw.sceneMetadata = data.sceneMetadata;
  }
  if (data.wordCountTarget != null && data.wordCountTarget > 0) {
    raw.wordCountTarget = data.wordCountTarget;
  }
  if (data.characters && data.characters.length > 0) {
    raw.characters = data.characters;
  }
  if (data.locations && data.locations.length > 0) {
    raw.locations = data.locations;
  }
  return JSON.stringify(raw, null, 2);
}

// src/main.ts
var NovelToolsPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this._manuscriptCache = null;
  }
  async onload() {
    await this.loadSettings();
    this.registerView(
      VIEW_TYPE_MANUSCRIPT,
      (leaf) => new ManuscriptView(leaf, this)
    );
    this.addRibbonIcon(
      "book-open",
      "Open NovelTools Manuscript",
      () => void this.activateManuscriptView()
    );
    this.wordCountEl = this.addStatusBarItem();
    this.wordCountEl.addClass("noveltools-word-count");
    void this.updateWordCount();
    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        () => void this.updateWordCount()
      )
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof import_obsidian3.TFile))
          return;
        if (file.path === (0, import_obsidian3.normalizePath)(this.settings.projectFile)) {
          this.clearCache();
          void this.refreshManuscriptView();
        } else if (file.extension === "md") {
          void this.updateWordCount();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", () => {
        this.clearCache();
        void this.refreshManuscriptView();
      })
    );
    this.addCommand({
      id: "open-manuscript-view",
      name: "Open Manuscript View",
      callback: () => void this.activateManuscriptView()
    });
    this.addCommand({
      id: "next-scene",
      name: "Next Scene",
      callback: () => void this.navigateScene(1)
    });
    this.addCommand({
      id: "previous-scene",
      name: "Previous Scene",
      callback: () => void this.navigateScene(-1)
    });
    this.addCommand({
      id: "next-chapter",
      name: "Next Chapter",
      callback: () => void this.navigateChapter(1)
    });
    this.addCommand({
      id: "previous-chapter",
      name: "Previous Chapter",
      callback: () => void this.navigateChapter(-1)
    });
    this.addCommand({
      id: "new-project",
      name: "New Project",
      callback: () => void this.newProject()
    });
    this.addCommand({
      id: "build-project",
      name: "Build Project from Vault Files",
      callback: () => void this.buildProject()
    });
    this.addCommand({
      id: "compile-manuscript",
      name: "Compile Manuscript",
      callback: () => void this.compileManuscript()
    });
    this.addCommand({
      id: "set-scene-status",
      name: "Set Scene Status\u2026",
      editorCallback: (_editor, ctx) => void this.setActiveSceneStatus(ctx.file)
    });
    this.addCommand({
      id: "move-scene-up",
      name: "Move Scene Up",
      editorCallback: (_editor, ctx) => void this.moveActiveScene(-1, ctx.file)
    });
    this.addCommand({
      id: "move-scene-down",
      name: "Move Scene Down",
      editorCallback: (_editor, ctx) => void this.moveActiveScene(1, ctx.file)
    });
    this.addCommand({
      id: "refresh-manuscript",
      name: "Refresh Manuscript View",
      callback: () => {
        this.clearCache();
        void this.refreshManuscriptView();
      }
    });
    this.addSettingTab(new NovelToolsSettingTab(this.app, this));
    if (this.app.workspace.layoutReady) {
      void this.initLeaf();
    } else {
      this.app.workspace.onLayoutReady(() => void this.initLeaf());
    }
  }
  async onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  clearCache() {
    this._manuscriptCache = null;
  }
  // ---------------------------------------------------------------------------
  // Manuscript data
  // ---------------------------------------------------------------------------
  async getManuscript() {
    if (this._manuscriptCache)
      return this._manuscriptCache;
    const projectPath = (0, import_obsidian3.normalizePath)(this.settings.projectFile);
    const projectFile = this.app.vault.getAbstractFileByPath(projectPath);
    if (projectFile instanceof import_obsidian3.TFile) {
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
  async resolveChapterFolders(data) {
    const chapters = [];
    for (const ch of data.chapters) {
      if (ch.folderPath && ch.scenePaths.length === 0) {
        const folderAbs = this.app.vault.getAbstractFileByPath(
          (0, import_obsidian3.normalizePath)(ch.folderPath)
        );
        if (folderAbs instanceof import_obsidian3.TFolder) {
          const mdFiles = folderAbs.children.filter(
            (f) => f instanceof import_obsidian3.TFile && f.extension === "md"
          ).sort((a, b) => a.name.localeCompare(b.name));
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
  async writeProject(data) {
    if (!data.projectFilePath)
      return;
    const json = serializeToJson(data);
    const projectPath = (0, import_obsidian3.normalizePath)(data.projectFilePath);
    const file = this.app.vault.getAbstractFileByPath(projectPath);
    if (file instanceof import_obsidian3.TFile) {
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
  async activateManuscriptView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT);
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
  async initLeaf() {
  }
  async refreshManuscriptView() {
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
  async updateWordCount() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      this.wordCountEl.setText("");
      return;
    }
    const content = await this.app.vault.read(file);
    const count = countWords(content, this.settings.wordCountStripMarkdown);
    this.wordCountEl.setText(`\u{1F4D6} ${count.toLocaleString()} words`);
  }
  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  async navigateScene(delta) {
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new import_obsidian3.Notice("No manuscript scenes found.");
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile)
      return;
    const idx = data.flatPaths.indexOf(activeFile.path);
    if (idx < 0) {
      new import_obsidian3.Notice("Current file is not in the manuscript.");
      return;
    }
    const nextIdx = (idx + delta + data.flatPaths.length) % data.flatPaths.length;
    await this.openFile(data.flatPaths[nextIdx]);
  }
  async navigateChapter(delta) {
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new import_obsidian3.Notice("No manuscript found.");
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile)
      return;
    let currentChapterIdx = -1;
    for (let ci = 0; ci < data.chapters.length; ci++) {
      if (data.chapters[ci].scenePaths.includes(activeFile.path)) {
        currentChapterIdx = ci;
        break;
      }
    }
    if (currentChapterIdx < 0) {
      new import_obsidian3.Notice("Current file is not in the manuscript.");
      return;
    }
    const nextChapterIdx = (currentChapterIdx + delta + data.chapters.length) % data.chapters.length;
    const nextChapter = data.chapters[nextChapterIdx];
    if (nextChapter.scenePaths.length > 0) {
      await this.openFile(nextChapter.scenePaths[0]);
    }
  }
  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian3.TFile) {
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (leaf)
        await leaf.openFile(file);
    }
  }
  // ---------------------------------------------------------------------------
  // Project management
  // ---------------------------------------------------------------------------
  async newProject() {
    const modal = new InputModal(this.app, {
      title: "New NovelTools Project",
      description: "Enter a title for your novel.",
      placeholder: "My Novel",
      defaultValue: "",
      submitLabel: "Create",
      onSubmit: async (value) => {
        const projectTitle = value.trim() || "My Novel";
        const projectPath = (0, import_obsidian3.normalizePath)(this.settings.projectFile);
        const data = {
          title: projectTitle,
          chapters: [],
          flatPaths: [],
          projectFilePath: projectPath
        };
        const json = serializeToJson(data);
        const existing = this.app.vault.getAbstractFileByPath(projectPath);
        if (existing instanceof import_obsidian3.TFile) {
          const overwrite = await confirmModal(
            this.app,
            `${projectPath} already exists. Overwrite?`
          );
          if (!overwrite)
            return;
          await this.app.vault.modify(existing, json);
        } else {
          const parts = projectPath.split("/");
          if (parts.length > 1) {
            const dir = parts.slice(0, -1).join("/");
            if (!this.app.vault.getAbstractFileByPath(dir)) {
              await this.app.vault.createFolder(dir);
            }
          }
          await this.app.vault.create(projectPath, json);
        }
        this.clearCache();
        await this.refreshManuscriptView();
        new import_obsidian3.Notice(`Created project: ${projectPath}`);
      }
    });
    modal.open();
  }
  async buildProject() {
    var _a, _b;
    const mdFiles = this.app.vault.getMarkdownFiles().filter(
      (f) => !f.path.startsWith(".") && f.path !== (0, import_obsidian3.normalizePath)(this.settings.projectFile)
    ).sort((a, b) => a.path.localeCompare(b.path));
    if (mdFiles.length === 0) {
      new import_obsidian3.Notice("No markdown files found in vault.");
      return;
    }
    let chapters;
    if (this.settings.chapterGrouping === "folder") {
      const folderMap = /* @__PURE__ */ new Map();
      const folderOrder = [];
      for (const file of mdFiles) {
        const folderPath = (_b = (_a = file.parent) == null ? void 0 : _a.path) != null ? _b : "";
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
          folderOrder.push(folderPath);
        }
        folderMap.get(folderPath).push(file.path);
      }
      chapters = folderOrder.map((fp) => {
        var _a2;
        return {
          title: fp === "" ? "Root" : (_a2 = fp.split("/").pop()) != null ? _a2 : fp,
          scenePaths: folderMap.get(fp),
          folderPath: fp || void 0
        };
      });
    } else {
      chapters = [
        { title: void 0, scenePaths: mdFiles.map((f) => f.path) }
      ];
    }
    const projectPath = (0, import_obsidian3.normalizePath)(this.settings.projectFile);
    const data = {
      title: void 0,
      chapters,
      flatPaths: mdFiles.map((f) => f.path),
      projectFilePath: projectPath
    };
    await this.writeProject(data);
    new import_obsidian3.Notice(`Built project file: ${projectPath}`);
  }
  async compileManuscript() {
    var _a;
    const data = await this.getManuscript();
    if (!data || data.flatPaths.length === 0) {
      new import_obsidian3.Notice("No manuscript found. Create a project file first.");
      return;
    }
    const parts = [];
    if (data.title)
      parts.push(`# ${data.title}
`);
    for (let ci = 0; ci < data.chapters.length; ci++) {
      const chapter = data.chapters[ci];
      if (chapter.title)
        parts.push(`
## ${chapter.title}
`);
      for (let si = 0; si < chapter.scenePaths.length; si++) {
        const scenePath = chapter.scenePaths[si];
        const status = (_a = data.sceneStatus) == null ? void 0 : _a[scenePath];
        if (status === "spiked" || status === "cut")
          continue;
        const file = this.app.vault.getAbstractFileByPath(scenePath);
        if (!(file instanceof import_obsidian3.TFile))
          continue;
        const headingMode = this.settings.stitchedSceneHeadingMode;
        if (headingMode !== "none") {
          const stem = file.basename;
          const headingText = headingMode === "sceneNumber" ? `Scene ${si + 1}` : stem.replace(/[_-]+/g, " ").trim();
          parts.push(`
### ${ci + 1}.${si + 1} ${headingText}
`);
        }
        const content = await this.app.vault.read(file);
        parts.push("\n" + content.trim() + "\n");
      }
    }
    const compiled = parts.join("\n");
    const compiledPath = (0, import_obsidian3.normalizePath)(".noveltools/compiled-manuscript.md");
    const dir = ".noveltools";
    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }
    const existingFile = this.app.vault.getAbstractFileByPath(compiledPath);
    let compiledFile;
    if (existingFile instanceof import_obsidian3.TFile) {
      await this.app.vault.modify(existingFile, compiled);
      compiledFile = existingFile;
    } else {
      compiledFile = await this.app.vault.create(compiledPath, compiled);
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(compiledFile);
    new import_obsidian3.Notice("Manuscript compiled successfully.");
  }
  // ---------------------------------------------------------------------------
  // Scene status
  // ---------------------------------------------------------------------------
  async setActiveSceneStatus(file) {
    if (!file || file.extension !== "md") {
      new import_obsidian3.Notice("Open a scene file first.");
      return;
    }
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath) {
      new import_obsidian3.Notice("No project file found. Create one first.");
      return;
    }
    const STATUS_OPTIONS = [
      { value: null, label: "\u25CB Clear status" },
      { value: "drafted", label: "\u{1F7E1} Drafted" },
      { value: "revision", label: "\u{1F535} Revision" },
      { value: "review", label: "\u{1F7E0} Review" },
      { value: "done", label: "\u{1F7E2} Done" },
      { value: "spiked", label: "\u{1F534} Spiked" },
      { value: "cut", label: "\u26AB Cut" }
    ];
    const modal = new StatusPickerModal(
      this.app,
      STATUS_OPTIONS,
      async (status) => {
        await this.setSceneStatusDirect(file.path, status);
        new import_obsidian3.Notice(`Status set: ${status != null ? status : "cleared"}`);
      }
    );
    modal.open();
  }
  async setSceneStatusDirect(filePath, status) {
    var _a;
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath)
      return;
    const sceneStatus = { ...(_a = data.sceneStatus) != null ? _a : {} };
    if (status === null) {
      delete sceneStatus[filePath];
    } else {
      sceneStatus[filePath] = status;
    }
    await this.writeProject({ ...data, sceneStatus });
  }
  async moveActiveScene(delta, file) {
    if (!file)
      return;
    const data = await this.getManuscript();
    if (!data || !data.projectFilePath)
      return;
    for (let ci = 0; ci < data.chapters.length; ci++) {
      const ch = data.chapters[ci];
      const si = ch.scenePaths.indexOf(file.path);
      if (si < 0)
        continue;
      const newSi = si + delta;
      if (newSi < 0 || newSi >= ch.scenePaths.length) {
        new import_obsidian3.Notice("Cannot move scene further.");
        return;
      }
      const chapters = data.chapters.map((c) => ({
        ...c,
        scenePaths: [...c.scenePaths]
      }));
      const scenePaths = chapters[ci].scenePaths;
      [scenePaths[si], scenePaths[newSi]] = [
        scenePaths[newSi],
        scenePaths[si]
      ];
      const flatPaths = chapters.flatMap((c) => c.scenePaths);
      await this.writeProject({ ...data, chapters, flatPaths });
      return;
    }
    new import_obsidian3.Notice("Current file is not in the manuscript.");
  }
};
function countWords(text, stripMarkdown) {
  let t = text;
  if (stripMarkdown) {
    t = t.replace(/^#{1,6}\s+/gm, "");
    t = t.replace(/\*\*?([^*]+)\*\*?/g, "$1");
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    t = t.replace(/`[^`]+`/g, "");
    t = t.replace(/```[\s\S]*?```/g, "");
  }
  const words = t.match(/\S+/g);
  return words ? words.length : 0;
}
var InputModal = class extends import_obsidian3.Modal {
  constructor(app, options) {
    super(app);
    this.options = options;
  }
  onOpen() {
    var _a;
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.options.title });
    if (this.options.description) {
      contentEl.createEl("p", {
        text: this.options.description,
        cls: "setting-item-description"
      });
    }
    const input = contentEl.createEl("input");
    input.type = "text";
    input.placeholder = this.options.placeholder;
    input.value = this.options.defaultValue;
    input.addClass("noveltools-modal-input");
    input.focus();
    const actions = contentEl.createEl("div", {
      cls: "noveltools-modal-actions"
    });
    const cancelBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn",
      text: "Cancel"
    });
    cancelBtn.addEventListener("click", () => this.close());
    const submitBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn mod-cta",
      text: (_a = this.options.submitLabel) != null ? _a : "OK"
    });
    const submit = async () => {
      this.close();
      await this.options.onSubmit(input.value);
    };
    submitBtn.addEventListener("click", () => void submit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        void submit();
      if (e.key === "Escape")
        this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian3.Modal {
  constructor(app, message, resolve) {
    super(app);
    this.message = message;
    this.resolve = resolve;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    const actions = contentEl.createEl("div", {
      cls: "noveltools-modal-actions"
    });
    const noBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn",
      text: "Cancel"
    });
    noBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });
    const yesBtn = actions.createEl("button", {
      cls: "noveltools-modal-btn mod-cta",
      text: "OK"
    });
    yesBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
function confirmModal(app, message) {
  return new Promise((resolve) => {
    new ConfirmModal(app, message, resolve).open();
  });
}
var StatusPickerModal = class extends import_obsidian3.Modal {
  constructor(app, options, onSelect) {
    super(app);
    this.options = options;
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Set Scene Status" });
    const list = contentEl.createEl("div", { cls: "noveltools-status-list" });
    for (const opt of this.options) {
      const btn = list.createEl("button", {
        cls: "noveltools-status-item",
        text: opt.label
      });
      btn.addEventListener("click", () => {
        this.close();
        void this.onSelect(opt.value);
      });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};

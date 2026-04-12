import { App, PluginSettingTab, Setting } from 'obsidian';
import type NovelToolsPlugin from './main';

export class NovelToolsSettingTab extends PluginSettingTab {
  plugin: NovelToolsPlugin;

  constructor(app: App, plugin: NovelToolsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'NovelTools Settings' });

    new Setting(containerEl)
      .setName('Project file')
      .setDesc(
        'Path (relative to vault root) of the noveltools.json project file.'
      )
      .addText((text) =>
        text
          .setPlaceholder('noveltools.json')
          .setValue(this.plugin.settings.projectFile)
          .onChange(async (value) => {
            this.plugin.settings.projectFile = value || 'noveltools.json';
            await this.plugin.saveSettings();
            this.plugin.clearCache();
            await this.plugin.refreshManuscriptView();
          })
      );

    new Setting(containerEl)
      .setName('Chapter grouping')
      .setDesc(
        'When building from files (no project file), group scenes by folder or keep flat.'
      )
      .addDropdown((drop) =>
        drop
          .addOption('flat', 'Flat (single chapter)')
          .addOption('folder', 'By folder')
          .setValue(this.plugin.settings.chapterGrouping)
          .onChange(async (value) => {
            this.plugin.settings.chapterGrouping = value as 'flat' | 'folder';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Strip markdown for word count')
      .setDesc('Remove markdown syntax before counting words.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.wordCountStripMarkdown)
          .onChange(async (value) => {
            this.plugin.settings.wordCountStripMarkdown = value;
            await this.plugin.saveSettings();
            await this.plugin.updateWordCount();
          })
      );

    new Setting(containerEl)
      .setName('Scene heading mode')
      .setDesc('Controls scene heading text in the compiled manuscript output.')
      .addDropdown((drop) =>
        drop
          .addOption('fileName', 'File name')
          .addOption('sceneNumber', 'Scene number')
          .addOption('none', 'None')
          .setValue(this.plugin.settings.stitchedSceneHeadingMode)
          .onChange(async (value) => {
            this.plugin.settings.stitchedSceneHeadingMode = value as
              | 'fileName'
              | 'sceneNumber'
              | 'none';
            await this.plugin.saveSettings();
          })
      );
  }
}

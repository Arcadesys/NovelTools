# NovelTools

A Cursor/VS Code extension for long-form writing: scene stitching, manuscript sidebar with drag-and-drop, typewriter sounds, and word counts.

## Features

- **Scene stitching**: Navigate between scenes and chapters; open a stitched (combined) view of the whole manuscript.
- **Manuscript sidebar**: Pull out the NovelTools sidebar to see the full manuscript as a tree (chapters → scenes). Drag and drop to reorder chapters or scenes; the project YAML is updated automatically. If you don’t have a project file yet, run **NovelTools: Build Project YAML** to create one from the current outline (or drag to reorder once—the file will be created on first drop). After that, all reordering is reflected in the YAML.
- **Typewriter sounds**: Optional keypress sound while typing in markdown (with throttling).
- **Word counts**: Per-document word count and manuscript total in the status bar.

## Project YAML format

Create a `noveltools.yaml` (or set `noveltools.projectFile` to another path) in your workspace root:

```yaml
title: My Novel
chapters:
  - title: Chapter 1
    scenes:
      - draft/ch1-scene1.md
      - draft/ch1-scene2.md
  - title: Chapter 2
    scenes:
      - draft/ch2.md
```

Paths are relative to the directory containing the project file. The Manuscript sidebar and all scene/chapter commands use this file. Drag-and-drop in the sidebar rewrites this YAML.

## Commands

- **NovelTools: Next Scene** / **Previous Scene** / **Go to Scene…**
- **NovelTools: Next Chapter** / **Previous Chapter** / **Go to Chapter…**
- **NovelTools: Move Chapter Up** / **Move Chapter Down**
- **NovelTools: Open Stitched Manuscript** – open a virtual document with all scenes concatenated (with chapter headings).
- **NovelTools: Refresh Manuscript View** – reload the project YAML in the sidebar.
- **NovelTools: Build Project YAML** – create or update `noveltools.yaml` from the current manuscript outline (from the project file if present, otherwise from `noveltools.sceneFiles` or `noveltools.sceneGlob`). Use this when you don’t have a project file yet; after creating it, drag-and-drop in the sidebar will update the YAML.

## Configuration

| Setting | Description |
|--------|-------------|
| `noveltools.projectFile` | Project YAML filename or path (default: `noveltools.yaml`). |
| `noveltools.sceneFiles` | Fallback: ordered scene paths when no project file. |
| `noveltools.sceneGlob` | Fallback: glob for scene files when no project file (default: `**/*.md`). |
| `noveltools.typewriterSound.enabled` | Enable typewriter sound (default: true). |
| `noveltools.typewriterSound.volume` | Volume 0–1 (default: 0.3). |
| `noveltools.typewriterSound.path` | Optional path to a custom WAV file. |
| `noveltools.wordCount.stripMarkdown` | Strip markdown before counting (default: false). |
| `noveltools.wordCount.manuscriptScope` | `project` (use project YAML scene list) or `workspace` (all .md files). |

## Build and install into Cursor

### Option A: Run from source (development)

1. Open the **NovelTools** folder in Cursor.
2. Build: run **`npm run dev`** or **`npm run compile`** (compiles TypeScript to `out/`).
3. Press **F5** or use **Run and Debug** → **Run Extension**. A new Cursor window opens with the extension loaded (Extension Development Host).

### Option B: Install as a packaged extension

1. Build and package:
   ```bash
   npm install
   npm run package
   ```
   This compiles the extension and creates `noveltools-0.1.0.vsix` in the project root.

2. Install the .vsix in Cursor:
   - **Command Palette** (Cmd+Shift+P / Ctrl+Shift+P) → **Extensions: Install from VSIX…**
   - Choose `noveltools-0.1.0.vsix` from this project folder.
   - Reload Cursor if prompted.

The extension will then appear in your sidebar (NovelTools icon) and in the Extensions list. Open a workspace with a `noveltools.yaml` (or markdown files) to use it.

## License

MIT

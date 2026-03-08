# NovelTools

A Cursor/VS Code extension for long-form writing: scene stitching, manuscript sidebar with drag-and-drop, and word counts.

## Features

- **Scene stitching**: Navigate between scenes and chapters; open a stitched (combined) view of the whole manuscript.
- **Manuscript sidebar**: Pull out the NovelTools sidebar to see the full manuscript as a tree (chapters → scenes). Drag and drop to reorder chapters or scenes; the project file (JSON) is updated automatically. If you don’t have a project file yet, run **NovelTools: Build Project YAML** to create `noveltools.json` from the current outline (or drag to reorder once—the file will be created on first drop). After that, all reordering is reflected in the project file.
- **Word counts**: Per-document word count and manuscript total in the status bar.
- **Section status**: Mark each scene as done (🟢), drafted (🟡), or spiked out (🔴) from the Manuscript view context menu. Status is stored in the project file so you can see progress at a glance.

## Troubleshooting

**“Cannot register 'noveltools.sceneGlob'. This property is already registered.”** — The extension is loaded twice (e.g. you have NovelTools installed and are also running from source). Fix: in the main Cursor window open **Extensions** (Ctrl+Shift+X / Cmd+Shift+X), find **NovelTools**, and **Uninstall**. Then use only the Extension Development Host (F5) when developing from source.

## Project JSON format

Create a `noveltools.json` (or set `noveltools.projectFile` to another path) in your workspace root:

```json
{
  "title": "My Novel",
  "chapters": [
    { "folder": "draft/chapter1" },
    { "folder": "draft/chapter2", "title": "Chapter 2" },
    {
      "folder": "AULD LANG LAPINE",
      "scenes": [
        "Fenton waits for word on dads condition.md",
        "Daniel wakes from death.md",
        "Val introduces Lovejoy's next play.md"
      ]
    },
    "draft/chapter3"
  ]
}
```

Paths are relative to the directory containing the project file. Each **chapter is a folder**. You can use a string (folder path) or an object with required `folder`, optional `title` (defaults to folder name), and optional **`scenes`** (custom order). When `scenes` is present, only those files are used, in that order; otherwise NovelTools discovers all `.md` files in the folder in **alphabetical order**. Scene entries are filenames (or paths relative to the folder). The Manuscript sidebar and all scene/chapter commands use this file; drag-and-drop rewrites the JSON and preserves custom scene order. Optional `sceneStatus` maps scene paths to `done`, `drafted`, or `spiked`; the Manuscript view shows 🟢/🟡/🔴 next to each scene.

**Schema** — The JSON Schema at `schemas/noveltools-project.schema.json` validates the project file. In VS Code/Cursor, JSON files get completion and validation when the schema is associated (e.g. in workspace settings or via a `$schema` property). Editing via the Manuscript sidebar (drag-and-drop, rename chapter, etc.) keeps the file valid.

**Migrating from YAML** — If you have an existing `noveltools.yaml`, run **NovelTools: Convert Project to JSON** to create `noveltools.json` in the same directory. The extension will then use the JSON file. You can remove the old `.yaml` file after confirming everything works.

**Alternatively: index.yaml** — NovelTools looks for `index.yaml` in the workspace root first. Use YAML frontmatter for the manuscript title, then a YAML array of scene paths in order:

```yaml
---
title: My Novel
---
- draft/ch1-scene1.md
- draft/ch1-scene2.md
- "Index (Conflicted copy workmac 202511071107).md"
```

Paths are relative to the directory containing `index.yaml`. Reordering in the sidebar updates this file in the same format.

**Longform (Obsidian) 1:1** — NovelTools discovers and edits index files that use the [Longform](https://github.com/kevboh/longform) plugin format. Use a note with frontmatter and a `longform` entry (`format`, `title`, `workflow`, `sceneFolder`, `scenes`). Scene names in `scenes` are without `.md`; they live under `sceneFolder` relative to the index file. Nested arrays in `scenes` are supported (indentation in the Longform UI). **Chapter names** are supported via an optional `chapterTitles` array in the `longform` block (one string per chapter, in order). Right‑click a chapter in the Manuscript view and choose **NovelTools: Rename Chapter…** to set or change its name; the YAML is updated with `chapterTitles`. Reordering in the sidebar writes back the same Longform structure. Both `Index.yaml` and `Index.md` (and names like `Index.YAML`, `! Index.yaml`) are found via the `noveltools.indexYamlGlob` setting (default includes case variations for `.yaml` and `.md`).

## Commands

- **NovelTools: Next Scene** / **Previous Scene** / **Go to Scene…**
- **NovelTools: Next Chapter** / **Previous Chapter** / **Go to Chapter…**
- **NovelTools: Move Chapter Up** / **Move Chapter Down**
- **NovelTools: Open Stitched Manuscript** – open a virtual document with all scenes concatenated (with chapter headings).
- **NovelTools: Open Stitched Chapter** – open a virtual document with one chapter’s scenes stitched (right‑click a chapter in the Manuscript view, or run from the Command Palette and pick a chapter).
- **NovelTools: Open Stitched Selection** – shift-click one or more scenes in the Manuscript sidebar and stitch only that selection (always ordered by project file).
- **NovelTools: Set Chapter as Context** – write the stitched chapter to a file (e.g. `.cursor/noveltools-chapter-context.md`) and open it so you can @-mention it in Cursor chat or reference it in a rule for agent review.
- **NovelTools: Refresh Manuscript View** – reload the project file in the sidebar.
- **NovelTools: Build Project YAML** – create or update `noveltools.json` from the current manuscript outline (from the project file if present, otherwise from `noveltools.sceneFiles` or `noveltools.sceneGlob`). Use this when you don’t have a project file yet; after creating it, drag-and-drop in the sidebar will update the file.
- **NovelTools: Convert Project to JSON** – one-time migration: save the current project as `noveltools.json` (use when you have an existing `noveltools.yaml`).

## Configuration

| Setting | Description |
|--------|-------------|
| `noveltools.projectFile` | Project JSON filename or path (default: `noveltools.json`). |
| `noveltools.sceneFiles` | Fallback: ordered scene paths when no project file. |
| `noveltools.sceneGlob` | Fallback: glob for scene files when no project file (default: `**/*.md`). |
| `noveltools.chapterGrouping` | When building from files without a project file: `flat` (one chapter) or `folder` (group by folder). |
| `noveltools.wordCount.stripMarkdown` | Strip markdown before counting (default: false). |
| `noveltools.wordCount.manuscriptScope` | `project` (use project file scene list) or `workspace` (all .md files). |
| `noveltools.chapterContextPath` | Path (relative to workspace root) where **Set Chapter as Context** writes the stitched chapter (default: `.cursor/noveltools-chapter-context.md`). |
| `noveltools.stitched.sceneHeadingMode` | Scene heading style for stitched output: `fileName` (default), `sceneNumber`, or `none`. Use `sceneNumber` or `none` to avoid filename-derived headings. |
| `noveltools.indexYamlGlob` | Glob to discover index files like `Index.YAML` or `Index.md` (default: `**/*[iI]ndex*.{yaml,yml,YAML,YML,md,MD}`). |

## Agent / Cursor context

**Set Chapter as Context** writes the selected chapter’s stitched markdown to the file set by `noveltools.chapterContextPath` (default: `.cursor/noveltools-chapter-context.md`), creates the parent directory if needed, and opens the file. To give an agent that chapter for review:

- **In chat**: @-mention the context file (e.g. `@.cursor/noveltools-chapter-context.md`) when starting a conversation.
- **In rules**: Add a Cursor rule (e.g. in `.cursor/rules`) that tells the agent to use that file when you ask for a chapter review (e.g. “When the user asks for a chapter review, use the content of `.cursor/noveltools-chapter-context.md` as the chapter to review.”).

Run **NovelTools: Set Chapter as Context** from the Manuscript view (right‑click a chapter) or from the Command Palette (then pick a chapter) before each review so the file always reflects the chapter you want in context.

## Build and install into Cursor

### Option A: Run from source (development)

1. Open the **NovelTools** folder in Cursor.
2. **If you see “Cannot register 'noveltools.sceneGlob'. This property is already registered.”** — the extension is loaded twice (e.g. you have NovelTools installed and are also running from source). In the main Cursor window, open **Extensions**, find **NovelTools**, and **Uninstall**. Then use only the Extension Development Host (F5) when developing.
3. Build: run **`npm run dev`** or **`npm run compile`** (compiles TypeScript to `out/`).
4. Press **F5** or use **Run and Debug** → **Run Extension**. A new Cursor window opens with the extension loaded (Extension Development Host).

### Option B: Install as a packaged extension

1. Build and package:
   ```bash
   npm install
   npm run package
   ```
   This compiles the extension and creates `noveltools-1.0.0.vsix` in the project root.

2. Install the .vsix in Cursor:
   - **Command Palette** (Cmd+Shift+P / Ctrl+Shift+P) → **Extensions: Install from VSIX…**
   - Choose `noveltools-1.0.0.vsix` from this project folder.

   **Or install from a GitHub release**: Download the `.vsix` from the [Releases](https://github.com/Arcadesys/NovelTools/releases) page, then use **Extensions: Install from VSIX…** as above.
   - Reload Cursor if prompted.

The extension will then appear in your sidebar (NovelTools icon) and in the Extensions list. **Open a folder** (File → Open Folder) that contains your project — not just a single file — so NovelTools can discover your index files.

### Index.YAML or Index.md not found?

- **Open a folder**: NovelTools needs a workspace folder open (File → Open Folder). If you open a single file or a `.code-workspace` that doesn’t include the right folder, the extension can’t see your index files.
- **Check exclusions**: If `Index.YAML` or `Index.md` is inside a folder excluded by `files.exclude` or `search.exclude` in VS Code settings, it won’t be discovered. Adjust those settings if needed.
- **Explicit path**: Set `noveltools.projectFile` to your index file path (e.g. `Index.YAML` or `manuscript/Index.md`) to point NovelTools at it directly.
- **Custom glob**: Adjust `noveltools.indexYamlGlob` if your index filenames don’t match the default (e.g. `**/my-manuscript.{yaml,md}`).

## License

MIT

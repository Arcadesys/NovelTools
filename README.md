# NovelTools

A Cursor/VS Code extension for long-form writing: scene stitching, manuscript sidebar with drag-and-drop, typewriter sounds, and word counts.

## Features

- **Scene stitching**: Navigate between scenes and chapters; open a stitched (combined) view of the whole manuscript.
- **Manuscript sidebar**: Pull out the NovelTools sidebar to see the full manuscript as a tree (chapters → scenes). Drag and drop to reorder chapters or scenes; the project YAML is updated automatically.
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

## Running the extension

1. Open this folder in VS Code or Cursor.
2. Run **Extension: Run Extension** from the Run and Debug view (F5), or use the launch config "Run Extension".
3. In the new Extension Development Host window, open a workspace that contains a `noveltools.yaml` (or use the fallback glob) and try the Manuscript view, commands, and word count.

## License

MIT

# Changelog

All notable changes to NovelTools will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-02-12

### Changed

- Version bump for release packaging.

## [1.1.0] - 2026-02-12

### Removed

- **Typewriter sounds** — Removed typewriter sound functionality to focus on core manuscript management features

## [1.0.0] - 2025-02-09

### Added

- **Scene stitching** — Navigate between scenes and chapters; open a stitched (combined) view of the whole manuscript
- **Manuscript sidebar** — Tree view with chapters and scenes; drag-and-drop reordering updates project YAML automatically
- **Word counts** — Per-document and manuscript total in the status bar; optional markdown stripping
- **Section status** — Mark scenes as done, drafted, or spiked from the Manuscript view; status stored in project YAML
- **Project YAML** — `noveltools.yaml` or `index.yaml` with folder-based chapters and optional custom scene order
- **Longform (Obsidian) support** — Discover and edit Longform index files; convert Longform projects to NovelTools YAML
- **Set Chapter as Context** — Write stitched chapter to `.cursor/noveltools-chapter-context.md` for agent review
- **Build Project YAML** — Create project file from outline when starting from scratch
- **Chapter commands** — Move, rename, remove chapters; open stitched chapter view

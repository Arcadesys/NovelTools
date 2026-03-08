# Changelog

All notable changes to NovelTools will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Project format: JSON** — Default project file is now `noveltools.json` (JSON). Same structure (chapters with folder, title, scenes; sceneStatus). Existing `noveltools.yaml` is still read; use **NovelTools: Convert Project to JSON** to migrate. New and built projects are written as JSON.

### Added

- **NovelTools: Convert Project to JSON** — One-time migration: writes current project to `noveltools.json` and switches to it.

## [1.1.2] - 2026-02-13

### Added

- **Add Chapter** — Create a new chapter from the Manuscript sidebar; creates the chapter folder on disk and updates project file. Use the view title menu or right‑click a chapter for "Add Chapter Above" / "Add Chapter Below".

### Fixed

- Restored the stable Manuscript view ID so the NovelTools sidebar is visible again after install/update.
- Added **NovelTools: Focus Sidebar** command to reliably reveal and focus the NovelTools sidebar.

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

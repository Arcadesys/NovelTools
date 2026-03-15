#!/usr/bin/env python3
"""
noveltools init — scaffold the manuscript build pipeline into the current directory.

Copies template files from the NovelTools templates/ directory into the correct
locations for a working GitHub Actions release pipeline:

  .github/workflows/release.yml   — parameterized build + release workflow
  .github/manuscript-header.tex   — LaTeX header (double-spaced, traditional MS)
  scripts/stitch.py               — manuscript stitcher
  requirements.txt                — Python dependencies
  noveltools.yaml                 — manuscript structure (starter template)
  release-config.yaml             — build formatting config

Warns before overwriting existing files (pass --force to skip prompts).
"""

import argparse
import shutil
import sys
from pathlib import Path

# Where the templates live, relative to this script
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

# Mapping: template filename -> destination path (relative to target directory)
FILE_MAP = {
    "release.yml": ".github/workflows/release.yml",
    "manuscript-header.tex": ".github/manuscript-header.tex",
    "stitch.py": "scripts/stitch.py",
    "requirements.txt": "requirements.txt",
    "noveltools.yaml": "noveltools.yaml",
    "release-config.yaml": "release-config.yaml",
}


def init(target: Path, force: bool = False) -> None:
    """Copy all template files into the target directory."""
    if not TEMPLATES_DIR.is_dir():
        print(f"Error: Templates directory not found: {TEMPLATES_DIR}", file=sys.stderr)
        sys.exit(1)

    for template_name, dest_rel in FILE_MAP.items():
        src = TEMPLATES_DIR / template_name
        dest = target / dest_rel

        if not src.exists():
            print(f"Warning: Template missing: {src}", file=sys.stderr)
            continue

        if dest.exists() and not force:
            response = input(f"  {dest_rel} already exists. Overwrite? [y/N] ").strip().lower()
            if response != "y":
                print(f"  Skipped {dest_rel}")
                continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"  Created {dest_rel}")

    print()
    print("Done! Next steps:")
    print("  1. Edit noveltools.yaml to define your manuscript structure")
    print("  2. Edit release-config.yaml to customize build formatting")
    print("  3. Commit and push a v* tag to trigger a release")
    print("  4. Or use workflow_dispatch for a manual build")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scaffold the NovelTools manuscript build pipeline"
    )
    parser.add_argument(
        "target",
        nargs="?",
        type=Path,
        default=Path.cwd(),
        help="Target directory (default: current directory)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files without prompting",
    )
    args = parser.parse_args()

    target = args.target.resolve()
    print(f"Initializing NovelTools pipeline in: {target}")
    print()
    init(target, force=args.force)


if __name__ == "__main__":
    main()

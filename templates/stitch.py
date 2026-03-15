#!/usr/bin/env python3
"""
Stitch manuscript parts into a single markdown file from noveltools.yaml.
Outputs to stdout or a file. Strips HTML comments (scene analysis blocks).
"""

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def strip_html_comments(text: str) -> str:
    """Remove <!-- ... --> blocks from the start of content."""
    return re.sub(r"<!--\[.*?\]-->\s*", "", text, flags=re.DOTALL).strip()


def load_config(config_path: Path) -> dict:
    """Load noveltools.yaml or release-config (for title overrides)."""
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def resolve_scene_path(root: Path, chapter_folder: str, scene_ref: str) -> Path:
    """
    Resolve scene reference to file path.
    - "Scene name.md" -> root/chapter_folder/Scene name.md
    - "OTHER CHAPTER/Cross ref.md" -> root/OTHER CHAPTER/Cross ref.md
    """
    if "/" in scene_ref:
        return root / scene_ref
    return root / chapter_folder / scene_ref


def stitch(
    root: Path,
    noveltools_path: Path,
    release_config_path: Path | None,
    output_path: Path | None,
) -> str:
    """Stitch all parts into a single markdown string."""
    config = load_config(noveltools_path)
    title = config.get("title", "Manuscript")
    chapters = config.get("chapters", [])

    # Release config: scene/chapter formatting
    rel_config: dict = {}
    if release_config_path and release_config_path.exists():
        rel_config = load_config(release_config_path)
    scene_header = rel_config.get("scenes", {}).get("header", "filename")
    chapters_cfg = rel_config.get("chapters", {})
    use_folder_names = chapters_cfg.get("use_folder_names", True)
    chapter_titles = chapters_cfg.get("titles", {})
    # Backwards compat: top-level chapter_titles
    if not chapter_titles and "chapter_titles" in rel_config:
        chapter_titles = rel_config["chapter_titles"]

    parts: list[str] = []

    for ch_idx, chapter in enumerate(chapters):
        folder = chapter.get("folder", "")
        scenes = chapter.get("scenes", [])
        ch_title = chapter_titles.get(folder, folder) if use_folder_names else chapter_titles.get(folder)
        if ch_title is None:
            ch_title = folder  # fallback

        # Chapter header
        parts.append(f"\n# {ch_title}\n\n")
        parts.append("----\n\n")

        for sc_idx, scene_ref in enumerate(scenes):
            path = resolve_scene_path(root, folder, scene_ref)
            if not path.exists():
                print(f"Warning: Scene not found: {path}", file=sys.stderr)
                continue
            content = path.read_text(encoding="utf-8")
            content = strip_html_comments(content)
            # Scene header per config
            scene_name = Path(scene_ref).stem  # filename without .md
            num = f"{ch_idx + 1}.{sc_idx + 1}"
            if scene_header == "filename":
                parts.append(f"# {scene_name}\n\n")
            elif scene_header == "numeric":
                parts.append(f"{num}\n\n")
            elif scene_header == "numeric_filename":
                parts.append(f"{num}: {scene_name}\n\n")
            # simple_break: no header
            parts.append(content)
            parts.append("\n\n----\n\n")

    full = f"# {title}\n\n----\n\n" + "".join(parts).rstrip()
    if output_path:
        output_path.write_text(full, encoding="utf-8")
    return full


def main() -> None:
    parser = argparse.ArgumentParser(description="Stitch manuscript from noveltools.yaml")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Project root (default: current directory)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to noveltools.yaml (default: root/noveltools.yaml)",
    )
    parser.add_argument(
        "--release-config",
        type=Path,
        default=None,
        help="Path to release-config.yaml for title overrides",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help="Output file (default: stdout)",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    config_path = args.config or root / "noveltools.yaml"
    release_config = args.release_config or root / "release-config.yaml"

    if not config_path.exists():
        print(f"Error: Config not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    result = stitch(root, config_path, release_config, args.output)
    if not args.output:
        print(result)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate the mkdocstrings API reference pages and inject their nav.

Zensical has no equivalent of ``mkdocs-api-autonav`` (nor ``gen-files`` /
``literate-nav``) yet, so we reproduce what it did with a small build step:

1. Walk the source package and write one Markdown page per module (a
   ``::: dotted.module`` block) under ``docs/reference/``.
2. Build the nested navigation for those pages and inject it into
   ``zensical.toml`` between the ``API-REFERENCE-NAV`` marker comments.

Run it before ``zensical build`` / ``zensical serve`` whenever the module
layout changes::

    uv run --group docs python scripts/gen_api_docs.py

The generated pages live under ``docs/reference/`` and are git-ignored; the
injected nav block is committed as part of ``zensical.toml``.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

# --- configuration (mirrors the old mkdocs-api-autonav settings, including
# its inclusion of underscore-prefixed modules) -------------------------------
SOURCE_ROOT = Path("src/damnit_api")
DOCS_DIR = Path("docs")
API_ROOT_URI = "reference"  # under docs_dir
NAV_SECTION_TITLE = "Reference"

BEGIN_MARKER = "# >>> BEGIN API-REFERENCE-NAV"
END_MARKER = "# <<< END API-REFERENCE-NAV"


def iter_modules(root: Path):
    """Yield ``(parts, doc_uri)`` for every module under ``root``.

    ``parts`` is the dotted-name tuple; ``doc_uri`` is the page path relative
    to ``docs_dir`` (packages become ``.../index.md``).
    """
    root = Path(root)
    files: list[Path] = []

    def walk(pkg: Path) -> None:
        # Skip implicit namespace packages (no __init__.py) like autonav did.
        if not (pkg / "__init__.py").is_file() and any(pkg.glob("*.py")):
            return
        for item in sorted(pkg.iterdir()):
            if item.is_file() and item.suffix == ".py":
                files.append(item)
            elif item.is_dir():
                walk(item)

    walk(root)

    for path in files:
        rel = path.relative_to(root.parent).with_suffix("")
        parts = tuple(rel.parts)
        doc = Path(API_ROOT_URI, *rel.parts).with_suffix(".md")
        if parts[-1] == "__init__":
            parts = parts[:-1]
            doc = doc.with_name("index.md")
        elif parts[-1] == "index":
            # avoid clashing with a directory index page
            doc = doc.with_name("index_py.md")
        yield parts, doc.as_posix()


class Node:
    """A navigation tree node (a package or a leaf module)."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.page: str | None = None
        self.children: dict[str, Node] = {}

    def add(self, parts: tuple[str, ...], page: str) -> None:
        node = self
        for part in parts:
            node = node.children.setdefault(part, Node(part))
        node.page = page


def build_tree(modules) -> Node:
    root = Node("")
    for parts, page in modules:
        root.add(parts, page)
    return root


def write_pages(modules) -> int:
    ref_dir = DOCS_DIR / API_ROOT_URI
    if ref_dir.exists():
        shutil.rmtree(ref_dir)

    for parts, page in modules:
        out = DOCS_DIR / page
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"::: {'.'.join(parts)}\n")
    return len(modules)


def render_nav(root: Node, indent: int = 2) -> str:
    """Render the tree as a TOML nav entry: ``{{ "Reference" = [ ... ] }}``.

    TOML arrays require a comma between elements, so every item is
    comma-terminated (trailing commas are allowed).
    """
    pad = " " * indent

    def entry(node: Node, level: int) -> str:
        step = " " * (2 * (level + 1) + indent)
        title = node.name
        if not node.children:
            return f'{{ "{title}" = "{node.page}" }}'
        items: list[str] = []
        if node.page is not None:  # section index page first
            items.append(f'"{node.page}"')
        items.extend(entry(child, level + 1) for child in node.children.values())
        inner = "".join(f"{step}{item},\n" for item in items)
        close = " " * (2 * level + indent)
        return f'{{ "{title}" = [\n{inner}{close}] }}'

    # `root` has no page; its children are the top-level packages.
    tops = "".join(f"{pad}  {entry(c, 1)},\n" for c in root.children.values())
    comment = f"{pad}# Managed by scripts/gen_api_docs.py - run it to refresh.\n"
    return f'{comment}{pad}{{ "{NAV_SECTION_TITLE}" = [\n{tops}{pad}] }},'


def inject_nav(nav_block: str) -> None:
    config = Path("zensical.toml")
    text = config.read_text()
    pattern = re.compile(
        rf"(^\s*{re.escape(BEGIN_MARKER)}$).*?(^\s*{re.escape(END_MARKER)}$)",
        re.DOTALL | re.MULTILINE,
    )
    if not pattern.search(text):
        msg = (
            f"Could not find the {BEGIN_MARKER} / {END_MARKER} markers in "
            f"{config}. Add them inside the `nav = [ ... ]` array."
        )
        raise SystemExit(msg)
    replacement = f"\\1\n{nav_block}\n\\2"
    config.write_text(pattern.sub(replacement, text))


def main() -> None:
    modules = list(iter_modules(SOURCE_ROOT))
    written = write_pages(modules)
    inject_nav(render_nav(build_tree(modules)))
    print(f"Generated {written} API reference pages under {DOCS_DIR / API_ROOT_URI}/")
    print(f"Injected '{NAV_SECTION_TITLE}' nav into zensical.toml")


if __name__ == "__main__":
    main()

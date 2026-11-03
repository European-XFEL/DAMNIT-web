"""Zensical macros: helpers for the docs build (see zensical.toml)."""

import textwrap
from pathlib import Path


def define_env(env):
    @env.macro
    def read_file(path: str) -> str:
        return Path(path).read_text()

    @env.filter
    def wrap(text: str, width: int = 80) -> str:
        return "\n".join(
            textwrap.fill(paragraph, width) if paragraph else ""
            for paragraph in text.split("\n")
        )

import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

import regex

ASCII_FOR = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201b": "'",
    "\u00b4": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u201f": '"',
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\u2015": "-",
    "\u2212": "-",
    "\u2026": "...",
}

NON_ASCII_SPACE = regex.compile(r"[\p{Zs}--[ ]]", regex.V1)

# U+FE0E and U+FE0F pass, since emoji such as a red heart need them.
INVISIBLE = regex.compile(
    r"[\p{Cf}\p{Zl}\p{Zp}[\p{Cc}--[\t\n\r]]"
    r"[\p{Default_Ignorable_Code_Point}--[\ufe0e\ufe0f]]]",
    regex.V1,
)

# Decoding puts this in place of each byte that is not UTF-8.
REPLACEMENT_CHARACTER = "\ufffd"


class Hit(NamedTuple):
    line: int
    column: int
    code_point: int


def advice_for(character):
    if character in ASCII_FOR:
        return f"use {ASCII_FOR[character]}"
    if character == REPLACEMENT_CHARACTER:
        return "not UTF-8"
    if NON_ASCII_SPACE.match(character):
        return "use a space"
    if INVISIBLE.match(character):
        return "invisible"

    return None


def find_characters(text):
    hits = []
    line = 1
    column = 0
    for character in text:
        if character == "\n":
            line += 1
            column = 0
            continue

        column += 1

        # No printable ASCII character is banned. Skipping them before the
        # regex lookups makes a run over every tracked file eight times faster.
        if " " <= character <= "~":
            continue

        if advice_for(character) is not None:
            hits.append(Hit(line, column, ord(character)))

    return hits


def format_hit(path, hit):
    advice = advice_for(chr(hit.code_point))
    return f"{path}:{hit.line}:{hit.column} U+{hit.code_point:04X} ({advice})"


def repo_root():
    output = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        encoding="utf-8",
        check=True,
    ).stdout

    return Path(output.strip())


def tracked_files(root, named):
    # Pre-commit names the staged files and CI names none, which reads them all.
    named = [Path(name).absolute() for name in named]
    output = subprocess.run(
        ["git", "--literal-pathspecs", "ls-files", "--deduplicate", "-z", "--", *named],
        cwd=root,
        stdout=subprocess.PIPE,
        encoding="utf-8",
        check=True,
    ).stdout

    return [path for path in output.split("\0") if path]


def hits_in_file(path):
    # git ls-files still lists a tracked file that was deleted from disk.
    if not path.exists():
        return []

    data = path.read_bytes()
    if b"\0" in data:
        return []

    return find_characters(data.decode("utf-8", errors="replace"))


def main(named):
    root = repo_root()

    status = 0
    for path in tracked_files(root, named):
        for hit in hits_in_file(root / path):
            print(format_hit(path, hit))
            status = 1

    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

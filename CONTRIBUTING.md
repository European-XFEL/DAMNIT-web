# Contributing

## Development setup

See the [README](README.md) for how to set up and run the project.
`scripts/setup-dev.sh` installs the dependencies and the git hooks.

## How checks run

The git hooks give you fast feedback locally and run in stages:

- On commit: ruff (backend and `scripts/`), eslint and prettier
  (frontend). These lint and auto-format the files you changed. A
  character check also reads them; see below.
- On push: type checks (frontend tsc; pyright once re-enabled).
- In CI: every check runs again and gates the merge.

CI is the real gate. The local hooks just let you catch issues before you
push.

## Character check

`scripts/check-characters/check_characters.py` fails on characters that
stand in for plain ASCII (curly quotes, long dashes, the minus sign, the
ellipsis) and on invisible ones. Each hit prints as
`path:line:column U+XXXX (advice)`, where the advice is what to use
instead, `invisible`, or `not UTF-8` when the file was saved in another
encoding. To keep one of these characters on purpose, write it as an
escape, such as `'\u2014'` or `&mdash;`. To check every tracked file, run:

    uv run python scripts/check-characters/check_characters.py

## Bypassing hooks

The hooks are local convenience, not the gate. For a work-in-progress
commit you can skip them:

    git commit --no-verify

CI still runs every check, so nothing slips through.

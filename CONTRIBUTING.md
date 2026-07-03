# Contributing

## Development setup

See the [README](README.md) for how to set up and run the project.
`scripts/setup-dev.sh` installs the dependencies and the git hooks.

## How checks run

The git hooks give you fast feedback locally and run in stages:

- On commit: ruff (backend), eslint and prettier (frontend). These lint
  and auto-format the files you changed.
- On push: type checks (frontend tsc; pyright once re-enabled).
- In CI: every check runs again and gates the merge.

CI is the real gate. The local hooks just let you catch issues before you
push.

## Bypassing hooks

The hooks are local convenience, not the gate. For a work-in-progress
commit you can skip them:

    git commit --no-verify

CI still runs every check, so nothing slips through.

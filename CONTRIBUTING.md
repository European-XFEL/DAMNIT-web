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

To skip a whole file, such as a generated one that may hold any character,
mark it in `.gitattributes`:

    frontend/pnpm-lock.yaml -check-characters

To skip a folder, write `folder/**`, since `folder` or `folder/` alone
marks no file inside it.

## Changelog

`CHANGELOG.md` is for the people who use DAMNIT-web. Instrument staff
forward the release page to users, so a line names what a person on the
site now sees. Keep it to a short phrase with no PR number, such as
"Plots in their own browser window." or "Live updates left open after
logout."

A PR that changes what a user sees adds one line under `[Unreleased]`.
One feature gets one line, added by the PR after which a user can see
it. A later PR that extends a feature not yet released changes that line
instead of adding one.

Put the line in its group, in this order: Added, Changed, Deprecated,
Removed, Fixed, Security, Deployment. Deployment is for a step on the
host, such as a new setting or a new file to mount; name the setting or
the file. Inside a group, order the lines by area: table, plots,
dashboard, context file, login, proposal list, site and demo, then
changes to the whole app.

`.gitattributes` marks `CHANGELOG.md` with `merge=union`, so two branches
that each add a line merge without a conflict: git keeps both sides'
lines. When both sides changed the same line, git keeps both versions,
and two new groups can land out of order. If GitHub shows a conflict in
`CHANGELOG.md`, merge `main` on your machine and push:

    git fetch origin && git merge origin/main

No check asks for a line. At release time, the section is read against
the merges since the last tag, and a missing line is added then.

## Releasing

1. Read `[Unreleased]` against the merges since the last tag, add what
   is missing, and fix what a union merge left: two versions of one
   line, or groups out of order:

       git log --first-parent <last tag>..origin/main

2. Read the next number off the section:
   - Only Fixed or Security lines, or no visible change: the patch
     number moves (`0.3.0` to `0.3.1`).
   - Any Added, Changed, Deprecated, Removed or Deployment line: the
     minor number moves (`0.3.1` to `0.4.0`).
   - The major number moves only by decision, for an announcement.
3. In a PR, put `## [x.y.z] - YYYY-MM-DD` under an empty
   `## [Unreleased]`, and update the link lines at the foot of the file.
4. After the merge, tag the merge commit with an annotated tag and push
   the tag:

       git tag -a x.y.z -m "x.y.z" <merge sha>
       git push origin x.y.z

   The tag is the version. The `version` fields in `pyproject.toml` and
   `package.json` are not kept.

5. For a minor or a major version, make a GitHub release whose notes are
   the section. A patch gets a bare tag.

       gh release create x.y.z --verify-tag --notes-file <section file>

6. Deploy the tag on each host: the API with the steps in
   `api/docs/deployment.md`, and the frontend with the steps in
   `frontend/README.md`. Before the build, check out the tag in place of
   a `git pull`:

       git fetch --tags && git checkout x.y.z

   Run `git checkout main` before a later deploy from `main`.

## Bypassing hooks

The hooks are local convenience, not the gate. For a work-in-progress
commit you can skip them:

    git commit --no-verify

CI still runs every check, so nothing slips through.

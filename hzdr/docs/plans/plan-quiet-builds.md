# Plan: quiet builds: no rewriting what has not changed

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Same format: rulings
first, a box ticked in the commit that does the work.

## Ruling (maintainer, 2026-11-22)

- **R-2026-11-22h:** "I mostly just don't want too much reading going on
  across a ton of apps and servers and drives."

## What reads and writes what, today

| Who | What | Where | How often |
| --- | --- | --- | --- |
| Builder: the shot-aligner days | the listed days' index and decisions | `~/shot-aligner` (local disk) | each build; only the needed dates, stored after the first read (plan-backfill-store) |
| Trigger's watcher | size and mtime of exports and index files | the curated root, local disk | every `LABFROG_POLL_SECONDS` (60 s) |
| **Builder: publishing** | **every campaign's master NeXus file and catalog entry, rewritten; each container checked in place** | **bigdata (CIFS)** | **every build: one new event anywhere rebuilds every campaign** |
| Container worker | one stat per raw file (Vanlife: 4,242); reads file contents only to rewrite a container | bigdata | before and after each build, with `CONTAINERS_ENABLED` |
| `align.py index` (console script) | the date folder | bigdata | missing or out-of-date days only |
| Phase 6 compare | both sides' containers | bigdata | when asked |

The publishing row grows with every campaign added: today's trigger rewrites
Vanlife's master, and every other campaign's, on the share.

## Decisions

- **Q1: a campaign whose result has not changed is not published.** After
  matching (CPU and local reads only), the build hashes what it would write:
  - the shots and events, laser constants, never-shot kinds and title;
  - the LabFrog NeXus source, if any;
  - the containers in place: `shots/.build-manifest.json`'s size and mtime,
    which the worker updates whenever it writes or removes one;
  - the code that writes the files: the digest of `hzdr_nexus.py`,
    `hzdr_sources.py`, `hzdr_aligner.py` and the builder script, so a code
    update is never skipped.

  The hash is stored beside the master, in `.hzdr-build-stamp.json`, with
  the master's size and mtime. When the hash and the master are both
  unchanged, the build prints `unchanged, not rewritten` and does not write
  the NeXus file, the catalog entry or SciCat. Anything that would change
  the output changes the hash. `--force` (and `hzdr-rebuild.py --force`)
  publishes anyway.
- **Q2: containers only when asked, for this year's campaigns.**
  `CONTAINERS_ENABLED` stays off, which is configuration, not code. The
  console script's `--apply` runs the worker for the campaigns it is asked
  about, and only there do the raw files on bigdata get stat'ed. Turning it
  on later is the existing go-live checklist (operations.md).
- **Q3: nothing else changes.** The watcher's polling and the console
  script's reads are local and small.

## Checklist

- [x] Plan written first (this file)
- [ ] **Q1:**
  - the stamp, written after a publish, and the skip;
  - `--force` on the builder and on `hzdr-rebuild.py`, which the console
    script passes on its relink build;
  - tests: a second identical build skips, while a changed event, review
    decision, container manifest, code digest or deleted master each
    publishes;
  - multi-campaign: one campaign skips and another publishes, and the
    catalog keeps both.
- [ ] **Measured:** Vanlife built twice; the second does not touch the
      NeXus file (mtime unchanged).
- [ ] **Docs:**
  - `deploy-notes.md` (keep `CONTAINERS_ENABLED` off);
  - `operations.md` (what reads the share, and when), `CLAUDE.md`,
    `hzdr/CHANGELOG.md`.
- [ ] **Gates:** ruff, pyright (193), pytest, acceptance.
- [ ] **GitLab notes, PR description.**

## Results

(filled in by the commits)

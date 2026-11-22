# Plan: store what the backfill reads, and one console script for a campaign

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Follows
[plan-campaign-backfill.md](plan-campaign-backfill.md). Same format: rulings
first, a box ticked in the commit that does the work.

## Rulings (maintainer, 2026-11-22)

- **R-2026-11-22f: store it.** "I think we should probably store it. That's
  a lot to rebuild." Every build of every campaign re-reads every day index
  in shot-aligner's folder. On the server that is one index per opened date,
  each up to hundreds of thousands of lines, read again on every
  auto-trigger rebuild.
- **R-2026-11-22g: a console script, ready to test with the deploy.** One
  command in the terminal that reports a campaign's state and, with
  `--apply`, runs its steps.

## Measured first

On this machine the two committed indexes (1.2 and 2.0 MB) take 0.05 s for
the bridge's claims and 0.43 s for the backfill: small per day, but repeated
for every date in the folder, every campaign and every build.

## Decisions (this plan)

- **G1: a cache, not a second source of truth.** Each date's parsed
  result is stored once. It holds the bridge's claims, the Shotsheet shots
  and the file events, all without a campaign stamped in. The file is
  `<cache>/<date>.aligner.json`, and it carries a fingerprint: the size and
  mtime of `<date>.index.json` and of `<date>.decisions.json`.
  - A build reads the stored file while the fingerprint matches. When it
    does not (shot-aligner rewrote the index, or a reviewer decided
    something), the build parses the index again and stores the new result.
  - shot-aligner stays the only source. Deleting the cache only costs one
    slower build.
  - The cache is written atomically (temp file, then rename), so a build
    that is killed mid-write leaves no half file. A file that does not parse
    is ignored and rebuilt.
- **G2: where.** `DW_API_HZDR_BUILDER__ALIGNER_CACHE_DIR`. The default is
  `.aligner-cache` beside the catalog (`hzdr_sources.json`): under
  `OUTPUT_ROOT` in multi-campaign mode, beside `OUTPUT_NEXUS` otherwise.
  It is never in shot-aligner's checkout, and a dot-folder keeps it out of
  the campaign listing. The builder flag is `--aligner-cache-dir`.
- **G3: read only the dates a build needs.** The bridge's claims are loaded
  for the dates its events fall on (campaign-local) plus the campaign's
  backfill dates, not for every index in the folder. A campaign whose events
  name no indexed date reads nothing.
- **G4: the console script, `api/scripts/hzdr-campaign-backfill.py`.** It
  reads the settings from `api/.env` through the API's own code, like
  `hzdr-rebuild.py`, and works on the campaigns in `ALIGNER_CAMPAIGNS` (or
  `--campaign <id>`).
  - **Report (default, changes nothing).** One line per date:
    - whether the day index is there and how old it is;
    - reviewed: links confirmed out of links;
    - Shotsheet shots counted;
    - whether the cache is current;
    - from the published catalog: the campaign's shots, files attached
      (`aligner_confirmed`), and files waiting as suggestions.
    - At the end, one line naming the next step.
  - **`--apply`:**
    1. index the dates that have no index yet, with shot-aligner's own
       command (`align.py --site <site> index <date> --if-changed`, in
       `--shot-aligner ~/shot-aligner`);
    2. rebuild (`hzdr-rebuild.py`, the trigger's own command);
    3. run the container worker on the campaign's master;
    4. with `--aligner-build <folder>`, compare the containers with
       shot-aligner's (`hzdr-compare-containers.py`);
    5. report again.

    A step that fails stops the ones after it and is named.
  - **Exit status:** 0 when every step passed, or (without `--apply`) when
    nothing is missing. 1 when a date has no index, a step failed, or the
    settings are incomplete. 2 when `ALIGNER_INDEX_DIR` is not set.
  - Reviewing a day, and deciding which dates belong to a campaign, are a
    person's job; the script names them, never does them.
- **G5: `next-on-server.sh` stays as it is:** its `labfrog` step already
  names dates without an index. `deploy-notes.md` step 7 becomes "run
  `hzdr-campaign-backfill.py`, then `--apply`".

## Checklist

- [x] Plan written first (this file), linked from `plan-campaign-backfill.md`;
      the struck item (events for days without a watchdog: made at build
      time now, so no event-model change is needed) noted in
      `plan-aligner-bridge.md`
- [ ] **G1/G2, the cache:**
  - `hzdr_aligner.load_day_cached` and the fingerprint;
  - an atomic write;
  - claims kept one object per event when read back;
  - the setting, the flag and the trigger;
  - tests: a hit, a miss after the index changes, a miss after a decision,
    a corrupt cache file, and a cached build equal to an uncached one.
- [ ] **G3, only the needed dates:** tests: a build whose events fall on one
      date reads that index alone.
- [ ] **Measured:** cold and warm builds of Vanlife, before and after.
- [ ] **G4, the console script:**
  - report and `--apply`, the exit codes;
  - tests: the report on the fixture (with and without a catalog, a
    missing date); `--apply` with the shot-aligner, rebuild, worker and
    compare commands replaced by recorders (order, stop on failure).
- [ ] **Run for real here:** report, then `--apply`, on Vanlife from the
      committed indexes with a local `.env`-free setup (the same commands
      with paths pointed at a scratch folder).
- [ ] **Docs:**
  - `deploy-notes.md` step 7, `next-on-server.md` item 10;
  - `operations.md`, `CLAUDE.md`, the settings template,
    `hzdr/CHANGELOG.md`.
- [ ] **Gates:** ruff, pyright (193), pytest, the coverage map, acceptance.
- [ ] **GitLab:**
  - hzdr-combo `NEXT.md`;
  - the fwkt-webapps DAMNIT page;
  - the PR #58 description.

## Results

(filled in by the commits)

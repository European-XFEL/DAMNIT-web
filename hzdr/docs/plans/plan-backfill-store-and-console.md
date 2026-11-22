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
- [x] **G1/G2, the cache:**
  - `hzdr_aligner.load_day_cached` and the fingerprint;
  - an atomic write;
  - claims kept one object per event when read back;
  - the setting, the flag and the trigger;
  - tests: a hit, a miss after the index changes, a miss after a decision,
    a corrupt cache file, and a cached build equal to an uncached one.
- [x] **G3, only the needed dates:** tests: a build whose events fall on one
      date reads that index alone.
- [x] **Measured:** cold and warm builds of Vanlife, before and after.
- [x] **G4, the console script:**
  - report and `--apply`, the exit codes;
  - tests: the report on the fixture (with and without a catalog, a
    missing date); `--apply` with the shot-aligner, rebuild, worker and
    compare commands replaced by recorders (order, stop on failure).
- [x] **Run for real here:** report, then `--apply`, on Vanlife from the
      committed indexes with a local `.env`-free setup (the same commands
      with paths pointed at a scratch folder).
- [x] **Docs:**
  - `deploy-notes.md` step 7, `next-on-server.md` item 10;
  - `operations.md`, `CLAUDE.md`, the settings template,
    `hzdr/CHANGELOG.md`.
- [x] **Gates:** ruff, pyright (193), pytest, the coverage map, acceptance.
- [x] **GitLab:**
  - hzdr-combo `NEXT.md`;
  - the fwkt-webapps DAMNIT page;
  - the PR #58 description.

## Results

**G1 to G3, measured on Vanlife (12-01 and 12-03, 4,242 files, 258 shots):**

| Step | Before | After |
| --- | ---: | ---: |
| Reading both days (backfill and claims) | 0.59 s | 0.42 s the first time (it also stores them), **0.20 s** after |
| The whole build, wall clock | 4.1 s | **3.5 to 3.8 s** |
| The whole build under the profiler | 14.9 s | 9.1 s |

The output is identical apart from the build time stamp.

- **The real cost was matching, not reading.** The profile found two
  repeats, now removed:
  - `parse_datetime` parsed every shot's time again for every event, about
    a million parses; a parsed time string is now kept (`lru_cache` on the
    text: a datetime is immutable);
  - the bridge checked each file separately, though every file of one
    shot-aligner event has one answer; it is now checked once per event.
    That step fell from 3.0 s to under 0.5 s in the profile.
- **The store makes a day 2 to 3 times faster to read again,** but its file
  is larger than the index (3.9 MB against 2.0 MB for 12-03), because the
  file events are spelled out.
- **G3 matters more on the server:** a build now reads only the dates its
  events fall on, where it used to read every index in the folder for every
  campaign.
- **Left, noted:** the time ladder still tries every unnumbered file against
  every shot before the bridge claims it. That is now the largest part of a
  build, and it grows with shots × files. Skipping it for files the bridge
  will attach is a change to the matcher's order, so it is its own plan.

Tests: 7 more in `test_hzdr_aligner.py`, 35 in all:
- a stored hit;
- a miss after the index or a decision changes;
- a corrupt stored file;
- only the needed dates read;
- a stored build equal to an unstored one;
- the trigger flag.

**G4, the console script, run for real here** (`--index-dir` with the
committed indexes, `--output-root` a scratch folder).

The report on all four Vanlife dates names 12-02 and 12-05 `MISSING` and
says to build their indexes. `--apply` on 12-01 and 12-03 then ran the
rebuild, the container worker (150 containers), and the relink build. After
the steps:

```
campaign           date         index  reviewed  rows stored shots attached waiting
Vanlife_12.2025    2025_12_01    12 h     0/102   108    yes   108        0    1698
Vanlife_12.2025    2025_12_03    12 h   150/150   150    yes   150     2544       0
Next: review 2025_12_01 in shot-aligner; confirmed days attach at the next build
```

Waiting files are counted by the day of the shot they are suggested for,
not by the file's own time. Some instrument clocks show other days
(shot-aligner's "files stamped 2025-12-05" finding), so counting by the
file's time first gave 1,641 instead of 1,698.

Tests: 10 in the new `test_hzdr_campaign_backfill.py`:
- the report;
- `--apply` in order, with the relink build;
- a failure at each of the four steps stopping the rest;
- the trigger's own rebuild command when run from settings;
- a real `--apply` run that writes the containers;
- the missing settings.

**Gates:**
- ruff is clean;
- pyright is at 193, after fixing one optional-access error that the
  stored-days tests had added;
- pytest: 1,125 passed, 33 skipped;
- local acceptance is all OK, and `--real-topology` passed.

**Found while getting it ready for the deploy (2026-11-22), and fixed:**

1. **Opening a date in shot-aligner does not write its day index.** Its
   docs list the index as "worked out when asked for and not stored". The
   file is written by the date's **Write index JSON** task (`shotalign/tasks.py`,
   `/api/save/<date>`) or by `align.py index`. The deploy notes, operations,
   next-on-server, the script's warning and plan-aligner-bridge's R-2026-11-22c
   said "open the date"; they now name the task.
2. **A confirmation made after the index was written did not count.** The
   bridge required the index's band *and* the decisions file to say
   confirmed, and the band is only as new as the index. It now judges the
   decisions file as it is, with shot-aligner's own rule (`Ledger.pairing`,
   `hzdr_aligner.link_confirmed`):
   - a `confirm` stands while the link still names the Count it was made
     against (`matched_count`), or when it predates that witness;
   - a `repin` stands when the link names the Count it forced;
   - a `reject`, or a pairing that moved, never stands;
   - without a decisions file, the band decides.

   The stored copies are re-made (`CACHE_VERSION` 2). On 2025-12-03,
   2,544 files are still attached and none are wrong.
3. **An index older than its decisions** is marked `*` in the report, and
   `--apply` rewrites it (`--if-changed`) along with the missing ones.

Tests:
- the ledger rule, case by case, and a ledger without an entry;
- the stale index, marked and rewritten.

Gates: pytest 1,127 passed, 33 skipped; pyright 193; ruff clean; acceptance
in both modes passed.

**On the server, with the deploy:** `deploy-notes.md` step 7: set
`ALIGNER_CAMPAIGNS`, run the report, then `--apply --aligner-build <shot-aligner's
Vanlife build>`.


# Plan: shot-aligner's decisions as DAMNIT's evidence, until the authority is everywhere

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Follows
[plan-time-rule-real-data.md](plan-time-rule-real-data.md), whose result
was that raw instrument clocks are too far off for any time rule DAMNIT can
apply on its own, and that what works is what shot-aligner already does:
fit each instrument's clock, segment by segment, then pair whole shots with
Shotsheet rows by sequence and time, and let a person confirm. Same format
as before: rulings first, a box ticked in the commit that does the work.

## Rulings (maintainer, 2026-11-22)

- **R-2026-11-22a: a confirmation made in shot-aligner is a person's
  decision.** A file whose shot-aligner event a reviewer confirmed may attach
  in DAMNIT without a second click. This is not a guess, so ruling A7 is not
  touched: the time ranks still only propose.
- **R-2026-11-22b: how a Shotsheet row maps to a LabFrog record.** "Local
  count should be the same, but the shot authority is always best, and
  double-check everything with date, time stamp and the details that might
  map."
- **R-2026-11-22c: where the indexes are.** Day indexes are built by
  shot-aligner and live in that repository's `shot_aligner/index/` folder
  (`<date>.index.json`, not committed apart from two examples, and
  `<date>.decisions.json`, committed). On fwkt-webapps that is
  `~/shot-aligner/shot_aligner/index/`. The app writes there with a date's
  **Write index JSON** task, not when a date is opened (corrected
  2026-11-22, `shotalign/tasks.py`), and `align.py --site fwkt-webapps index
  <date> --if-changed` does the same from a shell. The nightly `laser-shot-reindex` builds the folder,
  workbook, contents and pairing indexes, not the day indexes.

## Found while checking (2026-11-22)

**The page's "Confirm clear time cases" offers wrong files.** It offers an
event whose closest candidate is within 30 s, when every other candidate is
2 min or more further. Since A7 a time proposal has exactly one candidate
(the nearest shot), so the second test never runs. On shot-aligner's two days
(raw clocks, 120 s tolerance) it would offer:

| Day | Offered right | Offered wrong |
| --- | ---: | ---: |
| 2025-12-01 (not reviewed) | 253 | **328** |
| 2025-12-03 (reviewed) | 909 | **583** |

Tested against every shot of the campaign instead of the one candidate:
12-01 99 right / 8 wrong, 12-03 19 right / 0 wrong. That is still not good
enough for files on instrument clocks.

## Decisions (this plan)

- **B1: the bulk time rule tests every shot, and never offers files.** The
  review route gives each ambiguous event its runner-up gap: the gap to the
  nearest shot that is not its closest candidate, over all current shots of
  the source (`runner_up_gaps_s`). The page offers a clear time case only
  when that runner-up is known and 2 min or more further. It offers only events
  with no instrument (`metadata.instrument.id`), meaning triggers on the
  authority's clock. Files wait for the aligner (below) or a person. The
  evaluation script gains `--rule bulk` so the number can be measured again.
- **B2: the day index is read, not recomputed.** DAMNIT reads
  `<date>.index.json` and `<date>.decisions.json` as shot-aligner wrote them
  (`hzdr_aligner.py`). No shot-aligner code is vendored, and its clock fitting
  stays in shot-aligner.
- **B3: a file is found by its folder and name.** shot-aligner lists each
  acquisition's `files` as `<instrument folder>/<file name>` relative to the
  date folder. A watchdog event names its files in `payload_ref` (`path`,
  `filename`, `members[].path`). The join is (date, folder, name). The date
  is the event's campaign-local date, or the date folder named in its path.
  A key that two claims share is no join.
- **B4: which DAMNIT shot a confirmed file goes to (R-2026-11-22b).** Every
  piece of evidence present must name the same shot. One that names another
  shot, or none, stops the attach:
  1. **the shot authority**: an `authority_shot_number` the aligner's index
     gives the event (`labfrog.authority` on a day without a Shotsheet, or the
     LabFrog record's own in `labfrog.matches`), held by exactly one current
     DAMNIT shot;
  2. **the LabFrog record** the aligner matched the row to
     (`labfrog.matches[].labfrog.mongo_id`, outcome `matched`), as the shot's
     `labfrog_record_id`;
  3. **the Count**: the one current DAMNIT shot of that date whose
     `labfrog_local_count` equals the row's Count. Where several share the
     day's Count (a counter reset), the one within the tolerance of the row's
     time.

  Then the checks, each when both sides have the value:
  - **date**: the shot's `shot_date` is the index's date;
  - **time**: LabFrog's time is within the tolerance (120 s) of the row's
    `Zeit` (typed to the minute, so 120 s, not less);
  - **details**: the Shotsheet values that LabFrog records too agree. These
    are `gvd`, `tod`, and `elaser` against `laser.pulse_energy` (J), within
    0.1 % or 1e-9.
- **B5: what each outcome does.**
  - A **confirmed** link that passes B4 attaches, as `aligner_confirmed`.
    The rank sits above the time ranks and below the number ranks, so an
    authority number on the event still wins.
  - A link that is not confirmed (`high`/`low`) and passes B4 becomes a
    **suggestion** (`suggestion_reason: shot_aligner`), for "Confirm these N".
  - A link that fails B4 waits, with the reason it failed:
    `aligner_disagrees` when the evidence names different shots,
    `aligner_check_failed` when a check fails, and `aligner_no_shot` when no
    DAMNIT shot is found. The page names the check.
  - The shot must not already hold an event of the file's stream (D1).
- **B6: settings.** `DW_API_HZDR_BUILDER__ALIGNER_INDEX_DIR` (default
  empty: off) → `--aligner-index-dir`. The trigger always passes it. A
  change to the folder (a new index or decision) is a rebuild input, like
  an export.
- **B7: no bridge-profile bump.** `match_quality` is a string column. The
  review fields are additive (damnit-api stays 0.3.2 on this unreleased
  branch).

## Checklist

- [x] Plan written first (this file), linked from `review-automation.md`
      and `plan-time-rule-real-data.md`
- [x] **B1, the bulk time rule:**
  - API `runner_up_gaps_s`;
  - `utils/review.clearTimeChoices` uses it and skips events with an
    instrument;
  - the page says why files are not offered;
  - `hzdr-evaluate-time-rule.py --rule bulk`, run on both days, numbers
    below;
  - tests: route, utils, script.
- [x] **B2/B3, the reader:**
  - `metadata/hzdr_aligner.py`: day indexes and decisions to claims by
    file, ledger cross-check (a link counts as confirmed only when the
    ledger still says `confirm`);
  - tests on the committed 2025-12-03 index (a trimmed copy in
    `tests/fixtures/`).
- [x] **B4/B5, the matcher:**
  - `reconcile_canonical_shots(aligner_claims=...)`;
  - `aligner_confirmed` in `MATCH_RANK`, CLAUDE.md's ladder updated;
  - the reasons and the suggestion;
  - tests for each evidence, each check, disagreement and stream.
- [x] **B6, settings:**
  - `--aligner-index-dir`, the setting and the trigger arguments;
  - the folder as a rebuild input;
  - tests.
- [x] **Measured:**
  - the bridge on 2025-12-03 with its LabFrog stand-in, numbers below;
  - the frontend label and the reason texts.
- [x] **Docs and next-on-server:**
  - `next-on-server.md` (set the folder; open or index the days);
  - `operations.md`, `api/.env.production.example`, `architecture.md`,
    `CLAUDE.md`, `review-automation.md`, `hzdr/CHANGELOG.md`.
- [x] **Gates:**
  - ruff, pyright at its 197 baseline, pytest, the coverage map;
  - vitest, lint:tsc, eslint, prettier, e2e;
  - acceptance.

  Result: ruff clean, pyright 197, pytest 1,101 passed / 33 skipped
  (`test_hzdr_aligner.py` and `hzdr_aligner.py` in the coverage map), vitest
  326, `lint:tsc`/eslint/prettier clean, HZDR e2e 8/8,
  `hzdr-local-acceptance.py` all OK and `--real-topology` passed.
  `next-on-server.sh`'s new check was run by hand: set with a reviewed date
  lacking an index, and not set.
- [ ] **GitLab:**
  - hzdr-combo `NEXT.md` (the rulings);
  - the fwkt-webapps DAMNIT page;
  - the PR #58 description.

## Not in this plan (a later plan, not started)

**Followed by** [plan-campaign-backfill.md](plan-campaign-backfill.md): this
year's campaigns from shot-aligner's Shotsheets and indexes, Vanlife first.

- ~~**Days with no watchdog.**~~ *Superseded on 2026-11-22 by
  [plan-campaign-backfill.md](plan-campaign-backfill.md) F4: the file events
  are made at build time, so no event-model change is needed.* Originally: a
  script that turns a day index into
  `hzdr-event-v1` file events, so DAMNIT has those files at all. It needs a
  new `attribution.method` value, and that changes the event model vendored
  into planet-watchdog and the shotcounter, so it is its own cross-repo
  change.
- **Days with no LabFrog shot records.** For now shot-aligner's own
  containers are the output for those days.

## Results

**B1** (`hzdr-evaluate-time-rule.py <day> --rule bulk --tolerance 120`, raw
clocks). Under "every shot", the share the page would offer if it offered
files. Since B1 it offers none:

| Day | Guard | Offered right | Offered wrong | Not offered |
| --- | --- | ---: | ---: | ---: |
| 2025-12-01 (truth matched, not reviewed) | candidates (before B1) | 253 | **328** | 952 |
| 2025-12-01 | every shot | 99 | 8 | 1,426 |
| 2025-12-03 (reviewed) | candidates (before B1) | 909 | **583** | 217 |
| 2025-12-03 | every shot | 19 | 0 | 1,690 |

Triggers, which B1 still offers, carry the shot authority's clock; none are in
these indexes.

**The bridge** (`hzdr-evaluate-time-rule.py <day> --rule aligner --tolerance
120`). The Shotsheet rows stand in for LabFrog records, with the row's Count as
LabFrog's local count; Counts restart in every set, so most days have
several shots with one Count, told apart by time. Raw instrument clocks:

| Day | Attached right | Attached wrong | Suggested right | Suggested wrong | Waiting |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025-12-03 (150 links, all confirmed) | **2,544** | **0** | 0 | 0 | 0 |
| 2025-12-01 (not reviewed) | 0 | 0 | 1,698 | 0 | 0 |

That is every shot file of both days, against 32 right on 12-03 for the
one-to-one rule at the same tolerance. It measures the join, the mapping and
the checks: the truth is shot-aligner's own links, so whether those are right
is shot-aligner's review, which is the point of R-2026-11-22a. The details
check agrees trivially here, since the stand-in records copy the Shotsheet;
on the server LabFrog's own values are compared.

Tests: 20 in `test_hzdr_aligner.py`:
- the reader;
- the evidence and each check;
- a counter reset;
- unconfirmed links and streams;
- the trigger;
- a real builder run with `--aligner-index-dir`.

Also 2 script tests in `test_hzdr_review_automation.py`, and 1 component
test.


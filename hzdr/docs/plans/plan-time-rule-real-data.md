# Plan: the one-to-one time rule against real shot days

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Follows
[plan-review-automation.md](plan-review-automation.md), whose results left
one thing open: *a run against a real shot day without authority numbers, to
see how many events the rule pairs and whether the 120 s tolerance suits
DRACO's shot spacing*. Same format: a box is ticked in the commit that does
the work.

## What real data there is

The maintainer (2026-11-21): real shot days with LabFrog exist for a few
campaigns on the server, and real shot-day data across all of bigdata is
indexed in shot-aligner (`tippey27/shot-aligner`). Committed in that
repository, and so usable here:

| Day | Campaign | What the index holds |
| --- | --- | --- |
| 2025-12-01 | Vanlife 2025_12 | `shot_aligner/index/2025_12_01.index.json`: every acquisition (17 instruments) with its raw instrument time and the aligner's corrected time, the Shotsheet rows with their typed times (`Zeit`), and each event's link to a row, **confirmed by a reviewer** |
| 2025-12-03 | Vanlife 2025_12 | `2025_12_03.index.json`: the same; 150 events, 2,768 acquisitions, 162 rows, 150 links confirmed |

Not committed (rebuilt on the server, or response/decision files only):
`contents.sqlite` (what each date folder holds across bigdata), the other
dates' day indexes, and the LabFrog exports. Those days are evaluated on
the server with the same script (below), not here.

## Decisions

- **E1: ground truth is the reviewer-confirmed links.** An acquisition's
  correct shot is the Shotsheet row its event is linked to (`band:
  confirmed`). Rows stand in for LabFrog records: both are a person's record
  of a shot, with a time typed or taken when it was entered.
- **E2: what DAMNIT would see.** Each acquisition is one producer event
  with no shot number (a watchdog file event), `timestamp` from the
  instrument's own clock, as it is on the wire; its stream is the
  instrument (D1). Each row is one LabFrog shot at its `Zeit`, read as
  Europe/Berlin. DAMNIT does not correct clocks, so the aligner's
  `corrected` time is **not** used, only reported beside it.
- **E3: measured, not tuned to pass.** For tolerances 30, 60, 90, 120 and
  180 s: how many acquisitions the rule pairs, how many of those are right
  and how many wrong, how many wait and why (`review_reason`). Plus the
  spacing between consecutive rows and each instrument's clock offset, which
  explain the result. A wrong pair is the number that matters: it is a
  silent error, where a waiting event costs a click.

## Checklist

- [x] Plan written first (this file), linked from `plan-review-automation.md`
- [ ] **Evaluation script** `api/scripts/hzdr-evaluate-time-rule.py`: reads
      one or more shot-aligner day indexes, builds the E2 events and shots,
      runs `reconcile_canonical_shots` with `time_match_one_to_one=True` per
      tolerance, scores against E1, prints a table and writes `--json`.
      No share access, no network; runs on the server against any
      `index/<date>.index.json`
- [ ] **Tests** for the script on a small synthetic index (a right pair, a
      wrong pair, a waiting event; the tolerance sweep), in
      `test_hzdr_review_automation.py`
- [ ] **Run** on 2025-12-01 and 2025-12-03; the results table and what it
      means written into this plan
- [ ] **Recommendation** from the numbers: whether to turn the rule on, and
      at which tolerance; any change it calls for in the rule itself is
      planned here first, not made silently
- [ ] **Docs and next-on-server:** `next-on-server.md` item 8 (the tolerance
      and how to evaluate a LabFrog day on the server),
      `review-automation.md`, `plan-review-automation.md` (results),
      `hzdr/CHANGELOG.md`
- [ ] **Gates** (ruff, pyright baseline, pytest, the coverage map) and PR #58
      description; hzdr-combo !117 if the recommendation changes the deploy
      steps

## Results and what is left

(Filled in at the end.)

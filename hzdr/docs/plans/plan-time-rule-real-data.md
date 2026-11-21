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
- [x] **Evaluation script** `api/scripts/hzdr-evaluate-time-rule.py`: reads
      shot-aligner day indexes, builds the E2 events (acquisitions, raw
      instrument time; auxiliary files too, which belong to no shot) and
      shots (rows keyed by their spreadsheet line, since Counts restart per
      set), runs `reconcile_canonical_shots` with the rule on per tolerance,
      and scores right / wrong / waiting (by reason) / auxiliary paired,
      with row spacing and each instrument's clock offset. `--truth
      matched` scores an unreviewed day against the aligner's own links
      (labelled NOT reviewed); `--clock corrected` uses the aligner's
      corrected times as an upper bound. No share, no network
- [x] **Tests:** 2 in `test_hzdr_review_automation.py` on a synthetic day
      (one instrument on time, one 4 min fast: 3 right, 2 wrong, 1 waiting;
      spacing, offsets, the truth switch)
- [x] **Run** on 2025-12-01 and 2025-12-03: results below
- [x] **Recommendation** from the numbers: below (R1 to R3). No change
      to the rule is made here; R2 and R3 need the maintainer's decision
- [x] **Docs and next-on-server:** `next-on-server.md` item 8 (leave the
      rule off; how to measure a day on the server) and the script's
      `labfrog` step (warns if the rule is on), `operations.md`,
      `api/.env.production.example`, `CLAUDE.md` (the script, the caveat),
      `review-automation.md`, `plan-review-automation.md` (results),
      `ui-backlog.md` (next steps), `hzdr/CHANGELOG.md`
- [x] **Gates:** ruff clean, pyright 197 (baseline), pytest 1078 passed /
      33 skipped (the new tests live in a module already in the coverage
      map); no frontend change in this round. PR #58 description and
      hzdr-combo !117 updated (the deploy step changed: the rule stays off)

## Results

`hzdr-evaluate-time-rule.py <day>.index.json --truth matched`, Europe/Berlin.
2025-12-01 has no reviewer decisions, so its truth is the aligner's own
links (101 high, 1 low confidence), marked *not reviewed*. 2025-12-03's 150
links were all confirmed by a reviewer. "Right", "wrong" and "waiting" count
shot files (acquisitions); no auxiliary file was paired in any run.

**Raw instrument clocks (what DAMNIT receives):**

| tolerance | 12-01 right | 12-01 wrong | 12-01 waiting | 12-03 right | 12-03 wrong | 12-03 waiting |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 s | 246 | **317** | 1,135 | 781 | **309** | 1,454 |
| 60 s | 402 | **301** | 995 | 106 | **46** | 2,392 |
| 90 s | 383 | **104** | 1,211 | 50 | **24** | 2,470 |
| 120 s | 264 | **12** | 1,422 | 32 | 0 | 2,512 |
| 180 s | 138 | 0 | 1,560 | 11 | 0 | 2,533 |

Of 1,698 (12-01) and 2,544 (12-03) shot files.

**The aligner's corrected clocks (an upper bound; DAMNIT has no such
correction):** 12-03 at 30 s: 1,239 right, 21 wrong; at 120 s, 67 right and 0
wrong. 12-01 at 90 s: 403 right, 0 wrong; at 120 s, 272 and 0.

**Why:**

- **Shots are close together.** The median row spacing is 60 s on 12-03
  (114 of 149 gaps under 120 s) and 180 s on 12-01 (25 of 101 under 120 s).
  Some rows share a minute.
- **The Shotsheet's `Zeit` is typed to the minute.** That alone is up to
  60 s of error.
- **Instrument clocks are far off and move.** On 12-03 the median offsets
  from `Zeit` run from -9 s (TP90, Lanex) to +34 s (TPS 90), +96 s (OAP Img)
  and +108 s (M1 Trans 800, M1 Spec, PM Mini Trans, Reflected 515). Within
  one instrument the offset spreads 59 to 118 s over the day; the aligner
  flags "8 diagnostic(s) changed recording offset mid-run".

So a small window pairs files to the neighbouring shot (silent errors), and
a window wide enough to swallow the clock error contains several shots, so
almost everything waits (`several_shots_in_tolerance`, the reason the page
now shows).

## Recommendation

- **R1, now: leave `TIME_MATCH_ONE_TO_ONE` off for watchdog file events.**
  At 90 s or less it makes silent errors: 21 to 56 % of its pairs are
  wrong. At 120 s or more it is almost always right (0 wrong on the reviewed
  day, 12 of 276 at 120 s on the unreviewed one), but it pairs only 0.4 to
  16 % of files.
  That is not worth a matching rule nobody watches. The pieces of PR #58 that
  need no setting carry the load meanwhile: the reasons, the suggestions,
  bulk confirm of clear cases, campaign suggestions, and `NEVER_SHOT_KINDS`.
  `next-on-server.md` item 8 now says so.
- **R2, needs a decision: do what makes shot-aligner work, not only its
  window.** shot-aligner pairs *events* (each shot's acquisitions grouped
  across instruments, around an anchor instrument, within 8 to 10 s) after
  fitting **each instrument's clock offset, segment by segment**. It pairs
  them with rows by sequence (Count) and time together. The one-to-one test
  is its last step, applied to clock-corrected event times. In DAMNIT that
  would be a new plan: estimate each stream's offset from pairs already
  certain (numbers, identity, a person's confirmations), match on corrected
  times, and group a shot's files before pairing.
- **R3, needs a decision and data: the rule for triggers only.** DRACO
  triggers carry the shot authority's clock, not an instrument PC's. These
  indexes hold no triggers, so this cannot be measured here. Evaluate a
  LabFrog shot day on the server (item 8); if triggers pair cleanly, add
  a setting that limits the rule to listed kinds (e.g. `draco.trigger`).

## What is left

- More days: the other dates' day indexes live on the server (shot-aligner
  builds `index/<date>.index.json` when a date is opened); a LabFrog day
  with DRACO triggers is the one that decides R3. The script runs there
  unchanged (`next-on-server.md` item 8).
- 2025-12-01 has never been reviewed; its numbers rest on the aligner's own
  pairing.

# Plan: Review matches made more automatic, the way shot-aligner does it

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Assessment and options:
[review-automation.md](review-automation.md). Format and matching rule taken
from shot-aligner (`tippey27/shot-aligner`): its `plan.md` (rulings first, a
box ticked in the commit that does the work, results and what is left at the
end) and its `labfrog._match_by_time`: *"a pair is one row and one shot, each
the other's only neighbour within the tolerance. Anything less is ambiguous,
not a match"*, every non-match reported as a finding with guidance.

## Rulings and decisions

- **R-2026-11-21 (maintainer, Kristin), in the session of 2026-11-21:** "I
  like all the options" (items 1 to 5 of review-automation.md §4) and "use
  how shot aligner does it". Read as an amendment of ruling A7: a time-only
  pair **may attach** when it passes shot-aligner's one-to-one rule. It is
  marked as such (`match_quality` `time_one_to_one`), and every event that
  does not pass stays in review with a stated reason. A7 stands for
  everything else: nearest time alone never attaches.
- **D1 (this plan): one stream at a time.** shot-aligner pairs a Shotsheet
  row, or one container's event, with a record. DAMNIT has several events per
  shot (a trigger, a file from each detector), so the one-to-one test runs
  within one *stream*: the same `source`, `kind` and instrument
  (`metadata.instrument.id`, else `metadata.producer.instance_id`, else
  none). An event pairs with a shot when that shot is its only shot within
  the tolerance, and it is the shot's only event of its stream within the
  tolerance. Events already matched by identity or number count as
  neighbours, so a shot never gets a second event of one stream by time.
- **D2 (this plan): behind a setting, off by default.**
  `DW_API_HZDR_BUILDER__TIME_MATCH_ONE_TO_ONE` (`--time-match-one-to-one`).
  Code, tests and other deployments keep A7's behaviour until it is set.
  fwkt-webapps turns it on in `api/.env` at deploy (deployment notes).
  `TIME_MATCH_AUTOASSIGN=true` still restores the old ladder exactly and
  takes precedence.
- **D3 (this plan): the tolerance is the existing one**
  (`DW_API_HZDR_BUILDER__MATCH_TOLERANCE_S`, 120 s), as shot-aligner uses
  its one `labfrogTimeTolerance` for both rules.
- **D4 (this plan): suggestions are never decisions.** Items 2 and 3 only
  pre-fill or preselect; a person confirms, and the note says on what
  evidence. Item 4 writes a decision *by rule*, named as such
  (`acknowledged_by: "rule:never_shot_kinds"`), visible under Resolved and
  undone by removing the kind from the setting.
- **D6 (this plan, found while placing it): numbered events never pair by
  time.** A trigger whose authority number LabFrog lacks keeps founding its
  trigger-only shot, as under A7; pulling it onto a neighbouring LabFrog shot
  by time was the bug A7 fixed (triggers 1 and 3 merged into shot 2). The
  one-to-one rule is for events *without* a number, which is what arrives
  until the shot authority is installed everywhere. An event whose watchdog
  attribution names candidates pairs only with one of them.
- **D5 (this plan): no bridge-profile bump.** `match_quality` is a string
  column; a new value changes no layout. damnit-api is already 0.3.2 on this
  branch, and the new API fields are additive.

## Checklist

A box is ticked in the commit that does the work.

- [x] Plan, rulings and decisions written down first (this file), linked
      from `review-automation.md` and `ui-backlog.md`
- [x] **Characterization first:** `tests/test_hzdr_review_automation.py`
      pins today's outcomes. A time-only trigger with LabFrog records is
      `ambiguous` with its nearest shot as the only candidate; of two shots
      in the tolerance **only the nearest is offered**; two equally near
      shots leave the event **`unmatched` with no candidate**; beyond the
      tolerance, and with no LabFrog record, `unmatched`; a unique authority
      number attaches. The two marked outcomes are gaps the findings item
      closes
- [x] **Item 5, the one-to-one time rule** (builder):
      `hzdr_nexus._pair_time_one_to_one` / `_one_to_one_pairs` after the
      per-event loop (pairs found on a snapshot, applied together), the D1
      streams (`_event_stream`), D6, `time_one_to_one` (3) in `MATCH_RANK`
      (the ranks above it move up by one; CLAUDE.md's ladder updated, held
      by `test_match_rank_docs.py`), `TIME_MATCH_ONE_TO_ONE` +
      `--time-match-one-to-one`, the trigger always passes it explicitly (so
      `hzdr-rebuild.py --print` shows it), the frontend label. 12 tests in
      `test_hzdr_review_automation.py`
- [x] **Findings with a reason** (builder, API, UI): every waiting event
      carries `review_reason` (`hzdr_nexus.REVIEW_REASONS`, set by
      `_set_review_reasons` from the same verdicts the one-to-one pass uses):
      `no_time`, `no_labfrog_record`, `no_shot_in_tolerance`,
      `several_shots_in_tolerance`, `shot_has_other_event`,
      `attribution_disagrees`, `time_rule_off`, `number_held_by_several`,
      `identity_conflict`. In the catalog's review record and
      `HZDRReviewEvent`; the page shows "Why it waits" with one line of
      guidance each (`REVIEW_REASON_TEXT`). Tests: 3 in
      `test_hzdr_review_automation.py`, 1 in `ReviewMatches.test.tsx`
- [x] **Item 2, suggestions from non-time evidence** (builder, API, UI):
      `hzdr_nexus._set_suggestions` writes `suggested_shot_key` +
      `suggestion_reason` (`watchdog_attribution`: the watchdog's
      `attribution.candidates` name exactly one candidate, R3;
      `instrument_free`: the only candidate without an event of the event's
      stream; disagreeing evidence suggests nothing). The page badges the
      suggested candidate and offers **Review the N** / **Confirm these N**
      before the clear time cases (an event is offered once), each note
      naming the evidence (`utils/review.suggestedChoices`, one `BulkConfirm`
      component for both). Tests: 3 builder, 1 component
- [x] **Item 3, a campaign for an unassigned shot** (API, UI): the review
      route's `campaign_suggestions` (`hzdr_routers._campaign_suggestions`,
      only when the source has unassigned shots): the nearest placed shot
      before and the nearest after on the same `shot_date` both in one
      campaign, naive times read in the campaign zone. The page pre-fills
      the row ("Suggested: the shots before and after it that day are in
      X") and offers **Assign the N suggested** behind a second click, each
      ruling's note saying why. Tests: 1 route, 1 component
- [x] **Item 4, kinds that are never a shot** (builder, settings):
      `DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS` (JSON list) ->
      `--never-shot-kind` (repeatable) -> `write_sources_catalog`'s
      `_acknowledge_never_shot_kinds`, after the stored decisions: an
      unmatched, undecided event of a listed kind is flagged acknowledged by
      `rule:never_shot_kinds` with a note naming the kind (Resolved shows
      who). Ambiguous events and a person's decision are left alone; nothing
      goes into the sidecar, so removing a kind reopens its events at the
      next build. Tests: 3
- [x] **Item 1, the campaign schedule** (operations): `next-on-server.sh`'s
      `labfrog` step runs `check_campaign_schedule`: not set (warning), set
      but the file missing (FAIL), older than 7 days (warning), else OK;
      read through the API's settings code, only the file's name and age
      printed. `operations.md` has a section on the schedule and the two
      new rules; `next-on-server.md`'s step table says so. Checked by hand
      with the three cases
- [x] **Docs:** `architecture.md` (step 6a, the stream rule, the
      reasons, suggestions, never-shot kinds), `CLAUDE.md` (match ranks with
      `time_one_to_one`, the two settings, the review fields),
      `api/.env.production.example`, `operations.md` (section on the
      schedule and the rules), `next-on-server.md`, `review-automation.md`
      (status), the in-app Docs page, `hzdr/CHANGELOG.md`
- [x] **Gates:** ruff clean; pyright 197 (baseline); pytest 1076 passed,
      33 skipped; `test_hzdr_review_automation.py` in
      `scripts/docs/refresh_coverage_map.py` (`test_coverage_docs.py`
      passes); vitest 323 passed; `lint:tsc`, eslint, prettier clean; HZDR
      e2e 8/8; `hzdr-local-acceptance.py` 11/11 OK and `--real-topology`
      "All real-topology rehearsal steps passed"
- [x] **GitLab notes:** hzdr-combo `NEXT.md` (the ruling, for its rulings
      record) and the fwkt-webapps DAMNIT page
- [x] PR #58 description: what changed, deployment notes (the setting to
      turn on, a rebuild to apply it)

## Results and what is left

- **Done:** every box above, each in its own commit on PR #58. 27 new tests
  in `test_hzdr_review_automation.py` (6 characterization, 12 one-to-one, 3
  reasons, 3 suggestions, 1 campaign suggestion, 3 never-shot kinds) and 4
  component tests.
- **Behaviour on deploy without new settings:** no change in what the
  builder attaches (both rules are off by default). The page gains the
  reasons, the suggestions and the campaign suggestions at once. The reasons
  and suggestions appear on a campaign once it is rebuilt.
- **For the maintainer, at deploy:** set
  `DW_API_HZDR_BUILDER__TIME_MATCH_ONE_TO_ONE=true` (and
  `NEVER_SHOT_KINDS` once the test-fire kinds are known), restart, rebuild
  (`scripts/hzdr-rebuild.py`), then check Review matches: events now
  attached show `time_one_to_one` in their shot's events.
- **Not done here, needs real data:** a run against a real shot day
  without authority numbers, to see how many events the rule pairs and
  whether the 120 s tolerance suits DRACO's shot spacing. shot-aligner's
  equivalent check is also still open (its plan: "a run against a real
  schema-14 export").
- **Left as it was, noted:** under A7 a time proposal still offers only the
  nearest shot as a candidate (the reason `several_shots_in_tolerance` now
  says when others were close). Offering all shots in the tolerance would
  change what reviewers see on every campaign; that is a separate decision.
  The never-shot rule closes events in the catalog only; it writes nothing
  to the review sidecar, by design (D4).

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
- [ ] **Item 5, the one-to-one time rule** (builder):
      `hzdr_nexus` pass after the per-event loop, the D1 streams,
      `time_one_to_one` in `MATCH_RANK` between `nearest_time` and
      `shot_number_time_window`, setting + CLI flag, the trigger passes it,
      `hzdr-rebuild.py --print` shows it
- [ ] **Findings with a reason** (builder, API, UI): every review event
      carries `review_reason`, as shot-aligner's findings do: `no_time`,
      `no_shot_in_tolerance`, `several_shots_in_tolerance`,
      `shot_has_other_event` (the shot's nearest event of this stream is
      another), `time_rule_off` (one-to-one would pair it, setting off),
      `number_held_by_several`, `attribution_candidates`. The page shows
      each with one line of guidance
- [ ] **Item 2, suggestions from non-time evidence** (builder, API, UI):
      `suggested_shot_key` + `suggestion_reason` on an ambiguous event when
      exactly one candidate is named by the watchdog's
      `attribution.candidates` (authority numbers, R3) or is the only one
      without that instrument yet; the page preselects it, and **Confirm the
      N suggested** confirms them, each note naming the evidence
- [ ] **Item 3, a campaign for an unassigned shot** (API, UI): the review
      route suggests the campaign of the nearest shots before and after it on
      the same local day when both are in one campaign; the page pre-fills it
      and **Assign the N suggested** assigns them; nothing without both
      neighbours agreeing
- [ ] **Item 4, kinds that are never a shot** (builder, settings):
      `DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS` (a JSON list of `kind`s); their
      unmatched events are acknowledged by rule (D4) and listed under
      Resolved; a matched event of such a kind is left alone
- [ ] **Item 1, the campaign schedule** (operations): `next-on-server.sh`
      reports whether `CAMPAIGN_SCHEDULE` is set, the file exists and how old
      it is; `operations.md` says why it matters while triggers lack the
      authority's number
- [ ] **Docs:** `architecture.md` (the ladder, the stream rule, the new
      rank), `CLAUDE.md` (match ranks, settings, review fields),
      `api/.env.production.example`, `review-automation.md` (status),
      the in-app Docs page, `hzdr/CHANGELOG.md`
- [ ] **Gates:** ruff, pyright at its baseline (197), full pytest, the new
      test modules in `scripts/docs/refresh_coverage_map.py`, vitest,
      `lint:tsc`, eslint, prettier, the HZDR e2e specs,
      `hzdr-local-acceptance.py` and `--real-topology` (the builder changed)
- [ ] **GitLab notes:** hzdr-combo `NEXT.md` (the ruling, for its rulings
      record) and the fwkt-webapps DAMNIT page
- [ ] PR #58 description: what changed, deployment notes (the setting to
      turn on, a rebuild to apply it)

## Results and what is left

(Filled in at the end.)

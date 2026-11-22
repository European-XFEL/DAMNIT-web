# Review matches: how it works, and making it more automatic

Assessment of 2026-11-21, after DAMNIT PR #58. Status: **all of it is done**
on PR #58: the first tier (§3), and every item of §4, which the maintainer
chose on 2026-11-21 with shot-aligner's one-to-one time rule for item 5.
Plan, rulings and checklist: [plan-review-automation.md](plan-review-automation.md).
Measured on real shot days afterwards
([plan-time-rule-real-data.md](plan-time-rule-real-data.md)): the one-to-one
rule stays **off** for watchdog files (instrument clocks run up to two
minutes off); the rest needs no setting. Next:
[plan-aligner-bridge.md](plan-aligner-bridge.md), shot-aligner's confirmed
decisions as evidence, and a fix to the bulk time rule.

## 1. How it works today

The builder (`hzdr_nexus.reconcile_canonical_shots`) leaves three kinds of
case to a person. They reach the page through
`GET /metadata/hzdr/sources/{key}/review` (`hzdr_routers.get_hzdr_review`):

| Queue | How a case arises | What a person does | Stored as |
| --- | --- | --- | --- |
| **Ambiguous** | An event fits several shots, or only by time. Since ruling A7 (2026-09-30, `TIME_MATCH_AUTOASSIGN=false`), a time-based rank never attaches: it proposes candidates. A watchdog's `attribution.candidates` are added as review choices, never as a match (`_attribution_candidate_keys`) | Confirm one of `candidate_shot_keys` (`POST .../review/{event_id}/confirm`) | A decision in the `.review.jsonl` sidecar, merged at the next build |
| **Unmatched** | An event fits no shot at all | Acknowledge it as no shot (`.../dismiss`) | The same sidecar |
| **Unassigned** | A shot that no LabFrog record claims, the campaign schedule does not place, and no ruling names (`experiment_id_source == "unassigned"`) | Assign a campaign (`POST /metadata/hzdr/experiment-rulings`), which asks the running trigger for a rebuild | An experiment ruling in the sidecar |

The page helps in only one way: it highlights the candidate closest in time.
Every decision was one click per event or shot.

## 2. Where the work comes from

- **Ambiguous** grows with every trigger whose authority number is not held
  by exactly one shot, and with every file event a watchdog attributed by time
  (`attribution.method = trigger_window`). That follows directly from
  A7's "never guess", and it is intended. The work per case is what can shrink.
- **Unassigned** grows when shots arrive without a LabFrog record or a
  schedule entry. The cheapest fix is upstream: a maintained campaign schedule
  (`DW_API_HZDR_BUILDER__CAMPAIGN_SCHEDULE`, LabFrog's
  `labfrog-campaign-schedule-v1` export) routes these shots with no person
  involved.
- **Unmatched** is mostly test fires and sources that never belong to a shot.

## 3. Done (no change to what the builder decides)

- **Refresh** (PR #58): the page reads the summaries every 30 s and reloads
  the open campaign only when its counts changed.
- **Candidate gaps from the API and bulk confirm of clear time cases**
  (PR #58), see §3a.
- **Batch decisions** (PR #58):
  - **Acknowledge all N** for one producer and kind, behind a second click.
  - **Assign several** for every waiting unassigned shot, or one day's.

  Each is still one recorded decision per event or shot, with the reviewer's
  name, through the existing routes.

## 3a. Until every trigger carries the shot authority's number

Until the shot authority is installed everywhere, new events may arrive with
`shot_number: null`. What the builder does with them:

- **With LabFrog records**, such an event can match only by time, which
  A7 never lets attach on its own. Every one becomes **ambiguous**, with the
  shots within the tolerance as candidates.
- **Without LabFrog records**, it cannot form an event-built shot (those are
  grouped by number) and stays **unmatched**.
- **Campaign routing** still works through the campaign schedule, which goes
  by trigger time. Resolution step 1 (the export's authority numbers) does
  not apply.

Two ways through that period:

1. **Bulk confirm of clear cases** (done, PR #58). The API now gives each
   candidate's gap in the campaign's time zone (`candidate_gaps_s`). Before
   this, LabFrog's naive local times left the browser unable to compute any
   gap. Where one shot is within 30 s and every other candidate is 2 min or
   more further, the page lists those events. A person confirms them in one
   go, each decision noting why. The decisions are stored, so they survive
   when the authority arrives.
2. **`DW_API_HZDR_BUILDER__TIME_MATCH_AUTOASSIGN=true`** (setting only,
   reversible). This restores the earlier ladder: the builder attaches by
   nearest time within the tolerance (120 s), with no person involved. It
   is fast, but wrong when shots are closer together than the tolerance or a
   clock is off, and it is the exact behaviour ruling A7 turned off. Setting
   it back to `false` returns the unconfirmed time matches to review at the
   next build (nothing is stored). Use it only as a deliberate, dated
   decision.

Recommended: option 1, with the campaign schedule kept current.

## 4. Next steps that need a decision

In the order recommended:

1. **Keep the campaign schedule current** (operations, no code). Check that
   `CAMPAIGN_SCHEDULE` is set on fwkt-webapps and that LabFrog's Beamtime Setup
   exports it. Each beamtime it covers produces no unassigned shots.
2. **Suggest a candidate from non-time evidence** (builder, catalog, API, UI;
   no change to matching). For each ambiguous event the builder records
   `suggested_shot_key` and `suggestion_reason` when evidence other than time
   singles out one candidate. The page preselects that candidate and offers
   **Confirm the N suggested**, still a person's click. A suggestion is a
   review aid only, so it needs no new match rank.
   *Decision:* which evidence counts. Candidates:
   - a watchdog attribution by `filename_counter` or `manual` naming exactly
     one candidate (by its authority number, ruling R3);
   - the event's `instrument.id` missing from exactly one candidate.
3. **Suggest a campaign for an unassigned shot** from its neighbours: the
   nearest shots before and after it on the same day both belong to campaign
   X. This is time-based, so it may only ever pre-fill the field, like the
   closest-in-time highlight. *Decision:* is a time-based suggestion
   acceptable here?
4. **Kinds that are never a shot** (a setting, for example
   `DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS`). The builder would record their
   events as acknowledged by rule, with the rule named, instead of listing
   them as unmatched. *Decision:* which kinds, and whether a rule may write
   a decision at all.
5. **Attach on a watchdog's file counter** (a new match rank between
   `exact_day_shot_number` and `event_identity`). The builder would attach a
   file event whose `filename_counter` attribution names exactly one shot.
   This removes the most cases, but it decides without a person, which is
   ruling A7's territory. *Decision:* a new ruling. Without one, item 2
   gives most of the benefit.

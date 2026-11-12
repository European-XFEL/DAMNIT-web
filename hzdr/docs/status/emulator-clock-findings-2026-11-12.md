# Clock emulator findings - 2026-11-12

Local synthetic evidence, not a deployed failure. No runtime fix is included.
The cross-repository scenarios live on hzdr-combo's
`planning/emulator-test-plan` branch under `combo/emulation/`.

## D-C01 - undecidable bucket event missing from catalogue review

Observed on DAMNIT `25109374286a51479918192be598092dc2833fbc`, scenario C5.
After a +300 s step while a real watchdog pre-shot file was pending, the
worker honestly emitted `no_trigger`, with no shot number. The authority,
Kafka, durable consumer, LabFrog intake/claim/export and builders were real.

The four expected broker events reached the spool once each; replay preserved
the spool. The undecidable file is also present in the unassigned master's
`/entry/source_events`, with no shot key. The unassigned source in
`hzdr_sources.json` has **zero shots, zero review events and an all-zero match
summary**. Both builds reproduce the omission. No event was lost from the
durable spool; the finding is catalogue/review visibility.

Scratch evidence: `/tmp/hzdr-clocks-z6hjxuhe/C5/`, including `receipt.json`,
`build-G1.json`, `build-G2.json`, `built/hzdr_sources.json` and the unassigned
master. File: `incoming/pre_shot/shot_000001.Irr8.txt`. The compact committed
cross-repo clock report will retain receipt hashes and the finding reference.

Likely seam to investigate: `reconcile_canonical_shots()` takes the
`_canonical_from_event_identities()` path when a bucket has no LabFrog rows.
An event without a usable identity survives in the returned events, but lacks
the `ambiguous`/`unmatched` status that `write_sources_catalog()` uses to select
review events. This is an inference from code plus the produced artifacts.

Acceptance for a later fix: an undecidable event appears exactly once in
catalogue review and master, with no invented shot number or campaign; replay
keeps that state stable. Cover `no_trigger`, `ambiguous`, `unregistered` and
`rescan` in a bucket with no LabFrog rows. Preserve source identity and the
existing rule that a typed number never becomes an authority number.

The harness does not patch statuses or fabricate a catalogue row to turn the
scenario green. Fix and test this seam in DAMNIT through its normal review.

### Fix (2026-11-12, not yet re-run on the real chain)

The inferred seam was the cause. Without LabFrog rows,
`_canonical_from_event_identities()` skipped an event with no shot number and
left it with no `match_status`, so `write_sources_catalog()` never selected it.
`reconcile_canonical_shots()` now ends that path with
`_offer_unplaced_events_for_review()`: such an event leaves `unmatched`, or
`ambiguous` when its `attribution.candidates` name shots of the same build
(offered as `candidate_shot_keys`, never attached). No shot key, shot number or
campaign is invented, and the event keeps its `event_id`.

Regression tests: `no_trigger`, `ambiguous`, `unregistered` and `rescan` in a
bucket with no LabFrog rows, through master and catalog, twice
(`test_hzdr_campaign_resolution.py`); the attached-once-or-in-review-once rule
with and without LabFrog rows; a later authority claim taking the event out of
review; and the C5 situation through the real multi-campaign builder
(`test_hzdr_multi_campaign.py`).

**Still open:** the unchanged C2/C3/C5/C11 schedules have not been run against
this fix. They need the emulator's Docker stack; the session that made the fix
had no Docker daemon. Until those receipts exist, D-C01 is fixed in unit and
builder tests only.

## Recommended improvement order

1. Give every retained undecidable event a review-visible state at one
   reconciliation boundary, including the no-LabFrog unassigned-bucket path.
   Derive the catalogue and master from the same normalized event set; do not
   invent a shot or campaign to make a row visible.
2. Add an invariant test across spool, master and catalogue: every retained
   event is either attached to one canonical shot or present in review once.
   Exercise an empty bucket, null identity, replay and a later legitimate
   authority claim. Keep event IDs unchanged.
3. Preserve the authority-first matcher. C9's real +180 s consumer-clock
   control retained correct authority matches while catalogue time deltas
   exposed about 177-180 s discrepancies. Make those discrepancies easy to
   review; do not replace a known authority identity with nearest-time guessing.
4. Keep clock-client qualification distinct from application correctness.
   Blanket preload produced heartbeat/condition-wait failures in exploratory
   runs. Record the active clock scope, broker offsets and elapsed-time
   evidence before classifying that behavior as a DAMNIT defect.

The first change should be a small reconciliation/catalogue fix with a
regression test, followed by the unchanged C2/C3/C5/C11 real-chain receipts.
It should not alter spool acknowledgement, SciCat identity or deployed state.

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

### Fix (2026-11-12)

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

### Real-chain re-run (2026-11-12, a cloud session, not the laptop of the first runs)

The unchanged schedules of hzdr-combo `planning/emulator-test-plan` (`854d1a6`)
were run against this fix: DAMNIT `a5ebbe65`, planet-watchdog `master`
`cf3addc7` (the same runtime source hash as the `6c75fec` the first runs
used), LabFrog `43ffa6b5`, labfrog-sqlite-tools `d14e390f`. Local emulation
only: one Linux container, local folders, fake SciCat, emulated triggers.

| Case | Result | What the receipt says | Receipt SHA-256 (first 12) |
| --- | --- | --- | --- |
| C5, DAMNIT `main` `bec39916` (control) | fail | `catalogue_file_shots loses or invents files`: D-C01 reproduced | `71883e8acc62` |
| C5 | **pass** | 4 of 4 records; build and replay agree | `f96df62874b7` |
| C3 | **pass** | 8 of 8 | `ecc53358c03b` |
| C11 | **pass** | 8 of 8 | `f905872d00b8` |
| C2 (strengthened) | fail | report and replay complete; the one failure left is the producer's wrong shot (W-C04, planet-watchdog) | `3c71ad124f1f` |
| G1/G2 | pass | 48 of 48 | `a85397d72302` |
| C1, C6, C10 | pass | | `b58cf95f9bb5`, `851e32a1df05`, `3411103970cd` |
| C4 (calibrated, all 60 shots) | pass | 240 of 240; measured drift 0.99999 s/min | `8a5cb77a6eed` |
| C7 | fail | duplicate emission (W-C02, planet-watchdog) | `cda867b71d3c` |
| C8 | fail | wrong shot across midnight (W-C03, planet-watchdog); one worker needed SIGKILL | `8f4f879f8a19` |
| C9 | fail | no verdict failure; one worker needed SIGKILL at teardown (the W-C01 shutdown question) | `0c229744ba70` |

So D-C01 is closed on the real chain: C3, C5 and C11 pass, and C2 no longer
has a catalogue failure. Every remaining red case is a planet-watchdog
finding or the harness's teardown, not DAMNIT.

One substitution: `ghcr.io/shopify/toxiproxy:2.9.0` could not be pulled
there, so the image was built locally from the upstream v2.9.0 release binary
(`toxiproxy-server-linux-amd64`, SHA-256 `8468ff159d95...`, as in the
release's `checksums.txt`). The scratch receipts were not kept; the hashes
above are all that remains of them, so combo's evidence file should take its
own re-run rather than cite these.

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

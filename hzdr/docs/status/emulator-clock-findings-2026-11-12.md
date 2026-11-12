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

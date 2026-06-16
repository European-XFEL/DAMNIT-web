# Handoff

Updated: 2026-06-16

## Current State

- Sibling repository changes were tested and pushed.
- Current cross-repo branches add LabFrog `experiment_id` derivation from the
  MediaWiki campaign choice and preserve that field through the
  labfrog-sqlite-tools SQLite/NeXus pipeline.
- DAMNIT's canonical models, adapters, builder, API, frontend views, and offline
  four-source integration test are implemented.
- Full DAMNIT API suite: `139 passed, 1 skipped`.
- LabFrog SQLite tools: `60 passed`.
- PLANET Watchdog: `17 passed`.
- Frontend checks (`lint:tsc`, `lint:eslint`) ran successfully.
- Confirm Matches is real: `/link-shot-records` calls
  `GET /hzdr/sources/{key}/review`, `POST .../confirm`, `POST .../dismiss`
  against the live catalog; the client-side-fabrication version of that page
  is gone.
- `hzdr_sources.json` is written atomically (temp file + rename) at every
  write site; staged-event dedup by `event_id` and corrupt-JSONL handling are
  explicit and tested.
- `hzdr-hdf5-builder.py` now uses a PID-stamped single-writer lock next to
  the output NeXus file and reclaims stale locks when the holder process is
  gone.
- `api/examples/*.example.json` mirrors the shared normalized source-event
  examples used by `asapo-for-hzdr-damnit` and planet-watchdog's
  normalized-event fixtures. `api/examples/Example_Campaign_06.2026.light.sqlite`
  is a lightweight anonymized LabFrog SQLite fixture generated from the real
  export schema with modified example rows.
- The local `asapo-for-hzdr-damnit` harness now proves claim-before-ack,
  flush/fsync-before-ack, campaign-scoped group offsets, and replay dedup.
  It is still an emulator/test harness, not the production supervised
  consumer.
- `api/scripts/hzdr-local-acceptance.py` proves the full local vertical slice
  (emulator events through Confirm Matches) over a real FastAPI app, with no
  sibling repo or broker required. See [testing.md](testing.md) and
  [second-opinion.md](second-opinion.md) Section 8.
- Flow Monitor shows a read-only per-source review status panel (staged/
  matched/ambiguous/unmatched/confirmed/dismissed counts, last rebuild time,
  export path) - presentation only, no new staging/matching logic.

## Start Next

1. Obtain one synchronized real capture for `Solenoid Beamline Tests 01.2025`:
   LabFrog export, ASAPO event, Watchdog event, DRACO message, and TANGO shot
   counter.
2. Add the missing canonical fields to the live DRACO/TANGO publisher.
3. Implement durable campaign spooling and acknowledge-after-flush consumers
   in production. The local ASAPO harness proves the ordering/dedup pattern,
   but no supervised production consumer is wired into DAMNIT yet.
4. Decide whether to merge catalog-edit state (confirm/dismiss, manual shot
   corrections) back in on rebuild, or keep documenting it as a stopgap until
   the durable spool exists - no decision made yet
   ([second-opinion.md](second-opinion.md) Section 7).
5. Run the go-live replay in [integration-roadmap.md](integration-roadmap.md).

The canonical model is summarized in [architecture.md](architecture.md). Avoid
adding new matching logic in producer repositories.

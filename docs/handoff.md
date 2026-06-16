# Handoff

Updated: 2026-06-13

## Current State

- Sibling repository changes were tested and pushed.
- DAMNIT's canonical models, adapters, builder, API, frontend views, and offline
  four-source integration test are implemented.
- Full DAMNIT API suite: `106 passed, 1 skipped`.
- LabFrog SQLite tools: `58 passed`.
- PLANET Watchdog: `17 passed`.
- Frontend checks ran successfully.

## Start Next

1. Obtain one synchronized real capture for `Solenoid Beamline Tests 01.2025`:
   LabFrog export, ASAPO event, Watchdog event, DRACO message, and TANGO shot
   counter.
2. Add the missing canonical fields to the live DRACO/TANGO publisher.
3. Implement durable campaign spooling and acknowledge-after-flush consumers.
4. Wrap the existing builder with deduplication, locking, validation, and atomic
   publication.
5. Run the go-live replay in [integration-roadmap.md](integration-roadmap.md).

The canonical model is summarized in [architecture.md](architecture.md). Avoid
adding new matching logic in producer repositories.

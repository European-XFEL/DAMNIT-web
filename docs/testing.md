# Testing

## Verified

As of 2026-06-16:

| Repository | Result |
| --- | --- |
| DAMNIT API | `136 passed, 1 skipped` |
| DAMNIT HZDR integration collection | `25 passed` |
| LabFrog SQLite tools | `58 passed` |
| PLANET Watchdog focused suite | `17 passed` |
| ASAPO harness | Verified and pushed |

`api/tests/test_hzdr_integration.py` is the offline system-contract test. It
combines LabFrog, ASAPO, Watchdog, and DRACO inputs for
`Solenoid_Beamline_Tests_01.2025`, then checks matching, canonical NeXus output,
catalog loading, raw arrays, and API previews.

`api/scripts/hzdr-local-acceptance.py` is the local HTTP acceptance check:
emulator events -> `HZDREventV1` -> JSONL staging -> catalog rebuild ->
review API -> Confirm Matches -> export hook, all proven over a real FastAPI
app via `TestClient`, with no sibling repo, Docker, Mongo, Kafka, or ASAPO
required. See [second-opinion.md](second-opinion.md) Section 8 for what it
covers and why it is not a synthetic-but-fabricated test.

## Commands

```powershell
cd api
Copy-Item .env.test.example .env -Force
uv run pytest --basetemp "$env:TEMP\damnit-web-hzdr-pytest"
uv run ruff check src tests scripts
uv run python scripts/hzdr-local-acceptance.py
```

```powershell
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm lint:prettier
pnpm lint:eslint
pnpm lint:tsc
pnpm build:app
```

`scripts/test.ps1` (repo root) runs the API ruff/pytest steps above in one
go - it `cd`s into `api/` itself and copies `.env.test.example` to `.env` if
missing, so it is safe to run from the repo root. Pass `-WithAcceptance` to
also run `hzdr-local-acceptance.py`.

## Still Needed

1. Build DAMNIT from current real sibling-repository artifacts.
2. Run Kafka and ASAPO publish/consume/restart roundtrips.
3. ~~Prove duplicate replay~~ done at the in-process reconcile level
   (`reconcile_canonical_shots` deduplicates by `event_id`, tested in
   `test_hzdr_nexus.py`) - durable-spool-level replay (across process
   restarts, transport-level dedup/position tracking) is still needed and is
   a different problem; see [second-opinion.md](second-opinion.md) Section 5
   item 6.
4. ~~Add HTTP acceptance tests against a running generated catalog~~ done -
   `api/scripts/hzdr-local-acceptance.py`.
5. Add Playwright coverage for campaign, shot, provenance, and previews.
6. Replay the captured pilot and report match/deduplication counts.

Keep live infrastructure tests separate from deterministic unit tests.

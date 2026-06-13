# Testing

## Verified

As of 2026-06-13:

| Repository | Result |
| --- | --- |
| DAMNIT API | `106 passed, 1 skipped` |
| DAMNIT HZDR integration collection | `25 passed` |
| LabFrog SQLite tools | `58 passed` |
| PLANET Watchdog focused suite | `17 passed` |
| ASAPO harness | Verified and pushed |

`api/tests/test_hzdr_integration.py` is the offline system-contract test. It
combines LabFrog, ASAPO, Watchdog, and DRACO inputs for
`Solenoid_Beamline_Tests_01.2025`, then checks matching, canonical NeXus output,
catalog loading, raw arrays, and API previews.

## Commands

```powershell
cd api
Copy-Item .env.test.example .env -Force
uv run pytest --basetemp "$env:TEMP\damnit-web-hzdr-pytest"
uv run ruff check src tests scripts
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


## Still Needed

1. Build DAMNIT from current real sibling-repository artifacts.
2. Run Kafka and ASAPO publish/consume/restart roundtrips.
3. Prove duplicate replay and interrupted-build recovery.
4. Add HTTP acceptance tests against a running generated catalog.
5. Add Playwright coverage for campaign, shot, provenance, and previews.
6. Replay the captured pilot and report match/deduplication counts.

Keep live infrastructure tests separate from deterministic unit tests.

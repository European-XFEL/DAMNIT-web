# Testing

## Verified

As of 2026-06-17:

| Repository | Result |
| --- | --- |
| DAMNIT API | `150 passed, 1 skipped` |
| LabFrog SQLite tools | `60 passed` |
| PLANET Watchdog focused suite | `17 passed` |
| shotcounter (`feature/hzdr-canonical-trigger-event`) | `18 passed` (1 NTP-tolerance test deselected) |
| ASAPO harness | `5 passed` |

`api/tests/test_hzdr_integration.py` is the offline system-contract test. It
combines LabFrog, ASAPO, Watchdog, and DRACO inputs for
`Solenoid_Beamline_Tests_01.2025`, then checks matching, canonical NeXus output,
catalog loading, raw arrays, and API previews. A second trigger fixture exercises
the flat `hzdr-event-v1` Kafka envelope that shotcounter's branch emits (no
`processed_message` wrapper).

`api/scripts/hzdr-local-acceptance.py` is the local HTTP acceptance check:
emulator events → `HZDREventV1` → JSONL staging → catalog rebuild →
review API → Confirm Matches → export hook, all proven over a real FastAPI
app via `TestClient`, with no sibling repo, Docker, Mongo, Kafka, or ASAPO
required.

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
go — it `cd`s into `api/` and copies `.env.test.example` to `.env` if missing.
Pass `-WithAcceptance` to also run `hzdr-local-acceptance.py`.

## Still Needed

1. Build DAMNIT from current real sibling-repository artifacts (real LabFrog
   export + real broker events).
2. Run Kafka roundtrip and restart/replay for planet-watchdog and shotcounter.
3. Run ASAPO publish/consume/restart roundtrip with the production SDK
   consumer (harness proves the pattern; production consumer not yet built).
4. Add Playwright coverage for campaign, shot, provenance, and preview views.
5. Replay the captured pilot and report match/deduplication counts against the
   go-live gate in [integration-roadmap.md](integration-roadmap.md).

Keep live infrastructure tests separate from deterministic unit tests.

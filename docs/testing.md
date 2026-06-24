# Testing

## Verified

As of 2026-06-24:

| Repository | Result |
| --- | --- |
| DAMNIT API | `185 passed, 1 skipped` |
| LabFrog SQLite tools | `60 passed` |
| DAQ File Watchdog focused suite | `17 passed` |
| shotcounter (`feature/hzdr-canonical-trigger-event`) | `18 passed` (1 NTP-tolerance test deselected) |
| ASAPO harness | `5 passed` |

`api/tests/test_hzdr_integration.py` is the offline system-contract test. It
combines LabFrog, ASAPO, Watchdog, and DRACO inputs for
`Solenoid_Beamline_Tests_01.2025`, then checks matching, canonical NeXus output,
catalog loading, raw arrays, and API previews. A second trigger fixture exercises
the flat `hzdr-event-v1` Kafka envelope that shotcounter's branch emits (no
`processed_message` wrapper).

`api/tests/test_hzdr_spool.py` tests the durable spool consumer end-to-end
using a live in-process broker (loaded from the asapo-for-hzdr-damnit sibling
repo). Covers: claim→write-fsync→ack cycle, no-ack-without-write, dedup by
`event_id`, campaign offset isolation, and replay dedup surviving consumer
restart. 11 tests; skipped automatically if the sibling repo is not present.

`api/scripts/hzdr-local-acceptance.py` is the local HTTP acceptance check:
emulator events → `HZDREventV1` → JSONL staging → catalog rebuild →
review API → Confirm Matches → export hook, all proven over a real FastAPI
app via `TestClient`, with no sibling repo, Docker, Mongo, Kafka, or ASAPO
required.

## Test Coverage Map

`scripts/test-all.ps1` runs every HZDR suite with `pytest-cov`, refreshes each
sibling repo's own per-area coverage map, and regenerates the combined table
below. Coverage is on by default; pass `-NoCoverage` to skip it:

```powershell
.\scripts\test-all.ps1            # run all suites, refresh coverage maps
.\scripts\test-all.ps1 -NoCoverage
```

<!-- coverage-summary-start -->

Overall line coverage per repo, from the latest `scripts/test-all.ps1` run.
Each suite writes a `cover/coverage.json`; rows show `No coverage data` until
that repo has been run with coverage. Per-area detail lives in each repo's own
coverage map (`CONTRIBUTING.md` / `docs/CONTRIBUTING.md`).

| Repo | Coverage | Package | Suite |
| --- | --- | --- | --- |
| DAMNIT API | <progress value="77" max="100">77%</progress> 77% Good | `damnit_api` | `api/tests` |
| LabFrog | <progress value="77" max="100">77%</progress> 77% Good | `labfrog` | `tests` (non-webkit) |
| LabFrog SQLite tools | <progress value="80" max="100">80%</progress> 80% Good | `labfrog_sqlite_tools` | `tests` |
| DAQ File Watchdog | <progress value="45" max="100">45%</progress> 45% Needs attention | `watchdog_core` | `tests` |
| shotcounter | <progress value="81" max="100">81%</progress> 81% Good | `hzdrTangoDSShotcounter` | `tests` (non-ntp) |
| ASAPO harness | <progress value="42" max="100">42%</progress> 42% Needs attention | `tools` | `tests` |

<!-- coverage-summary-end -->

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
2. Run Kafka roundtrip and restart/replay for GAQ-File-Watchdog (planet-watchdog) and shotcounter.
3. Run ASAPO publish/consume/restart roundtrip with the production ASAPO SDK
   wired into `AsapoSpoolConsumer` (consumer loop is built; SDK swap is the
   remaining step).
4. Add Playwright coverage for campaign, shot, provenance, and preview views.
5. Replay the captured pilot and report match/deduplication counts against the
   go-live gate in [integration-roadmap.md](integration-roadmap.md).

Keep live infrastructure tests separate from deterministic unit tests.

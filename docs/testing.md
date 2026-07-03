# Testing

## Verified

As of 2026-06-30:

| Repository | Result |
| --- | --- |
| DAMNIT API | `213 passed, 4 skipped` |
| LabFrog SQLite tools | `89 passed` |
| DAQ File Watchdog full suite | `210 passed, 3 skipped` |
| shotcounter (`feature/hzdr-canonical-trigger-event`) | `24 passed` (1 NTP-tolerance test deselected) |
| ASAPO harness | `9 passed` |

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

The operational read-only views (see
[architecture.md](architecture.md#read-only-operational-views)) each have a
deterministic, broker-free suite:

- `api/tests/test_hzdr_labfrog_sqlite.py` — builds a minimal curated campaign
  SQLite mirroring `labfrog-sqlite-tools` and checks the campaign list, shot
  preview, limit clamping, and the safe-empty paths (missing/unset dir, unknown
  key, a file without a `shot_summary` view).
- `api/tests/test_hzdr_producer_status.py` — derives DAQ File Watchdog hosts and
  Shotcounter `absent`/`active`/`idle` status from synthetic source events,
  including host derivation from traceability fields and TKEY recognition.
- `api/tests/test_hzdr_flow_activity.py` — exercises the Kafka offset gatherer
  with an injected consumer factory, the spool JSONL line/timestamp counts, and
  the ASAPO graceful-degradation paths (unconfigured / client absent) — no real
  broker or `asapo_consumer` client required.

`api/scripts/hzdr-local-acceptance.py` is the local HTTP acceptance check:
emulator events → `HZDREventV1` → JSONL staging → catalog rebuild →
review API → Confirm Matches → export hook, all proven over a real FastAPI
app via `TestClient`, with no sibling repo, Docker, Mongo, Kafka, or ASAPO
required.

`asapo-for-hzdr-damnit/tests/test_local_message_suite.py` now covers both the
local broker internals and the HTTP/CLI surface: publish, claim, ack, consume,
reset, invalid-event rejection, LaserData JSONL staging, and replay
deduplication. The harness coverage is now above the cross-repo "Needs
attention" threshold; live ASAPO SDK coverage remains separate from this local
contract suite.

`planet-watchdog/tests/test_gui_test_controls.py` adds headless coverage for
local test-control helpers: demo/real config guards, packaged fake-ZMQ command
selection, Docker CLI failure reporting, JSONL edge cases, status/light updates,
and ZMQ receive-cache polling. The watchdog GUI bucket is still marked "Needs
attention" because the large Tk app/panel paths remain mostly manual until a
bounded full-GUI startup smoke test exists.

## Test Coverage Map

`scripts/test-all.ps1` runs every HZDR suite with `pytest-cov`, refreshes each
sibling repo's own per-area coverage map, and regenerates the combined table
below. Coverage is on by default; pass `-NoCoverage` to skip it:

```powershell
.\scripts\test-all.ps1            # run all suites, refresh coverage maps
.\scripts\test-all.ps1 -NoCoverage
```

`scripts/test-pilot-package.ps1` is the deployment-facing package gate for the
`Pilot_Verification_07.2026` Kafka pilot. It excludes ASAPO by default, checks
the sibling repo presence, git state, shared `hzdr-event-v1` contract, topic
registry, DAMNIT pilot `.env`, broker pilot env, and watchdog ZMQ-in/Kafka-out
pilot config, then delegates to `test-all.ps1` for the selected suites:

```powershell
.\scripts\test-pilot-package.ps1 -NoCoverage
.\scripts\test-pilot-package.ps1 -NoCoverage -DockerTests -Broker localhost:9092
.\scripts\test-pilot-package.ps1 -SkipSuites
```

<!-- coverage-summary-start -->

Overall line coverage per repo, from the latest `scripts/test-all.ps1` run.
Each suite writes a `cover/coverage.json`; rows show `No coverage data` until
that repo has been run with coverage. Per-area detail lives in each repo's own
coverage map (`CONTRIBUTING.md` / `docs/CONTRIBUTING.md`).

| Repo | Coverage | Package | Suite |
| --- | --- | --- | --- |
| DAMNIT API | <progress value="78" max="100">78%</progress> 78% Good | `damnit_api` | `api/tests` |
| LabFrog | <progress value="78" max="100">78%</progress> 78% Good | `labfrog` | `tests` (non-webkit) |
| LabFrog SQLite tools | <progress value="80" max="100">80%</progress> 80% Good | `labfrog_sqlite_tools` | `tests` |
| DAQ File Watchdog | <progress value="84" max="100">84%</progress> 84% Good | `watchdog_core` | `tests` |
| shotcounter | <progress value="80" max="100">80%</progress> 80% Good | `hzdrTangoDSShotcounter` | `tests` (non-ntp) |
| ASAPO harness | <progress value="65" max="100">65%</progress> 65% Moderate | `tools` | `tests` |

<!-- coverage-summary-end -->

## Commands

**Pre-commit** (run from repo root — use `uv run` because the system `pre-commit` binary may be
too old; `pre-commit>=4.5.1` is pinned in `api/pyproject.toml`):

```bash
uvx pre-commit run --all-files          # check every file
uvx pre-commit run --files path/to/file # check specific file(s)
uvx pre-commit install                  # install the git hook
```

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
2. Run Kafka roundtrip and restart/replay for DAQ File Watchdog (planet-watchdog) and shotcounter.
3. Test the `asapo-for-hzdr-damnit` sidecar when LaserData or another ASAPO
   source is available. It should consume with the DESY SDK, write DAMNIT
   spool JSONL, fsync before ack, and deduplicate replayed `event_id` values.
4. Add Playwright coverage for campaign, shot, provenance, and preview views.
5. Replay the captured pilot and report match/deduplication counts against the
   go-live gate in [integration-roadmap.md](integration-roadmap.md).

Keep live infrastructure tests separate from deterministic unit tests.

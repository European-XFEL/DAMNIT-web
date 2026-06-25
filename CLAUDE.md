# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose
HZDR fork of DAMNIT-web: a monorepo that serves DAMNIT experimental data over the
web. It is the **consumer and builder** at the end of the HZDR data-management
family — it ingests `hzdr-event-v1` events from producers, matches them to LabFrog
shot records, builds the canonical per-campaign NeXus file + source catalog, and
serves them through a FastAPI/GraphQL API and a React frontend. For how the seven
repos fit together and where the end products land, see
[docs/system-overview.md](docs/system-overview.md); for the data model and matching
rules, [docs/architecture.md](docs/architecture.md).

`AGENTS.md` just points here — this file is authoritative.

## Layout
A `uv` workspace for Python (`api/` member) plus a `pnpm` workspace for the
frontend (`frontend/apps/{app,demo,site}`). The `api` is FastAPI + Strawberry
GraphQL + SQLAlchemy; the frontend is React/TypeScript built with Vite.

## Commands

**API (Python, from `api/`):**
```
cd api
Copy-Item .env.test.example .env        # first time
.\scripts\damnit-api-dev.ps1            # dev server, reload on, localhost bind
.\scripts\damnit-api-deploy.ps1 -HostAddress 0.0.0.0 -Port 8000   # deploy-style
.\scripts\hzdr-dev.ps1                  # dev + HZDR provider setup, source smoke checks, optional frontend
```

**Frontend (from repo root):**
```
pnpm install
pnpm run dev:app          # Vite dev server at http://localhost:5173
# point it at the API via apps/app/.env or root .env:  VITE_API=http://127.0.0.1:8000
```

**Whole stack (API + frontend + local broker):**
```
pwsh scripts/hzdr-launch.ps1            # or: bash scripts/hzdr-launch.sh
pwsh scripts/hzdr-launch.ps1 -? ; bash scripts/hzdr-launch.sh --help
# flags: --no-api / --no-gui / --no-broker / --no-smoke / --validate-only / --init-config
```

**Tests:**
```
pwsh scripts/test-all.ps1               # this repo + all sibling suites, with coverage maps
pwsh scripts/test-all.ps1 -Repos damnit,planet-watchdog -WithAcceptance -NoCoverage
cd api && uv run pytest                 # API suite only
cd api && uv run pytest -k hzdr         # HZDR integration subset
cd api && uv run pytest tests/test_hzdr_spool.py::test_name   # single test
```

**Build the end products / utilities:**
```
python api/scripts/hzdr-hdf5-builder.py --experiment-id <id> --campaign-timezone Europe/Berlin \
    --labfrog-sqlite <c>.sqlite --trigger-jsonl <triggers>.jsonl --output-nexus <c>.nxs
python api/scripts/hzdr-local-acceptance.py        # emulator events through Confirm Matches, no broker
python api/scripts/regen_hzdr_event_fixtures.py    # regenerate the canonical hzdr-event-v1 schema + sample fixtures
```

**Lint:** `cd api && uv run ruff check .` (Python); `pnpm run lint` / eslint (frontend); `pre-commit` is configured.

## Architecture

### API (`api/src/damnit_api/`)
- `main.py` — FastAPI app + lifespan. The lifespan starts the durable **spool
  consumers** as background tasks when enabled (`DW_API_HZDR_SPOOL__ENABLED`,
  `DW_API_HZDR_KAFKA_SPOOL__ENABLED`).
- `metadata/` — the heart of the HZDR integration:
  - `hzdr_event.py` — the **canonical `HZDREventV1` Pydantic model**. This is the
    authoritative source of the cross-repo event contract; its JSON-Schema + sample
    fixtures are vendored into every sibling repo (see Cross-repo contract below).
  - `hzdr_nexus.py` — builds the canonical NeXus bridge (`/entry/shots`,
    `/entry/source_events`, …) and does atomic writes (`write_json_atomic`).
  - `hzdr_sources.py` — the `hzdr_sources.json` source catalog: shot model with
    `hdf5_path`, dataset listing/preview, review-level merge (`VERIFIED > REVIEWED > BASE`).
  - `services.py`, `routers.py`, `models.py`, `gql.py` — the matcher/reconciler,
    REST + GraphQL surfaces, and API models. Matching is identity-first
    (`kafka_event_id` → transport position → same-day TANGO shot number → timestamp
    fallbacks); the full order is in `docs/architecture.md`.
- `consumer/` — durable spool consumers sharing one claim → write+fsync → ack →
  dedup loop: `spool.py` (`HZDRSpoolConsumer` base), `asapo.py` (`AsapoSpoolConsumer`),
  `kafka.py` (`KafkaSpoolConsumer`, manual offset commit).
- `graphql/` (Strawberry), `db.py`/`_db/` (SQLAlchemy internal state), `auth/`
  (LDAP/no-auth), `shared/` (`routers.py` has `GET /config/health` liveness probes),
  `_mymdc/`, `contextfile/`, `data.py` — the original DAMNIT-web machinery.

### Frontend (`frontend/`)
`apps/app` (main UI), `apps/demo`, `apps/site`; `nginx/` for serving; Vite + pnpm
workspace. The Confirm Matches UI (`/link-shot-records`) surfaces ambiguous/unmatched
events; `ShotPage.tsx` fetches shot detail via the `by-key/{shot_key}` route when a
`shot_key` is present (falling back to `{shot_number}`).

### Configuration
Pydantic settings via `DW_API_*` env vars with `__` as the nested delimiter (e.g.
`DW_API_AUTH__MODE`). The deployment template is `api/.env.production.example`. Key
knobs: `DW_API_DAMNIT_PATH` (data root), `DW_API_METADATA__PROVIDER` (`local` reads
`hzdr_sources.json`, `mongo` reads a collection), and the `DW_API_HZDR_*SPOOL__*`
consumer settings. Structured JSON logging turns on when `DW_API_DEBUG=false`.
`scripts/damnit-api.service` is the systemd unit (`Restart=on-failure`).

## Cross-repo contract
The `HZDREventV1` model here is authoritative. `regen_hzdr_event_fixtures.py` exports
a committed JSON-Schema + sample (`api/tests/fixtures/hzdr-event-v1.*`) that is
vendored byte-identically into each sibling repo's `tests/fixtures/`; each repo's
`test_hzdr_event.py` asserts agreement, so a contract change shows up as a failing
test everywhere until the copies re-sync. `scripts/test-all.ps1` runs all six sibling
suites. Producer-side `trigger_role` is the one documented extension (folded into
`metadata.trigger.role` on normalization).

## Conventions and boundaries
- Keep work local-first; prefer the local acceptance script and the harness broker. No real broker/Mongo/ASAPO calls unless the user explicitly changes scope.
- Do not read or print secrets, credentials, tokens, or auth files. Keep endpoints and tokens in env-specific config, never in API code.
- Preserve HZDR-specific behavior; the builder is single-writer per campaign (PID lock) and publishes the NeXus file + catalog atomically — keep both invariants.
- Mind private GitLab dependencies and Windows/Linux differences (PowerShell `.ps1` and bash `.sh` launchers are kept in parallel).
- Add characterization tests before risky refactors. Fix React hook-dependency warnings properly rather than suppressing them.
- Python lint/format with ruff; frontend with eslint.

## Decision ladder
1. Does this need to exist?
2. Can config (`DW_API_*` settings) or existing code solve it?
3. Can native Python/browser/stdlib solve it?
4. Can a tiny patch solve it?
5. Add tests/smoke checks first.
6. Only then refactor or add dependencies.

## Validation
- `cd api && uv run ruff check .` and `cd api && uv run pytest -k hzdr` for API/integration changes.
- `pwsh scripts/test-all.ps1` before a cross-repo change (it runs the sibling conformance suites).
- `python api/scripts/hzdr-local-acceptance.py` for an end-to-end check without a broker or sibling repos.
- Frontend: `pnpm run dev:app` and verify in the browser; `pnpm run lint`.

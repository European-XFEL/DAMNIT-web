# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose
HZDR fork of DAMNIT-web: a monorepo that serves DAMNIT experimental data over the
web. It is the **consumer and builder** at the end of the HZDR data-management
family — it ingests `hzdr-event-v1` events from producers, matches them to LabFrog
shot records, builds the canonical per-campaign NeXus file + source catalog, and
serves them through a FastAPI/GraphQL API and a React frontend. For how the seven
repos fit together and where the end products land, see
[hzdr/docs/system-overview.md](hzdr/docs/system-overview.md); for the data model and matching
rules, [hzdr/docs/architecture.md](hzdr/docs/architecture.md).

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
pwsh hzdr/scripts/hzdr-launch.ps1            # or: bash hzdr/scripts/hzdr-launch.sh
pwsh hzdr/scripts/hzdr-launch.ps1 -? ; bash hzdr/scripts/hzdr-launch.sh --help
# flags: --no-api / --no-gui / --no-broker / --no-smoke / --validate-only / --init-config
```

**Tests:**
```
pwsh hzdr/scripts/test-all.ps1               # this repo + all sibling suites, with coverage maps
pwsh hzdr/scripts/test-all.ps1 -Repos damnit,planet-watchdog -WithAcceptance -NoCoverage
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
- `main.py` — FastAPI app + lifespan. The lifespan enters
  `consumer/bootstrap.py`'s `spool_lifespan`, which starts the durable **spool
  consumers** as background tasks when enabled (`DW_API_HZDR_SPOOL__ENABLED`,
  `DW_API_HZDR_KAFKA_SPOOL__ENABLED`) and, when `DW_API_HZDR_BUILDER__ENABLED`
  is set, one shared **builder auto-trigger** task that all consumers notify
  (`consumer/builder_trigger.py`). The fork-only wiring lives in `bootstrap.py`
  so `main.py` stays close to upstream's — a single `async with` hook.
- `metadata/` — the heart of the HZDR integration:
  - `hzdr_event.py` — the **canonical `HZDREventV1` Pydantic model**. This is the
    authoritative source of the cross-repo event contract; its JSON-Schema + sample
    fixtures are vendored into every sibling repo (see Cross-repo contract below).
  - `hzdr_nexus.py` — builds the canonical NeXus bridge (`/entry/shots`,
    `/entry/source_events`, …) and does atomic writes (`write_json_atomic`).
  - `hzdr_sources.py` — the `hzdr_sources.json` source catalog: shot model with
    `hdf5_path`, dataset listing/preview, review-level merge (`VERIFIED > REVIEWED > BASE`).
  - `scicat.py` — registers the canonical campaign NeXus file as a citable SciCat
    dataset via the `scicat_plugin` HTTP boundary; runs as a best-effort builder
    post-step (never fails a build) and stamps `scicat_pid`/`version_hash` into the
    catalog. Gated by `DW_API_HZDR_SCICAT__*`.
  - `services.py`, `routers.py`, `models.py`, `gql.py` — the matcher/reconciler,
    REST + GraphQL surfaces, and API models. Matching is identity-first
    (`kafka_event_id` → transport position → same-day TANGO shot number → timestamp
    fallbacks); the full order is in `hzdr/docs/architecture.md`.
- `consumer/` — durable spool consumers sharing one claim → write+fsync → ack →
  dedup loop: `spool.py` (`HZDRSpoolConsumer` base), `asapo.py` (`AsapoSpoolConsumer`),
  `kafka.py` (`KafkaSpoolConsumer`, manual offset commit). `builder_trigger.py`
  (`BuilderTrigger`) coalesces `on_new_events` from *all* consumers into one
  debounced subprocess rerun of `hzdr-hdf5-builder.py` — a single global trigger,
  never one per consumer, so the builder's single-writer PID lock and atomic
  publish are never contended by two concurrent builds for the same campaign.
  `bootstrap.py` (`spool_lifespan`) is the async-context-manager that starts/stops
  the enabled consumers + trigger; `main.py`'s lifespan enters it so the fork-only
  wiring lives here, not inline in `main.py`.
- `graphql/` (Strawberry), `db.py`/`_db/` (SQLAlchemy internal state), `auth/`
  (LDAP/no-auth), `shared/` (`routers.py` has `GET /config/health` liveness probes),
  `_mymdc/`, `contextfile/`, `data.py` — the original DAMNIT-web machinery.

### Frontend (`frontend/`)
`apps/app` (main UI), `apps/demo`, `apps/site`; `nginx/` for serving; Vite + pnpm
workspace. HZDR-specific UI code lives under `apps/app/src/hzdr/`:
- `pages/` — `ShotPage`, `LinkRecordsPage`, `FlowMonitorPage`, `ContextBuilderPage`,
  `DocsPage`, `SourceHome`
- `components/` — `ShotTable`, `FlowDiagram`, `AppHeader`, `previews`
- `utils/` — `api`, `filter`, `format`, `hdf5`, `link-records`, `metadata`, `plotly`,
  `preview`, `context`
- `types.ts`, `hooks.ts`, `index.ts`

`ShotPage.tsx` fetches shot detail via the `by-key/{shot_key}` route when a
`shot_key` is present (falling back to `{shot_number}`).
The `LinkRecordsPage` (`/link-shot-records`) surfaces ambiguous/unmatched events.
Saved table views are persisted in `hzdr_sources.views.json` alongside
`hzdr_sources.json` (same directory, same stem with `.views.json` suffix); the API
manages them via `GET/POST/DELETE /metadata/hzdr/views`.

### Configuration
Pydantic settings via `DW_API_*` env vars with `__` as the nested delimiter (e.g.
`DW_API_AUTH__MODE`). The deployment template is `api/.env.production.example`. Key
knobs: `DW_API_DAMNIT_PATH` (data root), `DW_API_METADATA__PROVIDER` (`local` reads
`hzdr_sources.json`, `mongo` reads a collection), and the `DW_API_HZDR_*SPOOL__*`
consumer settings. The builder auto-trigger is a single global block,
`DW_API_HZDR_BUILDER__*` (`ENABLED`, `DEBOUNCE_SECONDS`, `OUTPUT_NEXUS` and the
rest of the builder CLI as settings) — *not* per-consumer flags — because there
is one builder per campaign; `OUTPUT_NEXUS` is required when `ENABLED=true`, and
the event/trigger JSONL inputs are auto-derived from the running consumers' spool
paths rather than reconfigured here. SciCat registration of the built NeXus file
is the separate `DW_API_HZDR_SCICAT__*` block (best-effort, off by default).
Structured JSON logging turns on when `DW_API_DEBUG=false`.
`hzdr/scripts/damnit-api.service` is the systemd unit (`Restart=on-failure`).

## Event schema contract (`hzdr-event-v1`)
The `HZDREventV1` Pydantic model in `api/src/damnit_api/metadata/hzdr_event.py` is the
**authoritative** definition of the cross-repo event envelope. This section is the
human-readable copy of its constraints; keep the two in sync (regenerate fixtures and
update this table together when the model changes).

**The top level is closed (`extra="forbid"`).** Only these keys may appear:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `schema_version` | str | defaulted | must match `^hzdr-event-v1$` |
| `event_id` | str | yes\* | stable + deterministic; a publish retry must resend the same id |
| `experiment_id` | str | yes | canonical campaign id |
| `shot_id` | str | yes | join key together with `experiment_id` |
| `shot_number` | int \| null | no (null) | TANGO is the authority; `null` is valid, not an error |
| `source` | str | yes | producer/source label |
| `kind` | str | yes | event kind, e.g. `draco.trigger` |
| `timestamp` | str | yes | UTC ISO-8601 |
| `transport` | str | yes | `kafka` / `asapo` / … |
| `payload_ref` | object | yes (may be `{}`) | traceability object; **open** (`extra="allow"`) |
| `values` | JSON \| null | no | small inline data only — see bounds below |
| `metadata` | object | no (`{}`) | free-form; consumers serialize the whole object to one JSON-text column |

\* `event_id` is required on the wire. `_normalize_event()` synthesizes one only when
loading a legacy file that omits it (`EVENT_REQUIRED_FIELDS` is the looser loaded-file set).

**Hard constraints**
- **No extra top-level fields.** The one tolerated producer-dialect field is `trigger_role`;
  the producer folds it into `metadata.trigger.role` so the wire envelope stays closed.
  The normalizer keeps a `pop("trigger_role")` shim for in-flight events from older producers.
- **`shot_number` authority is TANGO.** `null` means "no authoritative number yet" and is
  expected; a non-authoritative local counter belongs in `metadata`, never in this field.
- **`values` is small data only:** ≤ `MAX_VALUES_ITEMS` (4096) leaf items counted recursively
  **and** ≤ `MAX_VALUES_BYTES` (64 KiB) serialized JSON, enforced by `check_values_size()`.
  Anything larger is a producer-side bug — put a reference in `payload_ref`
  (`uri`/`path`/object-store/SciCat/Mongo) instead.
- **`payload_ref` is the traceability object, not `metadata`.** At least one of its fields
  (`topic/partition/offset/uri/path/message_key/mongo_id/scicat_pid`, plus producer-specific
  extras it allows) should be set for any real event.
- **Join key is `experiment_id + shot_id`.**

**Keeping copies in sync.** `api/scripts/regen_hzdr_event_fixtures.py` exports a committed
JSON-Schema + sample to `api/tests/fixtures/hzdr-event-v1.*`, vendored byte-identically into
the producer repos that emit the envelope (`shotcounter/`, `planet-watchdog/` under
`tests/fixtures/`). Each of those repos' `tests/test_hzdr_event.py` asserts its payload
conforms, so a contract change fails CI in every producer until the copies re-sync.
`hzdr/scripts/sync-hzdr-event.ps1` checks (or `-Apply` fixes) the copies; `hzdr/scripts/test-all.ps1`
runs all sibling suites.

## Conventions and boundaries
- Keep work local-first; prefer the local acceptance script and the harness broker. No real broker/Mongo/ASAPO calls unless the user explicitly changes scope.
- Do not read or print secrets, credentials, tokens, or auth files. Keep endpoints and tokens in env-specific config, never in API code.
- Preserve HZDR-specific behavior; the builder is single-writer per campaign (PID lock) and publishes the NeXus file + catalog atomically — keep both invariants.
- Mind private GitLab dependencies and Windows/Linux differences (PowerShell `.ps1` and bash `.sh` launchers are kept in parallel).
- Root-level `scripts/` (and other upstream-owned paths) are touched only by upstream merges. Everything HZDR at the repo root lives under `hzdr/` (`hzdr/docs/`, `hzdr/scripts/`); inside `api/`/`frontend/`, HZDR code keeps the `hzdr_`/`hzdr/` naming.
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
- `pwsh hzdr/scripts/test-all.ps1` before a cross-repo change (it runs the sibling conformance suites).
- `python api/scripts/hzdr-local-acceptance.py` for an end-to-end check without a broker or sibling repos.
- Frontend: `pnpm run dev:app` and verify in the browser; `pnpm run lint`.

## Agent Pack

First act as the Main Coordinator Agent. Choose the most relevant specialist section for the task. If the task crosses areas, use multiple sections.

Maintain DAMNIT-web-hzdr. Act as the Main Coordinator: route tasks to backend, frontend, data, tests/refactor, or CI/deployment. Keep changes minimal, preserve HZDR-specific behavior, and add tests before risky refactors.

Backend/API: FastAPI/Python — routers, settings, auth/noauth/LDAP, database access. Preserve local dev behavior. Use uv, ruff, and pytest where relevant.

Frontend/UI: React/TypeScript — hooks, forms, tables, dashboard pages, API calls. Fix hook dependency warnings properly. Keep UI changes minimal.

Data/metadata: shot/campaign metadata — SQLite/HDF5/NeXus/openPMD concepts. Link campaign, date/day, shot number, timestamp, and source system. Keep schemas migration-aware.

Test/refactor safety: for messy cleanup or larger refactors, add characterization tests first, preserve behavior unless explicitly changing it, and make small patches.

CI/deployment: GitLab CI, GitHub Actions, uv, Docker, nginx. Mind private GitLab dependencies, keep secrets out of files, and support Windows/Linux differences.

## Schema constraints and current versions

### Event schema: `hzdr-event-v1`

Canonical envelope defined in `api/src/damnit_api/metadata/hzdr_event.py`.
Current version constant: `HZDR_EVENT_SCHEMA_VERSION = "hzdr-event-v1"`

**This file is vendored by hand** into sibling repos (`planet-watchdog/watchdog_core/hzdr_event.py` and `hzdrTangoDSShotcounter`). Keep all three in sync whenever fields change.

Required fields — every loaded event file must carry these (`EVENT_REQUIRED_FIELDS`):
`experiment_id`, `shot_id`, `source`, `kind`, `timestamp`, `transport`, `payload_ref`

Optional fields: `schema_version`, `event_id` (synthesized from content hash if absent), `shot_number`, `values`, `metadata`

`payload_ref` uses `HZDRPayloadRef` (`extra="allow"`). At least one traceability field should be set: `uri`, `path`, `topic`/`partition`/`offset`, `mongo_id`, or `scicat_pid`.

### Metadata key registry (binding, signed off 2026-07-02)

Namespace convention for numeric `metadata.*` keys: **bare keys, no unit suffix.**
The canonical unit per key is fixed here; the NeXus writer stamps it as `@units`,
and the SQLite export carries it in the existing `units` table
(labfrog-sqlite-tools schema). Superseded suffixed keys (`pulse_energy_j`,
`wavelength_nm`, etc.) must not be used for new producers. The `properties`
extras bag (see `target-ontology.md` §4) keeps the `_unit`-suffix convention
since its keys have no registry entry.

**Linter implemented (2026-07-02):** `METADATA_KEY_REGISTRY`, `LEGACY_KEY_MAP`, and
`lint_metadata_keys()` in `api/src/damnit_api/metadata/hzdr_event.py` encode this table
in code and warn (never reject) when a legacy suffixed key is seen; wired into
`hzdr_nexus._normalize_event()` so every normalized event is linted. The flow-monitor
emulator (`routers._build_flow_monitor_metadata`) already emits the namespaced bare
keys, so the linter is silent on its output.

| Namespace | Key | Canonical unit |
| --- | --- | --- |
| `target.*` | `thickness` | nm |
| `target.*` | `diameter` | mm |
| `target.*` | `temperature` | °C (`C`) |
| `target.*` | `gas_pressure` | bar |
| `laser.*` | `pulse_energy` | J |
| `laser.*` | `pulse_duration` | fs |
| `laser.*` | `wavelength` | nm |
| `laser.*` | `beam_pos_x` / `beam_pos_y` | mm |
| `laser.*` | `beam_waist_x` / `beam_waist_y` | um |
| `laser.*` | `repetition_rate` | Hz |
| `laser.*` | `polarization` | — (string enum) |
| `laser.*` | `contrast_ratio` | — (dimensionless) |
| `laser.*` | `system` | — (string) |
| `vacuum.*` | `chamber_pressure` | mbar |
| `vacuum.*` | `pre_shot_pressure` | mbar |
| `vacuum.*` | `rga_dominant_species` | — (string) |
| `run.*` | `facility`, `beamline`, `pi`, `start_utc`, `end_utc` | n/a (non-numeric) |
| `diagnostic.*` | per-detector scalars | see detector-specific docs |

See [hzdr/docs/target-ontology.md §5](hzdr/docs/target-ontology.md#5-units-convention) and
[hzdr/docs/standards-alignment.md §3.3/§3.5](hzdr/docs/standards-alignment.md#33-laser-parameters)
for the full rationale and HELPMI cross-walk.

### NeXus bridge profile: `hzdr-canonical-shot-v1`

Stamped as `damnit_bridge_profile` on HDF5 root and `/entry/shots`. Current value: `"hzdr-canonical-shot-v1"`. Bump this string if the bridge table layout changes (columns added/removed from the shot or source-events groups).

### Shared Pydantic field constraints (`api/src/damnit_api/shared/models.py`)

| Type | Constraint |
|------|------------|
| `ProposalNumber` | `int`, exclusive range `(0, 9_999_999)` — `gt=0, lt=9999999` |
| `ProposalId` | `int`, exclusive range `(0, 9_999_999)` — `gt=0, lt=9999999` |
| `ProposalCycle` | `str` matching `^\d{6}$` (e.g. `"202501"`) |

### Match quality ranks (ascending, `hzdr_nexus.MATCH_RANK`)

`unmatched` (0) → `labfrog_only` (1) → `nearest_time` (2) → `shot_number_time_window` (3) → `exact_day_shot_number` (4) → `event_identity` (5)

Higher rank wins when two matches compete for the same shot.

### Review levels (ascending, `hzdr_nexus.REVIEW_LEVELS`)

`BASE` (matcher output — not stored in sidecar) → `REVIEWED` (operator action) → `VERIFIED` (countersigned)

Highest-rank decision per `event_id` wins when the `.review.jsonl` sidecar is merged back at builder-run time.

### SQLite table: `ProposalMeta` (`api/src/damnit_api/metadata/models.py`)

No Alembic migrations — tables are created via `SQLModel.metadata.create_all`. Adding a column requires running the bootstrap script or recreating the DB in local dev.

Columns: `id` (PK), `number` (ProposalNumber), `cycle` (ProposalCycle), `instrument`, `path`, `title`, `principal_investigator`, `start_date`, `end_date`, `damnit_path`, `damnit_paths_searched` (JSON array), `proposal_read_only` (bool, default `False`), `damnit_path_last_check`, `created_at` (auto), `updated_at` (auto on change).

Computed field (not stored): `year_half` — `"YYYYHH"` where `HH` is `"01"` (Jan–Jun) or `"02"` (Jul–Dec).

### `DamnitType` enum (`api/src/damnit_api/shared/const.py`)

Values: `none`, `number`, `string`, `boolean`, `timestamp`, `complex`, `array`, `image`, `numpy`, `rgba`, `png`, `dataset`

### API package version

`damnit-api` current: **`0.1.1`** (see `api/pyproject.toml`). No runtime version endpoint exists; bump this when the public schema changes.

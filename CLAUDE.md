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

**Refresh all six HZDR documentation screenshots:**
```
uv run playwright install chromium  # one-time
uv run python hzdr/scripts/capture-screenshots.py
```
The capture uses only a disposable local package-emulator stack.

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
python api/scripts/hzdr-container-worker.py --master <c>.nxs   # shot containers into <c's folder>/shots/ (or --output-root)
python api/scripts/hzdr-compare-containers.py --damnit <campaign folder> --aligner <shot-aligner build>   # phase 6: diff against shot-aligner's containers
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
  - `hzdr_openpmd.py` — **preflight only**, never a writer: resolves a reviewed
    nexus-design-studio `OpenPMDProjectionPlan` against a completed canonical file
    and reports per-rule `accepted`/`deferred`/`rejected` with stable reason codes.
    Opens the file read-only; no `openpmd-api` dependency. The fixture and CLI are
    `api/scripts/hzdr-openpmd-{fixture,preflight}.py`; the contract and the
    canonical path inventory (only `/entry/shots/*` is shot-indexed —
    `/entry/source_events` and `/entry/data_products` need a `shot_key` join) are in
    [hzdr/docs/plans/openpmd-projection-plan.md](hzdr/docs/plans/openpmd-projection-plan.md).
  - `hzdr_packs/` — the diagnostic packs (campaign output plan phase 2b): one
    acquisition's files into one `NXdetector`, via
    `write(pack_id, group, acquisition, read_path) -> problems`, for
    `camera_png_csv`, `spectrometer_irr8` and `sequence_frames`
    (`metadata.instrument.format`). shot-aligner's readers, helpers and pack
    manifests are **vendored byte for byte** under `hzdr_packs/vendor/`
    (pinned in its `SOURCE.json`; ruff/pyright/pre-commit skip it; fix them in
    shot-aligner, re-vendor with `hzdr/scripts/sync-hzdr-packs.{sh,ps1} --apply`,
    checked by `test-all.ps1`); the packs themselves are **rewritten to h5py**.
    Frames are read with Pillow in OpenCV's `IMREAD_UNCHANGED` layout
    (`_images.py`; a 16-bit colour frame is refused, not truncated) and stream
    into chunked gzip-4 datasets one frame at a time. Held node for node and
    value for value to shot-aligner's per-pack references
    (`api/tests/fixtures/hzdr-reference/packs/`). Called by `hzdr_containers.py`.
    The vendor folder also pins NDS's instrument catalogue
    (`hzdr-draco-0.3.0.json`, `vendor.catalogue()`).
  - `hzdr_containers.py` — the **shot containers** (campaign output phase 3,
    design in [hzdr/docs/plans/container-writer.md](hzdr/docs/plans/container-writer.md)):
    reads the published master's `/entry/source_events` + `/entry/shots`
    (joined by `event_id`; no bridge-profile change), groups each shot's files
    into acquisitions by shot-aligner's claim key, and writes
    `<campaign folder>/shots/<YYYYMMDD>_<shot_number:06d>.nxs` (one `NXentry`,
    `NXinstrument`/`NXdetector` named by the vendored `nxwrite.container_groups`
    from the catalogue, `shot_key` as an attribute). Run by
    `api/scripts/hzdr-container-worker.py` (`--master`, or `--output-root`
    with optional `--campaign`; the `_unassigned` bucket only with
    `--include-unassigned`) **outside the campaign lock**, under its own
    `shots/.convert.lock` (a second worker leaves `shots/.convert.pending` for
    the running one; refreshed per container, another host's reclaimed after
    30 min). Each container goes to `<name>.nxs.<nonce>.tmp`, is fsynced and
    renamed into place after a lock check (with
    the bounded Windows retry), and is rewritten only when its input
    fingerprint changes (members' `sha256` and presence, catalogue SHA,
    conversion-code digest, h5py/libhdf5/Pillow versions, path-map digest) —
    `shots/.build-manifest.json` plus the container's own attribute, so a crash
    resumes — or a member's size/mtime moved under the same `sha256`. The
    master is read in slices, keeping only acquisition events. A
    missing/unreadable file drops that detector and is recorded in
    `/entry/conversion_problems`; a container that fails is recorded with its
    error and the pass goes on. Held to the reference fixture's manifest, all 101 contract nodes,
    including shot-aligner's per-instrument mapping rows (**phase 4b**,
    `hzdr_packs/mapping_rows.py`, a port of its `mappings.apply_to`: hard links
    to the agreed paths, derived datasets for transforms, problems noted in
    `/entry/mapping_problems`; the mapping files vendored into
    `hzdr_packs/vendor/mappings/` and fingerprinted per instrument). **Phase 4:** the builder
    links the container of every shot that has an acquisition in this build
    (`hzdr_nexus.is_acquisition`) and whose file is in place (it names the
    shot's `shot_key`; a file a build found in place is not reopened while its
    size, mtime and inode stay the same, recorded in
    `.hzdr-container-check.json` beside the master) from the master's
    **root**: one relative
    `ExternalLink("shots/<name>", "/entry")` per container, named by its stem,
    so the master is a multi-entry NeXus file and `/entry` stays valid against
    NXhzdr_target; `/entry/shot_containers` (`NXcollection`) indexes them with
    `shot_key`/`container` datasets to join on; inside the temp file before the atomic rename. When a worker
    invocation wrote a container the published master does not link, or
    collected one it still links (`relink_needed`, judged at the end against
    the master as it is then), it exits `RELINK_EXIT` (3; 4 with a failure) and
    the trigger answers with one more build, which converges. After each pass
    the worker moves this campaign's containers (by their own `shot_key`)
    whose shot has no acquisition in the published master to `shots/.trash`,
    purged after 7 days; never the lock, guard, pending marker, manifest or
    temp files, and nothing when the master has no acquisition at all. Shot
    detail follows the shot's link (`hzdr_sources.list_container_datasets`),
    listing its datasets as `<stem>/...`; previews read
    them through the campaign file, one strided frame at a time.
  - `scicat.py` — registers the canonical campaign NeXus file as a citable SciCat
    dataset via the `scicat_plugin` HTTP boundary; runs as a best-effort builder
    post-step (never fails a build) and stamps `scicat_pid`/`version_hash` into the
    catalog. Gated by `DW_API_HZDR_SCICAT__*`.
  - `services.py`, `routers.py`, `models.py`, `gql.py` — the matcher/reconciler,
    REST + GraphQL surfaces, and API models. Matching is identity-first
    (`kafka_event_id` → transport position → a `shot_number` held by exactly one
    shot, same day then any day → timestamp fallbacks); the full order is in `hzdr/docs/architecture.md`.
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
- `graphql/` (Strawberry), `runs/` (upstream's run reading: `runs/sqlite/`
  `session.py` opens each DAMNIT `runs.sqlite` behind a per-database read lock,
  `repository.py` queries it; `preview.py`/`serialization.py`), `_db/` (SQLAlchemy
  internal state), `auth/` (LDAP/no-auth; `permissions.py` holds upstream's
  `IsProposalMember`, which needs MyMdC membership outside local mode, and a user
  with no MyMdC client is a member of nothing), `shared/` (`routers.py` has
  `GET /config/health` liveness probes), `_mymdc/` (bootstrapped only for
  `DW_API_METADATA__PROVIDER=mymdc`), `contextfile/` - the original DAMNIT-web
  machinery. Context-file arguments read flat metadata keys, then a `meta#a.b` path or
  the registry key a legacy name maps to (`laser_energy_j` ->
  `laser.pulse_energy`).
- API docs build with zensical (`api/zensical.toml`; `uv run --group docs zensical
  build` in `api/`). Upstream's character check (`scripts/check-characters`) runs in
  pre-commit and CI; fork-owned HZDR paths keep their typographic punctuation and
  are marked `-check-characters` in `.gitattributes`.

### Frontend (`frontend/`)
`apps/app` (main UI), `apps/demo`, `apps/site`; `nginx/` for serving; Vite + pnpm
workspace. HZDR-specific UI code lives under `apps/app/src/hzdr/`:
- `pages/` — `ShotPage`, `ReviewMatchesPage`, `FlowMonitorPage`, `ContextBuilderPage`,
  `DocsPage`, `SourceHome`
- `components/` — `ShotTable`, `ReviewMatches`, `FlowDiagram`, `AppHeader`, `previews`
- `utils/` — `api`, `filter`, `format`, `hdf5`, `review`, `metadata`, `plotly`,
  `preview`, `context`
- `types.ts`, `hooks.ts`, `index.ts`

`ShotPage.tsx` fetches shot detail via the `by-key/{shot_key}` route when a
`shot_key` is present (falling back to `{shot_number}`).
The `ReviewMatchesPage` (`/review-matches`; the old `/link-shot-records` path
redirects there) is where a person resolves what the builder will not guess:
ambiguous events (confirm one of `candidate_shot_keys`), unmatched events
(acknowledge), and `unassigned` shots (assign a campaign, written as an
experiment ruling). It reads `GET .../sources/{key}/review`, which also lists
`unassigned_shots` and their pending `experiment_rulings`.
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
paths rather than reconfigured here. **Multi-campaign mode** (readiness plan C2,
`consumer/campaign_builds.py`, builder `--output-root`) replaces `OUTPUT_NEXUS`
with `OUTPUT_ROOT` (+ `CURATED_ROOT`, `CAMPAIGNS`; all default off): one run
builds every listed or spooled campaign, every campaign an `unassigned` event
resolves to, and the `_unassigned` bucket, each to `<root>/<campaign>/<campaign>.nxs`
with its export found as `<curated_root>/<campaign>/<campaign>.sqlite`, merged
into one shared catalog (source key = `experiment_id`) that the API must serve.
Only the listed and spooled campaigns' exports take part in resolution step 1,
which keys on `authority_shot_number` only (ruling R3). SciCat registration of the built NeXus file
is the separate `DW_API_HZDR_SCICAT__*` block (best-effort, off by default).
`DW_API_HZDR_LASER__*` (`SYSTEM`, `WAVELENGTH`, `REPETITION_RATE`, `POLARIZATION`)
states the deployment's *fixed* laser-system constants — the `metadata.laser.*`
keys no producer event carries. The builder fills only the gaps into
`/entry/instrument/laser` and marks each filled dataset `damnit_source="config"`;
a producer value always wins, and an unset block writes nothing.
Two builder settings belong to campaign resolution (automatic shot assembly
plan W1/W6): `DW_API_HZDR_BUILDER__CAMPAIGN_SCHEDULE` (a LabFrog
`labfrog-campaign-schedule-v1` export that routes `experiment_id: "unassigned"`
events by trigger time) and `DW_API_HZDR_BUILDER__TIME_MATCH_AUTOASSIGN`
(default `false` since ruling A7, 2026-09-30: the time-based match ranks only
propose review candidates, and an authoritative `shot_number` naming exactly
one shot attaches on the number alone; `true` restores the earlier ladder,
which attached a numbered trigger to a neighbouring LabFrog shot by time).
`DW_API_HZDR_BUILDER__VALIDATION_PYTHON` (default empty: off) names a Python
with nexus-design-studio and pynxtools (NDS's own `.venv`); set, the trigger
runs `api/scripts/hzdr-nexus-validate.py` (campaign output phase 5) after each
container worker (not after one that asked for a relink or converted
nothing, `BUSY_EXIT`), or after the build without containers, one run at a
time: the master against NXhzdr_target and its container links, the
containers structurally and their definition subentries (known mapping gaps
reported, anything new gating), in `<campaign folder>/.validation.json` and
`.hzdr-validation.log`; exit 1 fails the gate, exit 2 means it could not run.
`DW_API_HZDR_BUILDER__CONTAINERS_ENABLED` (default `false`) makes the trigger
start `hzdr-container-worker.py` (for `OUTPUT_NEXUS`, or every campaign under
`OUTPUT_ROOT`) once before each build and once after a successful one, without
waiting for it; it logs to `.hzdr-container-worker.log` beside the output
(`CONTAINER_WORKER_SCRIPT` overrides the script; `CONTAINERS_INCLUDE_UNASSIGNED`
adds the `_unassigned` bucket in multi-campaign mode). Consumers spool
`unassigned` events to a shared `<spool>/_unassigned/` file that every
campaign's build reads. A ruling posted from Review matches asks the running
auto-trigger for a rebuild (`builder_trigger.request_rebuild`).
`DW_API_METADATA__PATH_MAP` (`from=to` prefixes, comma separated, absolute
targets; default empty; a malformed value stops startup) translates recorded
paths (`/bigdata/...`, `Z:/bigdata/...`) onto this host's mount of the same
share (`shared/hzdr_paths.py`). It is applied at read time only, in three
places: a catalog shot's `hdf5_path` when the API lists or previews datasets
(normally the campaign NeXus file, so it matters when the catalog was built on
another host or comes from Mongo); the `hdf5_path` handed to Context Builder
variables; and each data product's `path`, which a shot detail reports as
`reachable` (true/false; null for URIs and in-file datasets) and the UI badges
as on disk / missing. The builder does not use it; the container worker reads
raw files through it (or its `--path-map`). Nothing stored is rewritten.
Structured JSON logging turns on when `DW_API_DEBUG=false`.
`hzdr/scripts/damnit-api.service` is the systemd unit for an `/opt` install;
`hzdr/scripts/damnit-api-checkout.service.example` is the one in use on
fwkt-webapps (runs from `~/DAMNIT-web-hzdr`, settings in `api/.env`; update with
`git pull --ff-only`, `uv sync --locked` in `api/`, restart).

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
| `experiment_id` | str | yes | canonical campaign id, or the sentinel `unassigned` (`UNASSIGNED_EXPERIMENT_ID`) when the producer does not know it |
| `shot_id` | str | yes | join key together with `experiment_id` |
| `shot_number` | int \| null | no (null) | issued only by the shot authority (planet-watchdog); a whole number (JSON integer >= 0; never a boolean, float or string, all refused since 2026-09-30); `null` is valid, not an error |
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
- **Only the shot authority issues `shot_number`** (planet-watchdog's
  `planet-watchdog-shot-authority` on fwkt-webapps, since 2026-10-02; see
  `planet-watchdog/docs/SHOT_AUTHORITY.md`). The shotcounter's counts are not shot
  numbers (`Channel_counter` restarts with the device server, `10Hz_counter`
  wraps). `null` means the event carries no shot number (e.g. a file event not
  attributed to a shot) and is expected; a local count belongs in `metadata`,
  never in this field.
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
Two more copies come from shot-aligner and are checked the same way (check by
default, `--apply`/`-Apply` re-vendors, `SHOT_ALIGNER_ROOT` overrides
`../shot-aligner`): `hzdr/scripts/sync-hzdr-reference.{sh,ps1}` for the reference
fixture in `api/tests/fixtures/hzdr-reference/`, and
`hzdr/scripts/sync-hzdr-packs.{sh,ps1}` for the vendored readers, pack
manifests, instrument catalogue and per-instrument mapping rows
(`vendor/mappings/`) in `metadata/hzdr_packs/vendor/`. `test-all.ps1` and `test-all.sh` run all three
checks and stop on drift.

## Changelog and operations
`hzdr/CHANGELOG.md` records notable HZDR changes (add an entry with each PR that
changes behaviour). `hzdr/docs/guides/operations.md` is the fwkt-webapps runbook:
deploying, rebuilding a campaign by hand, and a build stuck in a CIFS write
(state `D`, holding its campaign lock) on `//gssnfs/bigdata`. Things to know:
- The auto-trigger rebuilds on export or event changes only, never on restart.
- Manual multi-campaign builds must name each campaign (`--campaign`) and pass
  `--campaign-timezone Europe/Berlin`.
- The deployed output root is normally `/home/tippey/mnt/bigdata/HPLexp/nexus`,
  shared with shot-aligner's output (never delete it). Since 2026-11-03 it is
  temporarily `HPLexp/nexus_2026-11`, to step around two hung builds holding
  locks there; switch back after the next reboot of fwkt-webapps.

## Conventions and boundaries
- Keep work local-first; prefer the local acceptance script and the harness broker. No real broker/Mongo/ASAPO calls unless the user explicitly changes scope.
- Do not read or print secrets, credentials, tokens, or auth files. Keep endpoints and tokens in env-specific config, never in API code.
- Preserve HZDR-specific behavior; the builder is single-writer per campaign (PID lock) and publishes the NeXus file + catalog atomically — keep both invariants. The lock (`hzdr_nexus.single_writer_lock`) records `host:pid:process-start`, treats a fresh empty lock as held, reclaims a dead or reused PID on this host (on this host the PID decides, never age), and never lets the builder steal another host's lock; the container worker's lock also expires when another host's is not refreshed (`stale_after`), and `WriterLock.refresh()` raises `LockLostError` once a holder's lock was taken over, so it stops before publishing. Every writer must run the same lock code (older code steals the new record format). Every create/reclaim/release of the lock is serialized by a kernel lock on `<lock>.guard` (kept on disk), and a reclaim goes through a checked tombstone; without kernel locks a stale lock is not reclaimed (remove it by hand). Renames over a published file go through `replace_with_retry` (bounded, for Windows readers).
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
- NeXus output: `<nds>/.venv/bin/python api/scripts/hzdr-nexus-validate.py --master <c>.nxs` (or `HZDR_NDS_PYTHON=<that python> uv run pytest tests/test_hzdr_nexus_validate.py`); exit 1 on a master or container error.
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
keys, so the linter is silent on its output. **Since 2026-07-18** the `diagnostic.*`
namespace is registry-governed: its keys are registered below, the legacy flat
spellings (`xray_counts`, …) are in `LEGACY_KEY_MAP`, and the linter additionally
warns about a `metadata.diagnostic` key with no registry entry (register the key
here + in code before producing it; unregistered keys are still written, but
unitless). The `simulation.*` namespace (openPMD links,
[hzdr/docs/openpmd-linking.md](hzdr/docs/openpmd-linking.md)) is reserved and
non-numeric — no registry rows, linter stays silent on it. **Since 2026-07-27**
`laser.polarization` — the registry's only string enum — has its accepted labels
written down as `LASER_POLARIZATION_VALUES` (`p`, `s`, `horizontal`, `vertical`,
`linear`, `circular`, `circular_left`, `circular_right`, `elliptical`,
`unpolarized`; matched case-insensitively, DRACO's signed value is `p`). The
linter warns about an off-vocabulary producer label and the value is still
written; the same label in `DW_API_HZDR_LASER__POLARIZATION` is rejected instead.
**Since 2026-09-11** three more `diagnostic.*` scalars are registered:
`tps90_proton_energy` and `tps90_si11_energy` (MeV) and `radiation_dose` (uSv).
They are named for the geometry and the species because the number means
nothing without them — a 90° Thomson-parabola reading for protons and for
Si¹¹⁺ are two measurements, not one key with a label. Sourced from the
December 2025 ShootSheet columns `TPS 90° - H`, `TPS 90° -Si 11` and `Dosis`
in shot-aligner (`tippey27/shot-aligner`), and registered **ahead of** any producer, which is the
order this registry asks for: that repository is not wired to the Kafka pilot
and emits no events today. The Thomson parabola was already named in
[standards-alignment.md §3.5](hzdr/docs/standards-alignment.md) as an important
DRACO diagnostic with no producer sending it. **Since 2026-09-18** shot-aligner
stamps all three onto its shot containers from the very ShootSheet columns they
were registered from, where the column names the species and nothing is
ambiguous — a NeXus field carrying a registry key, not an event producer, so the
§3.5 statement stands. The *producer* gap now has
a known cause rather than being an absence: `planet-watchdog`'s
`simpleTPS_parser` reads the instrument's own export and emits `estimated_Emax`
in MeV — the right quantity and unit for one of the two keys — but *which* one
is carried in the file name (`… Spektrum Particle__p.txt`) and not in the
header, so a producer choosing from the header alone would file Si¹¹⁺ spectra as
protons. That is precisely the confusion the two keys were split to prevent, so
the parser claims neither and says so in its descriptor. Closing it needs an
operator ruling on the file-name convention, or an export that states the
species.
**Since 2026-08-31** the `producer.*` namespace is registered (bridge profile
v3). It is the only namespace the NeXus writer promotes to a *column* rather
than to a value: `metadata.producer.instance_id` becomes
`/entry/source_events/producer_instance_id`, so two DAQ File Watchdog PCs
publishing the same `kind` and the same local filename can be told apart from a
projection rule. It is descriptive only — `event_id` remains the discriminator,
and a producer that never sets it writes `""`.
**Since 2026-09-29** the `instrument.*`, `attribution.*` and `acquisition.*`
namespaces are registered (decision D2 of the combo's automatic shot assembly
plan; change class `additive-metadata`, so `hzdr-event-v1` is unchanged) —
ahead of any producer, so renaming one after the first producer emits it is a
breaking change. The string enums are written down as `METADATA_KEY_VALUES` in
code (which now also holds `laser.polarization`'s vocabulary) and are linted
exactly like polarization: warned about, case-insensitively, never rejected.
`instrument.id` is promoted to the `/entry/source_events/instrument_id` column
(bridge profile v4, `""` when absent); the other keys stay in `metadata_json`
for audit and review. The same decision round (D1) registered
`experiment_id: "unassigned"` as the sentinel a producer sends when it does not
know the campaign (`UNASSIGNED_EXPERIMENT_ID`); see
[hzdr/docs/architecture.md](hzdr/docs/architecture.md#campaign-resolution).

| Namespace | Key | Canonical unit |
| --- | --- | --- |
| `target.*` | `thickness` | nm |
| `target.*` | `diameter` | mm |
| `target.*` | `temperature` | °C (`degC`) |
| `target.*` | `gas_pressure` | bar |
| `laser.*` | `pulse_energy` | J |
| `laser.*` | `pulse_duration` | fs |
| `laser.*` | `wavelength` | nm |
| `laser.*` | `beam_pos_x` / `beam_pos_y` | mm |
| `laser.*` | `beam_waist_x` / `beam_waist_y` | um |
| `laser.*` | `repetition_rate` | Hz |
| `laser.*` | `polarization` | — (string enum: `LASER_POLARIZATION_VALUES`) |
| `laser.*` | `contrast_ratio` | — (dimensionless) |
| `laser.*` | `system` | — (string) |
| `vacuum.*` | `chamber_pressure` | mbar |
| `vacuum.*` | `pre_shot_pressure` | mbar |
| `vacuum.*` | `rga_dominant_species` | — (string) |
| `run.*` | `facility`, `beamline`, `pi`, `start_utc`, `end_utc` | n/a (non-numeric) |
| `diagnostic.*` | `xray_counts` | counts |
| `diagnostic.*` | `detector_signal_mean` | — (arbitrary/dimensionless) |
| `diagnostic.*` | `alignment_score` | — (dimensionless, 0–1) |
| `diagnostic.*` | `tps90_proton_energy` | MeV |
| `diagnostic.*` | `tps90_si11_energy` | MeV |
| `diagnostic.*` | `radiation_dose` | uSv |
| `producer.*` | `instance_id` / `host` | — (string) |
| `instrument.*` | `id` | — (string or null; instrument-catalogue id) |
| `instrument.*` | `group` | — (string enum: `ions`, `electrons`) |
| `instrument.*` | `timing_role` | — (string enum: `on_shot`, `pre_shot`) |
| `instrument.*` | `format` | — (string; pack/format id) |
| `instrument.*` | `record_source` | — (string enum: `catalogue`, `catalogue+labfrog`, `watch_rule`, `none`) |
| `attribution.*` | `method` | — (string enum: `trigger_window`, `filename_counter`, `cadence`, `manual`) |
| `attribution.*` | `status` | — (string enum: `attributed`, `ambiguous`, `no_trigger`, `rescan`, `unregistered`) |
| `attribution.*` | `delta_s` | s |
| `attribution.*` | `candidates` | — (list of shot numbers) |
| `acquisition.*` | `time` | — (ISO-8601 UTC string) |
| `acquisition.*` | `time_source` | — (string enum: `filename`, `first_seen`, `mtime`, `none`) |
| `acquisition.*` | `laserdata_counter` | — (integer; LaserData's own row counter, provenance only, never a shot number) |

See [hzdr/docs/target-ontology.md §5](hzdr/docs/target-ontology.md#5-units-convention) and
[hzdr/docs/standards-alignment.md §3.3/§3.5](hzdr/docs/standards-alignment.md#33-laser-parameters)
for the full rationale and HELPMI cross-walk.

### NeXus bridge profile: `hzdr-canonical-shot-v5`

Stamped as `damnit_bridge_profile` on HDF5 root and `/entry/shots`. Current value: `"hzdr-canonical-shot-v5"`. Version 2 added the shot-aligned `target_metadata_json` column so campaign-varying targets are not lost behind the `/entry/sample` snapshot. **Version 3 (2026-08-31)** adds `/entry/source_events/producer_instance_id`, promoted from `metadata.producer.instance_id`, so a reviewed openPMD projection rule can name the emitting PC; see [hzdr/docs/plans/openpmd-projection-plan.md](hzdr/docs/plans/openpmd-projection-plan.md). **Version 4 (2026-09-29)** adds `/entry/shots/experiment_id_source` (why the shot is in this campaign: `labfrog` / `schedule` / `ruling` / `producer` / `unassigned`, see [architecture.md](hzdr/docs/architecture.md#campaign-resolution)) and `/entry/source_events/instrument_id` (from `metadata.instrument.id`, `""` when absent). **Version 5 (2026-10-01)** adds `/entry/shots/labfrog_local_count`: LabFrog's `shots.local_count` (labfrog-sqlite-tools schema v12), the experimenters' Count from LabFrog's local-counter reset, written beside each shot as a user aid so the NeXus file can be searched by the number on the Shotsheet. It is *not* an identifier and never stands in for the shot authority's `shot_number`; the dataset's `description` attribute says so, and the name deliberately avoids a `shot_number` prefix (the shot aligner's rule G8). `-1` where LabFrog has no count (no active reset, a pre-v12 export, a LabFrog NeXus source, or a trigger-only shot). Bump this string if the bridge table layout changes (columns added/removed from the shot or source-events groups).

**Axes.** `/entry/shots/*` is the only shot-indexed group. `/entry/source_events` is event-indexed and `/entry/data_products` is product-indexed; both carry a `shot_key` column and must be *joined*, never zipped by position.

The builder now includes trigger-only rows when it preserves a LabFrog NeXus
file. They are appended to `/entry/shots`, with empty LabFrog fields and
`labfrog_shot_count` marking the original prefix. Preserved `/entry/derived`
arrays still describe that LabFrog prefix. `/entry/instrument/<instrument.id>`
is an `NXcollection` index of source-event rows for a declared instrument; its
`event_index` points into `/entry/source_events`. Unregistered files get no
instrument group. `/entry/shot_containers` (campaign output phase 4) is an
`NXcollection` index (`shot_key`/`container` datasets) of the per-shot
containers in `shots/`, which the file links at its root, one relative
external link per container named by its stem. These additive views
keep the v5 table columns unchanged.

### Shared Pydantic field constraints (`api/src/damnit_api/shared/models.py`)

| Type | Constraint |
|------|------------|
| `ProposalNumber` | `int`, exclusive range `(0, 9_999_999)` — `gt=0, lt=9999999` |
| `ProposalId` | `int`, exclusive range `(0, 9_999_999)` — `gt=0, lt=9999999` |
| `ProposalCycle` | `str` matching `^\d{6}$` (e.g. `"202501"`) |

### Match quality ranks (ascending, `hzdr_nexus.MATCH_RANK`)

`unmatched` (0) → `labfrog_only` (1) → `nearest_time` (2) → `shot_number_time_window` (3) → `exact_day_shot_number_time_window` (4) → `shot_number` (5) → `exact_day_shot_number` (6) → `event_identity` (7) → `exact_transport_position` (8) → `exact_kafka_event_id` (9)

Higher rank wins when two matches compete for the same shot. `_match_event_ranked`
tries them top down: the event's Kafka `event_id`, then its `topic/partition/offset`,
then — by default (`TIME_MATCH_AUTOASSIGN=false`, ruling A7) — an authoritative
`shot_number` held by exactly one shot, on its day (`exact_day_shot_number`) or
any other (`shot_number`, plan W6.2). Then, and for a number several shots hold,
the `shot_number` on the event's campaign-local day (disambiguated by
time when that day has several), the same number on any day within the
tolerance, and nearest time alone. `event_identity` marks events on a shot
built from the events themselves, grouped by shot number with no LabFrog record
(`_canonical_from_event_identities`), and `labfrog_only` a LabFrog shot no event
reached. The three time-based ranks
(`_TIME_BASED_MATCH_QUALITIES`) become review candidates instead of attaching
unless `TIME_MATCH_AUTOASSIGN` is `true`, and the `shot_number` rank is used
only while it is `false`, so opting back in restores the earlier ladder exactly. `ambiguous` is a status, not a rank
(`MATCH_RANK.get(q, 0)`).

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

`damnit-api` current: **`0.3.1`** (see `api/pyproject.toml`). No runtime version endpoint exists; bump this when the public schema changes.

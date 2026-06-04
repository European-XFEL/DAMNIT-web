# DAMNIT-web HZDR Flow

## Purpose

HZDR mode exposes DAMNIT folders through DAMNIT-web without requiring an
immediate proposal-less rewrite. The compatibility path is:

```text
frontend/source key -> API resolver -> DAMNIT folder -> runs.sqlite
```

The internal setting name still uses `proposal` for compatibility, but HZDR
config values are source keys.

## Configuration

Settings are defined in:

```text
api/src/damnit_api/shared/settings.py
```

They are loaded from `api/.env` and environment variables with the `DW_API_`
prefix. Nested settings use double underscores:

```env
DW_API_AUTH__MODE=ldap
DW_API_METADATA__PROVIDER=mongo
DW_API_DAMNIT__PATHS_BY_PROPOSAL__hzdr=C:/data/hzdr/damnit-db
```

Tracked examples:

```text
api/.env.test.example
api/.env.hzdr.example
api/.env.exfel.example
```

Local secrets and machine-specific paths belong in untracked `api/.env`.

## Deployment Profiles

| Concern | HZDR | EXFEL |
| --- | --- | --- |
| Auth | `DW_API_AUTH__MODE=ldap` | `DW_API_AUTH__MODE=oauth` |
| Metadata | `local` or `mongo` | `mymdc` |
| UI terminology | `Source/Sources` | `Proposal/Proposals` |
| DAMNIT lookup | source key to folder | proposal discovery or configured path |

Runtime terminology is exposed through:

```text
GET /config/runtime
```

The frontend uses that endpoint for labels and route behavior.

## Local HZDR Setup

Generated fixtures:

```bash
cd api
uv run python scripts/generate-hzdr-example.py
cp .env.test.example .env
cd ..
bash scripts/hzdr-launch.sh
```

```powershell
cd api
uv run python scripts/generate-hzdr-example.py
Copy-Item .env.test.example .env
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

LabFrog/VLS-style MongoDB:

```bash
cd api
cp .env.hzdr.example .env
DW_API_METADATA__MONGO_URI="mongodb://USER:PASSWORD@localhost:27018/?authSource=admin" \
  uv run -m damnit_api.main
```

```powershell
cd api
Copy-Item .env.hzdr.example .env
.\scripts\hzdr-dev.ps1 -Provider labfrog -WithGui -MongoUri "mongodb://USER:PASSWORD@localhost:27018/?authSource=admin"
```

Open:

```text
http://127.0.0.1:5173/home
http://127.0.0.1:5173/flow-monitor
http://127.0.0.1:8000/metadata/hzdr/sources
```

The local flow monitor can emulate three package paths:

| Button | Local behavior |
| --- | --- |
| LaserData | Appends a new shot through an ASAPO-shaped event |
| PLANET Watchdog | Enriches the latest shot through `planet.watchdog.events` |
## EXFEL Setup

EXFEL keeps OAuth, MyMdC, and proposal terminology:

```env
DW_API_AUTH__MODE=oauth
DW_API_METADATA__PROVIDER=mymdc
DW_API_DEPLOYMENT__PROFILE=exfel
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Proposal
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Proposals
DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=true
```

Then add OAuth and MyMdC credentials through `api/.env` or deployment secrets.

Development launcher:

```powershell
cd api
Copy-Item .env.exfel.example .env
.\scripts\damnit-api-dev.ps1
```

## Frontend Flow

HZDR branch (`uses_proposals=false`):

- load runtime config;
- fetch `/metadata/hzdr/sources`;
- show source cards on `/home`;
- open `/source/{source_key}`;
- fetch shots from `/metadata/hzdr/sources/{source_key}/shots`;
- display fixed metadata columns, context columns, HDF5 previews, and selected
  cell details.

EXFEL branch (`uses_proposals=true`):

- open `/proposal/{proposal_key}`;
- query GraphQL with `proposal`;
- resolve DAMNIT path from config or discovery;
- read `runs.sqlite` and render the existing proposal dashboard.

## Metadata Providers

HZDR mode does not require MyMdC.

Provider roles:

| Provider | Use |
| --- | --- |
| `local` | Generated JSON/HDF5 fixtures |
| `mongo` | LabFrog/VLS-style source and shot metadata |
| `mymdc` | EXFEL proposal metadata |

MongoDB remains live metadata. The HDF5 builder consumes staged event packages,
for example `events/*.jsonl`, grouped by `experiment_id + shot_id`, and writes
the combined experiment HDF5 file.

Future SciCat integration should publish after this ordered package/HDF5
boundary has a coherent shot or experiment record. Watchdog-related apps
should keep emitting operational/enrichment events instead of owning catalog
writes directly.

The DAMNIT-side transition helper is:

```bash
cd api
uv run python scripts/publish-hzdr-catalog.py --dry-run --limit 1
```

Its preferred target is a future `POST /scicat/from-damnit` endpoint. Until that
exists, the helper can fall back to the current `POST /scicat/from-json` payload
shape exposed by `scicat-plugin`.

Proposed `/scicat/from-damnit` payload boundary:

| Field | Purpose |
| --- | --- |
| `schema` | Versioned payload name, currently `damnit-web-hzdr.catalog.v1` |
| `source` | DAMNIT source key, title, and source metadata |
| `shot` | Shot number, shot ID, experiment ID, fired time, and merged shot metadata |
| `dataset` | File path, file manifest, title, dataset type, and SciCat metadata |

## Context Files

HZDR context files are stored per source and user:

```text
PUT /contextfile/campaign/{source_key}/me/files/{file_name}
```

Default storage:

```env
DW_API_CONTEXT_WORKSPACE__STORAGE=local
DW_API_CONTEXT_WORKSPACE__ROOT=../.generated/context-workspaces
DW_API_CONTEXT_WORKSPACE__WRITE_ENABLED=true
```

File layout:

```text
<root>/<source-key>/<user>/context.py
<root>/<source-key>/<user>/<save-as-name>.py
```

This keeps executable Python separate from live shot metadata. A central
context store can be added later behind the same API.

## Auth

- `oauth`: existing OIDC login flow.
- `ldap`: `/ldap/login` binds/searches LDAP and stores normalized session user
  info.
- GraphQL and write-capable REST endpoints read the session user for
  authorization.

Production deployments should set a non-default `DW_API_SESSION_SECRET` and
require authenticated sessions for all write operations.

## Design Boundary

HZDR-specific behavior stays at the edges:

- source-key to path resolution;
- auth backend selection;
- metadata provider selection;
- runtime terminology;
- source-specific context files.

Core table reads remain standard DAMNIT `runs.sqlite` access, which keeps
upstream DAMNIT-web updates easier to merge.

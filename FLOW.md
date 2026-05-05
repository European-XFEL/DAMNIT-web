# DAMNIT-web HZDR Flow

## Goal

Expose HZDR DAMNIT folders through DAMNIT-web with the least possible fork from
regular DAMNIT/DAMNIT-web.

The starter approach is:

```text
frontend proposal key -> API source key -> configured DAMNIT folder -> runs.sqlite
```

So a URL such as:

```text
/proposal/hzdr
```

can resolve to:

```text
C:/data/hzdr/damnit-db/runs.sqlite
```

## Why This Shape

DAMNIT-web currently assumes a proposal number in these places:

- frontend route: `/proposal/:proposal_number`
- GraphQL input: `database: { proposal: "..." }`
- dynamic Strawberry type names such as `p2956`
- DAMNIT API/database lookup helpers

The regular HZDR DAMNIT work in `DAMNIT-tippey` already keeps folder-first UX
while preserving an internal key for backend compatibility. DAMNIT-web follows
the same pattern here: use a stable key now, migrate UI language later.

## Where Config Lives

The API settings are defined in:

```text
api/src/damnit_api/shared/settings.py
```

They are loaded by `pydantic-settings` from:

```text
api/.env
environment variables
```

Every API setting uses the prefix:

```text
DW_API_
```

Nested settings use double underscores:

```text
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Source
DW_API_METADATA__PROVIDER=mongo
DW_API_DAMNIT__PATHS_BY_PROPOSAL__hzdr=C:/data/hzdr/damnit-db
```

Tracked examples:

```text
api/.env.test.example
api/.env.hzdr.example
api/.env.exfel.example
```

Local machine secrets and paths belong in untracked:

```text
api/.env
```

## Config Blocks

There are four separate decisions. Keeping them separate is what lets HZDR and
EXFEL use the same code with different config.

| Concern | Setting | HZDR value | EXFEL value |
| --- | --- | --- | --- |
| Auth | `DW_API_AUTH__MODE` | `ldap` | `oauth` |
| Metadata provider | `DW_API_METADATA__PROVIDER` | `local`, `mongo`, later `vlsmongo` | `mymdc` |
| User-facing words | `DW_API_DEPLOYMENT__TERMINOLOGY__...` | `Source/Sources` | `Proposal/Proposals` |
| DAMNIT folder lookup | `DW_API_DAMNIT__PATHS_BY_PROPOSAL__<key>` | source key to folder | optional; fallback proposal discovery |

Important: `PATHS_BY_PROPOSAL` is an internal compatibility name. In HZDR
config, the key is a source key, not a proposal number.

## Minimal HZDR Local Setup

There are three intended config modes.

### Generated Test

Use this when you want to prove the app works without Docker MongoDB, labfrog,
VLS, MyMdC, or real LDAP:

```powershell
cd api
uv run python scripts/generate-hzdr-example.py
Copy-Item .env.test.example .env
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

Open:

```text
http://127.0.0.1:5173/home
http://127.0.0.1:5173/source/hzdr-example
http://127.0.0.1:8000/metadata/hzdr/sources
```

### HZDR Labfrog/VLS

Use this for your existing labfrog/VLS-style MongoDB data:

```env
DW_API_AUTH__MODE=ldap
DW_API_METADATA__PROVIDER=mongo
DW_API_METADATA__MONGO_URI=mongodb://localhost:27018
DW_API_METADATA__MONGO_DATABASE=damnit_web
DW_API_METADATA__MONGO_COLLECTION=hzdr_sources
DW_API_METADATA__MONGO_SHOTS_DATABASE=shotsheet
DW_API_METADATA__MONGO_SHOTS_COLLECTION=shots
DW_API_METADATA__MONGO_SHOTS_SOURCE_FIELD=
DW_API_METADATA__MONGO_SHOTS_NUMBER_FIELD=shot_number
DW_API_METADATA__MONGO_SHOTS_FIRED_AT_FIELD=fired_at
DW_API_DEPLOYMENT__PROFILE=hzdr
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Source
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Sources
DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=false
DW_API_DAMNIT__PATHS_BY_PROPOSAL__hzdr=.
```

Shortcut script:

```powershell
cd api
Copy-Item .env.hzdr.example .env
.\scripts\hzdr-dev.ps1 -Provider labfrog -WithGui -MongoUri "mongodb://USER:PASSWORD@localhost:27018/?authSource=admin"
```

## Minimal EXFEL Setup

EXFEL keeps proposal and MyMdC behavior:

```env
DW_API_AUTH__MODE=oauth
DW_API_METADATA__PROVIDER=mymdc
DW_API_DEPLOYMENT__PROFILE=exfel
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Proposal
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Proposals
DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=true
```

Then add OAuth and MyMdC credentials in `api/.env` or deployment secrets.

Shortcut:

```powershell
cd api
Copy-Item .env.exfel.example .env
uv run -m damnit_api.main
```

## Runtime Config Flow

```mermaid
flowchart TD
    A[api/.env or environment] --> B[Settings in shared/settings.py]
    B --> C[/config/runtime]
    C --> D[Frontend labels and navigation wording]
    B --> E[Auth bootstrap]
    B --> F[Metadata provider]
    B --> G[DAMNIT path resolver]
```

Debug the resolved runtime config with:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/config/runtime
```

## Current Starter Flow

### HZDR: source and shot UI

When `GET /config/runtime` returns `uses_proposals=false`, the frontend takes
the HZDR branch:

```mermaid
flowchart TD
    A[User opens /home] --> B[Frontend reads /config/runtime]
    B --> C{uses_proposals?}
    C -- false --> D[Fetch /metadata/hzdr/sources]
    D --> E[Show HZDR source cards]
    E --> F[User opens /source/source_key]
    F --> G[Fetch /metadata/hzdr/sources/source_key/shots]
    G --> H[Show shot_number + fired_at table]
```

The first HZDR implementation is intentionally shot-first:

```text
source -> shots -> shot_number + fired_at -> HDF5 placeholder + Mongo metadata
```

The current shot table fields are placeholders:

```text
shot_number
fired_at
status
laser_energy_j
target
hdf5_path
```

Replace these with the real VLS MongoDB and HDF5 fields once the deployment
schemas are known.

### EXFEL: proposal UI

When `GET /config/runtime` returns `uses_proposals=true`, the frontend keeps the
existing EXFEL path:

```mermaid
flowchart TD
    A[User opens /proposal/hzdr] --> B[Frontend GraphQL proposal=hzdr]
    B --> C[DAMNIT-web API]
    C --> D{Configured path for hzdr?}
    D -- yes --> E[Open configured DAMNIT folder]
    D -- no --> F[Fallback to proposal discovery]
    E --> G[Read runs.sqlite]
    F --> G
    G --> H[Return table metadata and run data]
```

For EXFEL this remains:

```text
proposal -> MyMdC proposal metadata -> DAMNIT proposal folder -> runs.sqlite
```

## Metadata Sources

HZDR/local mode must not depend on MyMdC. MyMdC is only an optional XFEL
metadata provider.

Planned HZDR providers:

```text
local JSON/YAML files -> source metadata and test fixtures
Docker MongoDB       -> local integration testing
HDF5 files           -> deployment data and extracted previews
VLS MongoDB          -> deployment metadata/events
```

Starter provider flow:

```mermaid
flowchart TD
    A[DW_API_METADATA__PROVIDER] --> B{local or mongo}
    B -- local --> C[generated hzdr_sources.json]
    B -- mongo --> D[configured MongoDB hzdr_sources]
    D --> H[Optional shotsheet.shots hydration]
    C --> E[HZDRSource records]
    H --> E
    E --> F[/metadata/hzdr/sources]
    E --> G[DAMNIT source key to folder mapping]
```

## Runtime Terminology

The API contract still uses `proposal` where changing it would cause avoidable
frontend and GraphQL churn. User-facing language should come from runtime
configuration instead:

```text
GET /config/runtime
```

HZDR defaults:

```text
profile=hzdr
metadata_provider=local|mongo
identity_label=Source
identity_label_plural=Sources
uses_proposals=false
uses_mymdc=false
```

EXFEL config:

```text
profile=exfel
metadata_provider=mymdc
identity_label=Proposal
identity_label_plural=Proposals
uses_proposals=true
uses_mymdc=true
```

Frontend rule:

```text
Use `/config/runtime` for labels and navigation wording.
Keep GraphQL variable names stable until we intentionally migrate the API.
```

The provider boundary should be:

```text
source key -> metadata provider -> DAMNIT folder/data files
```

not:

```text
source key -> fake proposal -> MyMdC compatibility shim
```

## Context File Storage

The HZDR context builder saves editable Python context files through:

```text
PUT /contextfile/campaign/{source_key}/me/files/{file_name}
```

Default storage is local on the API host:

```env
DW_API_CONTEXT_WORKSPACE__STORAGE=local
DW_API_CONTEXT_WORKSPACE__ROOT=../.generated/context-workspaces
DW_API_CONTEXT_WORKSPACE__WRITE_ENABLED=true
```

Files are written under:

```text
<root>/<source-key>/<user>/context.py
<root>/<source-key>/<user>/<save-as-name>.py
```

This is intentionally separate from MongoDB shot metadata. It keeps context
editing simple for the starter version and avoids putting executable Python in
the live shot database. A Mongo-backed context store can be added later behind
the same API if deployment needs central storage.

## Auth Flow

```mermaid
flowchart TD
    A[DW_API_AUTH__MODE] --> B{oauth or ldap}
    B -- oauth --> C[Existing OAuth/OIDC login]
    C --> D[Session userinfo from provider]
    B -- ldap --> E['/ldap/login username/password']
    E --> F[LDAP bind and optional user search]
    F --> G[Session userinfo normalized to existing shape]
    D --> H[GraphQL and REST dependencies read session user]
    G --> H
```

## Implementation Plan

1. Keep regular DAMNIT-web behavior intact.
2. Add a configuration layer that maps source keys to DAMNIT database folders.
3. Route API database access through that resolver.
4. Add LDAP as a second session-auth backend, preserving the existing session
   user shape.
5. Make MyMdC optional and skip it in local/HZDR mode.
6. Add tests around resolver, auth normalization, and no-MyMdC startup.
7. Next: update frontend login UX for LDAP mode.
8. Next: add a file-backed HZDR source provider for test/development fixtures.
9. Next: add Docker MongoDB and VLS MongoDB provider modules.
10. Next: add a HZDR source list/home view so users do not have to know the
   source key.
11. Later: decide whether true proposal-less GraphQL naming is worth the churn.

## Longer-Term Modularization

Keep HZDR-specific pieces at edges:

- config maps source keys to paths;
- auth backend switches between OAuth and LDAP;
- metadata/provider modules can later distinguish XFEL proposal metadata from
  HZDR folder/source metadata;
- core table reads stay against standard DAMNIT `runs.sqlite`.

This should make upstream DAMNIT-web updates easier to merge because the core
GraphQL table model does not need an immediate rewrite.

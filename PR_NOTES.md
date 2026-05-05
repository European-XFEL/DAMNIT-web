# PR Notes

## Summary

This starter change begins wrapping the HZDR/folder-first DAMNIT workflow into
DAMNIT-web without forcing a proposal-less backend migration. It does not
require MyMdC for HZDR/local deployments. The web API can map stable source keys
such as `hzdr` directly to DAMNIT database folders.

It also adds a clean LDAP authentication entry point alongside the existing
OAuth/OIDC flow used for Helmholtz-style login.

## Reviewer-Facing Changes

- **HZDR database resolution**
  - Adds `DW_API_DAMNIT__DEFAULT_PATH` for a default DAMNIT database folder.
  - Adds `DW_API_DAMNIT__PATHS_BY_PROPOSAL__<key>` for source-key mappings,
    e.g. mapping `hzdr` to a folder-based DAMNIT database.
  - Keeps Maxwell/XFEL proposal discovery as a fallback.

- **Authentication backend selection**
  - Adds `DW_API_AUTH__MODE=oauth|ldap`.
  - Keeps existing OAuth behavior for Helmholtz/OIDC deployments.
  - Adds `/ldap/login` and `/ldap/logout` for deployments that authenticate
    against LDAP directly.

- **MyMdC optional**
  - Adds `DW_API_METADATA__PROVIDER=local|mymdc`.
  - Defaults to `local`, so app startup does not bootstrap or contact MyMdC.
  - GraphQL/userinfo paths tolerate a missing MyMdC client in local/HZDR mode.

- **HZDR local and Mongo metadata**
  - Adds a file-backed HZDR source provider.
  - Adds a MongoDB-backed HZDR source provider for labfrog/VLS-style testing.
  - Adds an ignored example generator instead of tracked Mongo/HDF5 fixture
    blobs, so local demos can be regenerated without stale seed data.

- **Deployment terminology**
  - Adds `GET /config/runtime` so clients can display HZDR terms such as
    `Source/Sources` while EXFEL deployments can keep `Proposal/Proposals`.
  - Keeps the internal GraphQL compatibility field named `proposal` for now.
  - Adds three tracked config examples:
    - `api/.env.test.example` for generated local examples.
    - `api/.env.hzdr.example` for HZDR labfrog/VLS MongoDB.
    - `api/.env.exfel.example` for EXFEL OAuth/MyMdC.

- **HZDR shot/source UI starter**
  - HZDR config now renders source cards on `/home`, not the proposal list.
  - Adds `/source/{source_key}` as the starter HZDR source-detail route.
  - Adds placeholder shot rows with `shot_number`, `fired_at`, HDF5 path, and
    Mongo-style metadata fields.
  - EXFEL config keeps the existing proposal/MyMdC UI path.

- **Minimal user effort**
  - A starter HZDR deployment can use the existing frontend route with a stable
    key, for example `/proposal/hzdr`, while the API maps `hzdr` to the real
    folder path.

## Configuration Sketch

```env
DW_API_AUTH__MODE=ldap
DW_API_AUTH__LDAP__SERVER_URL=ldaps://ldap.example.org
DW_API_AUTH__LDAP__BIND_DN_TEMPLATE=uid={username},ou=people,dc=example,dc=org
DW_API_AUTH__LDAP__USER_SEARCH_BASE=ou=people,dc=example,dc=org
DW_API_METADATA__PROVIDER=local
DW_API_METADATA__MONGO_URI=mongodb://localhost:27018
DW_API_METADATA__MONGO_SHOTS_DATABASE=shotsheet
DW_API_METADATA__MONGO_SHOTS_COLLECTION=shots
DW_API_DAMNIT__PATHS_BY_PROPOSAL__hzdr=C:/data/hzdr/damnit-db
```

For generated local example data:

```powershell
cd api
uv run python scripts/generate-hzdr-example.py
$env:DW_API_METADATA__PROVIDER = "local"
$env:DW_API_METADATA__SOURCES_FILE = "../.generated/hzdr-example/hzdr_sources.json"
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

For Helmholtz/OIDC login, keep `DW_API_AUTH__MODE=oauth` and configure the
existing client ID, client secret, and metadata URL values.

For EXFEL/MyMdC terminology:

```env
DW_API_AUTH__MODE=oauth
DW_API_METADATA__PROVIDER=mymdc
DW_API_DEPLOYMENT__PROFILE=exfel
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME=proposal
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME_PLURAL=proposals
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Proposal
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Proposals
DW_API_DEPLOYMENT__TERMINOLOGY__COLLECTION_LABEL=Proposals
DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=true
```

## Validation

- Added focused tests for:
  - source-key to DAMNIT-folder resolution;
  - explicit path preference;
  - LDAP record conversion into the existing session user shape.
  - app startup without a configured MyMdC client.
  - file-backed HZDR source loading from temporary test data.
  - HZDR shot record mapping.

## Caveats

- The frontend still speaks in proposal routes and proposal GraphQL variables.
  The starter compatibility layer treats those values as source keys.
- LDAP login has an API endpoint, but the existing frontend login button still
  redirects to OAuth. A small frontend login form is the next step for pure LDAP
  deployments.
- HZDR metadata providers for generated local files, labfrog/VLS MongoDB, and
  HDF5 links should stay separate from MyMdC shims.
- This does not attempt true proposal-less DAMNIT storage. It is intentionally a
  compatibility bridge so regular DAMNIT updates remain easy to apply.

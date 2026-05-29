# PR Notes

## Summary

This change adds HZDR source-first support to DAMNIT-web while keeping the
existing proposal-oriented backend contract intact. HZDR deployments can map
stable source keys to DAMNIT folders, use local or Mongo-backed metadata, and
run without MyMdC.

It also adds LDAP as an authentication backend alongside the existing
OAuth/OIDC flow.

## Main Changes

- Source-key to DAMNIT-folder resolution through
  `DW_API_DAMNIT__PATHS_BY_PROPOSAL__<key>`.
- Runtime terminology from `GET /config/runtime`, allowing HZDR deployments to
  display `Source/Sources` while EXFEL keeps `Proposal/Proposals`.
- Optional metadata providers:
  - `local` for generated HZDR fixtures;
  - `mongo` for LabFrog/VLS-style source and shot metadata;
  - `mymdc` for EXFEL.
- LDAP session login endpoints:
  - `POST /ldap/login`
  - `POST /ldap/logout`
- HZDR source UI:
  - `/home` source cards;
  - `/source/{source_key}` shot table;
  - context columns and HDF5 previews;
  - flow monitor for local and production traffic visibility.
- Context workspace endpoints for per-user, per-source Python context files.
- Separate API launchers for development and deployment.

## Configuration Sketch

```env
DW_API_AUTH__MODE=ldap
DW_API_AUTH__LDAP__SERVER_URL=ldaps://ldap.example.org
DW_API_AUTH__LDAP__BIND_DN_TEMPLATE=uid={username},ou=people,dc=example,dc=org
DW_API_AUTH__LDAP__USER_SEARCH_BASE=ou=people,dc=example,dc=org

DW_API_METADATA__PROVIDER=mongo
DW_API_METADATA__MONGO_URI=mongodb://localhost:27018
DW_API_METADATA__MONGO_DATABASE=damnit_web
DW_API_METADATA__MONGO_COLLECTION=hzdr_sources
DW_API_METADATA__MONGO_SHOTS_DATABASE=shotsheet
DW_API_METADATA__MONGO_SHOTS_COLLECTION=shots

DW_API_DEPLOYMENT__PROFILE=hzdr
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Source
DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Sources
DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=false

DW_API_DAMNIT__PATHS_BY_PROPOSAL__hzdr=C:/data/hzdr/damnit-db
```

Local generated data:

```powershell
cd api
uv run python scripts/generate-hzdr-example.py
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

Development API:

```powershell
cd api
.\scripts\damnit-api-dev.ps1
```

Deployment API:

```powershell
cd api
.\scripts\damnit-api-deploy.ps1 -HostAddress 0.0.0.0 -Port 8000
```

## Validation

- Source-path resolution tests.
- Runtime configuration tests.
- Auth mode and unauthenticated-write tests.
- HZDR source provider tests.
- HZDR package emulator tests.
- Context workspace and context-result tests.
- Data normalization compatibility tests.
- Frontend typecheck, lint, and production build.
- MkDocs strict build.

## Caveats

- Internal GraphQL variables still use `proposal` for compatibility.
- LDAP has backend endpoints; a dedicated frontend LDAP login form is still a
  future UI improvement.
- Full backend test collection now works, but existing GraphQL tests still have
  contract drift unrelated to the HZDR changes.

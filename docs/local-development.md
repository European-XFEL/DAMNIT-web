# Local Development

## Repositories

```text
GitHub/DAMNIT-web-hzdr
GitLab/asapo-for-hzdr-damnit
GitLab/labfrog
GitLab/labfrog-sqlite-tools-repo
GitLab/planet-watchdog
```

Launchers discover sibling checkouts or use `scripts/hzdr-launch.config.json`.

```powershell
.\scripts\hzdr-launch.ps1 -InitConfig
.\scripts\hzdr-launch.ps1 -ValidateOnly
.\scripts\hzdr-launch.ps1
```

Linux uses the equivalent `scripts/hzdr-launch.sh` commands.

## Build A Pilot File

First export the selected campaign with `labfrog-sqlite-tools`. Then, from
`api`, run:

```powershell
uv run python scripts\hzdr-hdf5-builder.py `
  --labfrog-nexus <labfrog.nxs> `
  --labfrog-sqlite <labfrog.sqlite> `
  --events-jsonl <laserdata.jsonl> `
  --watchdog-jsonl <watchdog.jsonl> `
  --trigger-jsonl <draco.jsonl> `
  --experiment-id Solenoid_Beamline_Tests_01.2025 `
  --source-key hzdr-solenoid-beamline-tests-01-2025 `
  --campaign-timezone Europe/Berlin `
  --output-nexus <canonical.nxs> `
  --sources-file <hzdr_sources.json>
```

Point the API at the catalog:

```powershell
$env:DW_API_METADATA__PROVIDER = "local"
$env:DW_API_METADATA__SOURCES_FILE = "<hzdr_sources.json>"
uv run -m damnit_api.main
```

Generated emulator files live under `.generated/hzdr-package-emulator`.

To check the local vertical slice (emulator events through Confirm Matches)
without building a real pilot file, run
`uv run python scripts/hzdr-local-acceptance.py` from `api`, or
`scripts/test.ps1 -WithAcceptance` from the repo root. Testing commands are
in [testing.md](testing.md).

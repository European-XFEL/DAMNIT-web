# Handoff

Updated: 2026-11-11, from the hzdr-combo handoffs of 2026-11-09 to 2026-11-11
(`planning/handoffs/HANDOFF-2026-11-11.md` and its checklist), not from a
fresh look at the host. The July 2026 version of this page (pilot gates,
local test counts) is in git history.

## What is deployed on fwkt-webapps

On 2026-11-11 the host pulled every merged change and restarted every unit
(last at 11:52 CET); `server-report.sh` then gave **63 PASS, 4 WARN, 0 FAIL**.
The four warnings are expected: no shot-authority state file and no stamped
trigger yet, and untracked files in two other checkouts.

| Part | State on 2026-11-11 |
| --- | --- |
| DAMNIT (`damnit-api`, checkout `~/DAMNIT-web-hzdr`) | `main` at `34cc0958`, restarted 11:12 after `uv sync --locked`. Until then it ran the 2026-11-04 code: a pull is not a deploy. Bridge profile v6 (`/entry/shots/authority_shot_number`), schema-14 campaign resolution and the re-vendored packs (#34) are live |
| Kafka spool consumer, multi-campaign builder, SciCat registration | on (combo ledger `I2`, `I12`) |
| LabFrog (`labfrog-shotsheet`) | `develop` at `99f5958`, with **Beamtime Setup** (Form Builder > Beamtime Setup) and the campaign-scoped setup pages, and its documentation served offline on the host (`DOCS_URL = "/docs/"`) |
| LabFrog shot intake (`labfrog-shot-intake`) | new unit, started 10:57: the ZMQ `:2951` listener now runs outside the web app (`SHOT_DETAILS_ZMQ_RUNNER = "service"`), so restarting the web app no longer drops shots. `poe check-shot-intake` passes |
| Shot authority (`planet-watchdog-shot-authority`) | restarted 11:02 onto `f011ff7`; `check-shot-authority.sh` passes. **No trigger has ever reached it**: `draco.trigger` and `planet.watchdog.events` hold 0 messages |
| LabFrog exports (`labfrog-export-refresh.timer`, every 15 min) | all six campaigns re-exported by hand at schema 14. Since labfrog-sqlite-tools !12 the timer skips a campaign whose source is unchanged, so DAMNIT no longer rebuilds every 15 minutes (95 builds in 24 h before the fix). !13 makes a second export wait on a lock instead of failing with `database is locked` |

## A new beamtime (LabFrog Beamtime Setup)

Beamtime Setup is where a campaign is now prepared, one setup per campaign,
saved as revisions. Its **Outputs** include the form, one
`<PC>.watch_rules.json` per PC for the Share Dog, a `beamtime.toml` record for
hzdr-combo, and **the line for DAMNIT**: `DW_API_HZDR_BUILDER__CAMPAIGNS: add
<experiment_id>`. What to do with that line is in the operations guide,
[A new beamtime](../guides/operations.md#a-new-beamtime-from-labfrogs-beamtime-setup).
Its **Check connections** panel calls DAMNIT's `GET /config/health` when
LabFrog's `DAMNIT_API_URL` is set.

Trying Beamtime Setup with real data (LabFrog `plan.md` item 19: the watchdog
collection readable, `DAMNIT_API_URL`, `BEAMTIME_RULES_DIR`), then setting up
**Helical coils 2026** with it, is still open.

## Open

1. **DAMNIT registers a new SciCat dataset on every rebuild** (combo ledger
   `I7`, not met). `register_campaign_nexus` reuses the dataset only when the
   file's SHA-256 matches the last registration, but every build stamps
   `damnit_bridge_updated_at`, so it never matches. Successful registrations
   are not logged (the builder sets up no logging; the trigger logs output only
   on failure). The fix (register again only when the content changes, log each
   registration) and the clean-up of the duplicates already in SciCat wait on
   the maintainer.
2. **A rebuilt campaign has `/entry/shots/authority_shot_number`** (bridge v6):
   not yet checked on the host. The auto-trigger does not rebuild after a code
   update; the hand rebuild is in the operations guide.
3. **The first real DRACO trigger.** Then `uv run --no-sync poe
   check-shot-intake --restart-web` in `~/labfrog`. If nothing arrives, check
   the shotcounter → shot authority link (`tcp://149.220.59.31:2950`) first,
   not LabFrog.
4. Deployment-broker restart/replay evidence for DAMNIT (`I5`) and a real
   DAQ File Watchdog event in DAMNIT's spool (`I6`).
5. ASAPO/LaserData stays outside the Kafka pilot until asked.

## Safe local commands

From the DAMNIT repository root on Windows:

```powershell
.\hzdr\scripts\test-pilot-package.ps1 -NoCoverage
.\hzdr\scripts\hzdr-launch.ps1 -ValidateOnly
```

From `api`, the broker-free acceptance path is:

```powershell
uv run python scripts\hzdr-local-acceptance.py
```

Do not infer deployment health from the deterministic local tests.

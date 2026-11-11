# Next on the server (fwkt-webapps)

The open server work from the hzdr-combo handoff of 2026-11-11, in one place.
The mechanical part is one script, `hzdr/scripts/next-on-server.sh`. The rest
needs a person, a decision, or a real shot; those items are listed below the
script, in order.

## 1. Get it and run it

On fwkt-webapps, as `tippey` (not with sudo), once this is on DAMNIT's `main`:

```bash
~/fwkt-webapps/pull-all-repos.sh                         # brings this script with DAMNIT
bash ~/DAMNIT-web-hzdr/hzdr/scripts/next-on-server.sh    # look only: lists what it would do
bash ~/DAMNIT-web-hzdr/hzdr/scripts/next-on-server.sh --apply
```

Without `--apply` it changes nothing. You can run it again: anything already
done is reported as `OK`. One step on its own:
`--apply --step deploy`. Each line starts with `OK`, `TODO` (what `--apply`
would do), `DO` (what it did), `WARN` or `FAIL`. The exit status is the number
of steps that ended in `FAIL`.

| Step | What it does | With `--apply` |
| --- | --- | --- |
| `pull` | `pull-all-repos.sh` (fast-forward only) | pulls; look-only runs `--dry-run` |
| `deploy` | Finds every unit that started before its checkout last moved, so it still runs the old code. On 2026-11-11 every unit but LabFrog had done so for a week. Also checks whether DAMNIT's frontend was built after the last pull | `uv sync` with that app's flags, then `sudo systemctl restart`, then checks the unit is active. The intake restarts before the web app. Rebuilds the frontend if it is stale |
| `tidy` | The two untracked folders `server-report.sh` warns about (asapo's `.env`, labfrog-sqlite-tools' `retained_exports/`, both kept on purpose). The `~/2024_08_08.decisions.json.server` copy | Adds each folder to that checkout's `.git/info/exclude` (this host only, nothing committed). Moves the rulings copy to `~/archive/cleanup-<date>/` if it is byte for byte the committed file; if it differs, it reports `FAIL` and leaves both |
| `rebuild` | Prints the auto-trigger's own builder command and checks each campaign file for `/entry/shots/authority_shot_number` (bridge v6) | Rebuilds with that command (`api/scripts/hzdr-rebuild.py`), then checks again. `--all-campaigns` also rebuilds campaigns that are not listed in `CAMPAIGNS`, see below |
| `labfrog` | Which Beamtime Setup settings are in `~/labfrog/instance/*.cfg` (names only, never values), and whether DAMNIT answers `/config/health` | nothing: settings are a person's call (item 2) |
| `report` | `poe check-shot-intake`, `server-report.sh` (`--quick` when looking only) | also writes `~/deployed-<time>.json` with `report-deployed.sh` |

`--all-campaigns`: the auto-trigger names only campaigns taking shots,
because a named campaign's export may claim `unassigned` triggers during that
build. No trigger has reached the shot authority yet, so rebuilding the old
campaigns once now changes no routing. Use it if the check shows old campaign
files still `MISSING` the column.

## 2. By hand, in order

1. **Beamtime Setup settings in LabFrog** (`~/labfrog/instance/<config>.cfg`,
   then `sudo systemctl restart labfrog-shot-intake labfrog-shotsheet`):
    - `DAMNIT_API_URL = "http://127.0.0.1:8000"`. DAMNIT runs on the same
      host; **Check connections** then probes its `/config/health`.
    - `WATCHDOG_COLLECTION`: the collection the DAQ File Watchdogs write to,
      for **Found on the network**.
    - `BEAMTIME_RULES_DIR`: the Share Dog share's `beamtime-rules` folder,
      only if that share is mounted on fwkt-webapps. Empty means the rule
      files are downloaded instead.

    Then open a campaign in Form Builder > Beamtime Setup and run **Check
    connections** (LabFrog `plan.md` item 19).
2. **Set up Helical coils 2026 in Beamtime Setup.** Carry its DAMNIT line
   (`DW_API_HZDR_BUILDER__CAMPAIGNS: add <experiment_id>`) over as in
   [the operations guide](operations.md#a-new-beamtime-from-labfrogs-beamtime-setup):
   export list, `api/.env`, take out the previous beamtime, restart
   `damnit-api`.
3. **A schema-14 export through shot-aligner:** open a campaign whose export
   is schema 14 (radbio) in the aligner and check that its shots map. This is
   the last part of checklist section C.
4. **Snapshot:** copy the `~/deployed-<time>.json` from step `report` to the
   combo root as `deployed.json`, set `settings.deployedReport`, refresh
   `repos.lock.json`.
5. **At the first real DRACO trigger:** in `~/labfrog`,
   `uv run --no-sync poe check-shot-intake --restart-web`. When it passes,
   `SHOT_DETAILS_ZMQ_RUNNER = "service"` becomes LabFrog's default. If
   nothing arrives, check the shotcounter → shot authority link
   (`tcp://149.220.59.31:2950`) first, not LabFrog. Then the broker
   restart/replay pass (ledger `I5`) and a real watchdog event in DAMNIT's
   spool (`I6`), as in the hub's pilot runbook.

## 3. SciCat: clean up the duplicate datasets

Until the fix of 2026-11-11, every rebuild registered a **new SciCat
dataset** (ledger `I7`): each build stamps `damnit_bridge_updated_at`, so the
file's SHA-256 never matched the last registration. DAMNIT now compares a
**content fingerprint** that leaves that stamp out, so a rebuild with the
same content keeps its dataset. Every build prints one `SciCat:` line, and
the auto-trigger copies it into the `damnit-api` journal:

```bash
journalctl -u damnit-api --since today | grep 'SciCat:'
#  SciCat: Beamline_radbio_2026: unchanged, kept dataset HZDR/...
```

The first build after the deploy registers **once more** per campaign: the
catalog has no fingerprint yet to compare with. From then on, a new dataset
appears only when the content changed. So clean up **after** step `rebuild`
above:

```bash
cd ~/DAMNIT-web-hzdr/api
sudo ../.venv/bin/python scripts/hzdr-scicat-duplicates.py \
    --env-file /etc/fwkt-webapps/scicatplugin.env \
    --sources-file /home/tippey/mnt/bigdata/HPLexp/nexus/hzdr_sources.json \
    --report ~/scicat-duplicates-$(date +%F).json          # look only
# the same with --apply deletes; add --campaign Beamline_radbio_2026 for one
```

It reads SciCat's address and login from the plugin's env file (root-only,
hence `sudo`) and prints nothing secret. For each campaign in DAMNIT's catalog
it keeps the dataset the catalog points at (`scicat_pid`) and every published
dataset, and deletes the others with the same name (`HZDR canonical campaign
(<experiment_id>)`). It handles more than SciCat's 100-per-answer limit.
If the functional account may not delete (HTTP 401/403), it stops and the
`--report` file lists what a SciCat admin should remove.

Still open, needs a decision: **LabFrog's full hub** (`plan.md` item 24): four
decisions before phase 0.

## 4. Waiting on people

- HP's campaign name and instrument list.
- PC, folder and a sample file for TPS45, FF_after_DD and back-refl.
- The Share Dog adopt dialog, tried on a Windows lab PC.

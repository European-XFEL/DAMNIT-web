# Next on the server (fwkt-webapps)

The open server work from the hzdr-combo handoff of 2026-11-11, in one place.
The mechanical part is one script, `hzdr/scripts/next-on-server.sh`. The rest
needs a person, a decision, or a real shot; those items are listed below the
script, in order.

**Short version for a deploy:** [deploy-notes.md](deploy-notes.md), the steps
per PR, newest first.

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
| `deploy` | Finds every unit that started before its checkout last moved, so it still runs the old code. On 2026-11-11 every unit but LabFrog had done so for a week. Also checks whether DAMNIT's frontend was built from the last commit that changed `frontend/` | `uv sync` with that app's flags, then `sudo systemctl restart`, then checks the unit is active. The intake restarts before the web app. Rebuilds the frontend only if `frontend/` changed (`vite build` alone, about a minute; `FRONTEND_TYPECHECK=1` adds `tsc`) |
| `tidy` | The two untracked folders `server-report.sh` warns about (asapo's `.env`, labfrog-sqlite-tools' `retained_exports/`, both kept on purpose). The `~/2024_08_08.decisions.json.server` copy | Adds each folder to that checkout's `.git/info/exclude` (this host only, nothing committed). Moves the rulings copy to `~/archive/cleanup-<date>/` if it is byte for byte the committed file; if it differs, it reports `FAIL` and leaves both |
| `rebuild` | Prints the auto-trigger's own builder command and checks each campaign file for `/entry/shots/authority_shot_number` (bridge v6) and `/entry/labfrog_history` (v7) | Rebuilds with that command (`api/scripts/hzdr-rebuild.py`), then checks again. `--all-campaigns` also rebuilds campaigns that are not listed in `CAMPAIGNS`, see below |
| `labfrog` | That the LabFrog checkout is 0.10.0 or later. Which Beamtime Setup settings are in `~/labfrog/instance/*.cfg` (names only, never values), and whether DAMNIT answers `/config/health`. Whether DAMNIT's campaign schedule is set, exists and is under 7 days old (name and age only), and whether the review rules are on (`TIME_MATCH_ONE_TO_ONE`, how many `NEVER_SHOT_KINDS`), and whether DAMNIT reads shot-aligner's index folder (`ALIGNER_INDEX_DIR`: how many day indexes and decision files, which reviewed dates have no index) | nothing: settings are a person's call (item 2) |
| `report` | `poe check-shot-intake`, `server-report.sh` (`--quick` when looking only) | also writes `~/deployed-<time>.json` with `report-deployed.sh` |

`--all-campaigns`: the auto-trigger names only campaigns taking shots,
because a named campaign's export may claim `unassigned` triggers during that
build. No trigger has reached the shot authority yet, so rebuilding the old
campaigns once now changes no routing. Use it if the check shows old campaign
files still `MISSING` the column.

## 2. By hand, in order

1. **Beamtime Setup settings in LabFrog**, in the `.cfg` the service runs:
   `grep CONFIG_NAME ~/labfrog/.env` names it (on fwkt-webapps
   `shotsheet_protected.cfg`, not the tracked `default.cfg`, whose lines are
   empty placeholders). Then `sudo systemctl restart labfrog-shot-intake
   labfrog-shotsheet`. The script's `labfrog` step only sees that a key is in
   some `.cfg`, so an empty `DAMNIT_API_URL = ""` in `default.cfg` passes it;
   **Check connections** is the real test (DAMNIT `ok ... answers`):
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
6. **After the DAMNIT deploy, check the web UI** (DAMNIT PR #55 to #58; the
   `deploy` step rebuilds the frontend with `VITE_DAMNIT_COMMIT` and copies
   it to nginx). Hard-refresh (Ctrl+Shift+R), then:
    - the header shows no *Out of step with the API* badge (it would mean
      the API was not restarted, or the frontend not rebuilt, after the pull;
      `curl -s 127.0.0.1:8000/config/version` gives the API's commit);
    - Home lists the campaigns with today's counts;
    - a campaign page shows **Views**, **Download CSV** and, on a second
      visit, **New since your last visit**; during a shot day a new shot
      appears in the table within about 20 s, without a reload.
7. **Shot containers: only when you decide to turn them on.** Not a script
   step. Follow
   [the go-live checklist](operations.md#turn-on-the-shot-containers-go-live-checklist):
   phase 6 first (one real campaign built by DAMNIT and by shot-aligner,
   compared with `hzdr-compare-containers.py`), then
   `DW_API_HZDR_BUILDER__CONTAINERS_ENABLED=true` and a first worker pass by
   hand.
8. **Review matches rules (DAMNIT PR #58, ruling R-2026-11-21).** Measured
   on shot-aligner's real shot days
   ([plan-time-rule-real-data.md](../plans/plan-time-rule-real-data.md)):
   **leave `DW_API_HZDR_BUILDER__TIME_MATCH_ONE_TO_ONE` off** for now. On raw
   instrument clocks it pairs files to the wrong shot at 90 s or less (21 to
   56 % of its pairs), and pairs almost nothing at 120 s or more. What
   needs no setting carries the load: the reasons, the suggestions, bulk
   confirm and campaign suggestions. In `~/DAMNIT-web-hzdr/api/.env`:
   ```bash
   # once the test-fire kinds are known (look in Review matches > Unmatched):
   # DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS=["draco.test_fire"]
   ```
   Check `DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE=Europe/Berlin` and
   `CAMPAIGN_SCHEDULE` too (the `labfrog` step reports the schedule and both
   rules). Restart `damnit-api` and rebuild, since a restart builds nothing:
   `cd ~/DAMNIT-web-hzdr/api && uv run --no-sync python scripts/hzdr-rebuild.py`.
   Then open Review matches: every waiting event says *why it waits*.
   **Measure more days on the server**, above all a LabFrog shot day with
   DRACO triggers (that decides whether the rule is worth turning on for
   triggers alone). Use shot-aligner's day index for that date:
   ```bash
   cd ~/DAMNIT-web-hzdr/api
   uv run --no-sync python scripts/hzdr-evaluate-time-rule.py \
       ~/shot-aligner/shot_aligner/index/<date>.index.json --truth matched \
       --json ~/time-rule-<date>.json
   ```
   Look at `wrong` at each tolerance: any wrong pair is a silent error.
   Put the table into the plan's results.

9. **shot-aligner's decisions as DAMNIT's evidence (DAMNIT PR #58,
   rulings R-2026-11-22a/b,
   [plan-aligner-bridge.md](../plans/plan-aligner-bridge.md)).** Until the
   shot authority and the watchdog are everywhere, a file whose shot-aligner
   event a reviewer confirmed attaches in DAMNIT (`aligner_confirmed`). It
   attaches only when the authority number, the LabFrog record and the Count
   all name the same shot, and date, time and values agree. Unconfirmed
   pairs are suggestions. In `~/DAMNIT-web-hzdr/api/.env`:
   ```bash
   DW_API_HZDR_BUILDER__ALIGNER_INDEX_DIR=/home/tippey/shot-aligner/shot_aligner/index
   ```
   Restart `damnit-api` and rebuild (`hzdr-rebuild.py`, as in item 8). After
   that, a new index or a decision in that folder triggers a rebuild by itself.
   A day counts only once its **index** is written: in the app, the date's
   **Write index JSON** task (opening a date does not write it); from a shell,
   in `~/shot-aligner`, or with `hzdr-campaign-backfill.py --apply`:
   ```bash
   uv run --no-sync --no-default-groups shot_aligner/scripts/align.py \
       --site fwkt-webapps index <date> --if-changed
   ```
   The `labfrog` step names the dates that have decisions but no index.
   **Measure** a day first: the bridge's `attached_wrong` should be 0.
   ```bash
   cd ~/DAMNIT-web-hzdr/api
   uv run --no-sync python scripts/hzdr-evaluate-time-rule.py \
       ~/shot-aligner/shot_aligner/index/<date>.index.json --rule aligner --tolerance 120
   ```
   **Bulk confirm changed too (B1):** "Confirm clear time cases" now offers
   triggers only, and only when no other shot is within 2 min. On
   shot-aligner's days the old rule would have offered 328 and 583 wrong
   files.

10. **This year's campaigns from shot-aligner, Vanlife first (rulings
    R-2026-11-22d/e, [plan-campaign-backfill.md](../plans/plan-campaign-backfill.md)).**
    Set `DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS` to campaign -> dates,
    build and review those days' indexes in shot-aligner, then rebuild. The
    steps are in [deploy-notes.md](deploy-notes.md) step 7: one console
    script, `api/scripts/hzdr-campaign-backfill.py` (a report, then
    `--apply`). On the two
    committed days it gives 258 shots from the Shotsheets, with 12-03's 2,544
    files attached and 12-01's 1,698 waiting as suggestions until 12-01 is
    reviewed.
11. **Quiet builds and packaging (rulings R-2026-11-22h/i).** Keep
    `DW_API_HZDR_BUILDER__CONTAINERS_ENABLED` off: the console script runs
    the container worker when asked. A campaign whose result has not changed
    is not rewritten on bigdata (`unchanged, not rewritten` in the log;
    `hzdr-rebuild.py --force` for all). Package a built campaign with
    `api/scripts/hzdr-package-campaign.py --master <c>.nxs --validate-python
    <nds python> --checksums`, or `hzdr-campaign-backfill.py --apply --package`
    ([deploy-notes.md](deploy-notes.md) step 7.5;
    [plan-quiet-builds.md](../plans/plan-quiet-builds.md),
    [plan-campaign-package.md](../plans/plan-campaign-package.md)).

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
# it ends with the count N; then the same with --apply --expect N
```

It reads SciCat's address and login from the plugin's env file (root-only,
hence `sudo`) and prints nothing secret. It deletes only **provable
replicates**: older registrations DAMNIT made of the very file the catalog's
dataset (`scicat_pid`) names. Every check must pass:

- same name, and the same `experiment_id` in the dataset's metadata;
- created by the same account as the catalog's dataset, never edited by
  anyone else;
- same source folder (the same file);
- created before the catalog's dataset, at least 24 hours ago
  (`--min-age-hours`), and not published.

A field it cannot read counts as not proven, so that dataset stays. A dataset
**newer** than the catalog's stays: it may be a registration that has not
reached DAMNIT yet. If SciCat lacks the catalog's dataset, or that dataset
lacks DAMNIT's marks, nothing of that campaign is deleted. Datasets with any
other name are never even read.

To delete, pass the count the look-only run printed: `--apply --expect N`.
If the count has changed since, nothing is deleted. Each dataset is fetched
again just before it is deleted and kept if it no longer passes every check.
If the account may not delete (HTTP 401/403), it stops and the `--report`
file lists the planned replicates for a SciCat admin.

Still open, needs a decision: **LabFrog's full hub** (`plan.md` item 24): four
decisions before phase 0.

## 4. Waiting on people

- HP's campaign name and instrument list.
- PC, folder and a sample file for TPS45, FF_after_DD and back-refl.
- The Share Dog adopt dialog, tried on a Windows lab PC.

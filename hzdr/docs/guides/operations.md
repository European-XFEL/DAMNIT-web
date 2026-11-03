# Operations guide (fwkt-webapps)

Day-to-day fixes for the deployed API, builder and frontend. Settings live in
`~/DAMNIT-web-hzdr/api/.env`; the service is `damnit-api`.

## Deploy a change

```bash
cd ~/DAMNIT-web-hzdr && git checkout main && git pull --ff-only
cd api && uv sync --locked && sudo systemctl restart damnit-api
cd ../frontend && pnpm install --frozen-lockfile && pnpm --filter ./apps/app build
```

The system nginx (`/usr/sbin/nginx`, ports 80/443) serves the frontend from
its own folder, not from `frontend/apps/app/dist`, so a build is live only after
it is copied there. Find the folder with
`grep -rnE "root|alias" /etc/nginx/sites-enabled/`, then copy the build in and
hard-refresh the browser (Ctrl+Shift+R):

```bash
sudo rsync -a --delete ~/DAMNIT-web-hzdr/frontend/apps/app/dist/ <nginx app folder>/
```

If the app is served under a sub-path (e.g. `/app/`), build with
`VITE_BASE_URL=/app/`.

## Rebuild a campaign by hand

The auto-trigger rebuilds when an export in `CURATED_ROOT` changes (mtime or
size) or events arrive; it does **not** rebuild on restart or after a code
change. To rebuild now, with the same inputs the trigger uses:

```bash
cd ~/DAMNIT-web-hzdr/api && uv run python scripts/hzdr-hdf5-builder.py \
  --output-root /home/tippey/mnt/bigdata/HPLexp/nexus_2026-11 \
  --curated-root /home/tippey/labfrog-sqlite-tools-repo/curated_files \
  --campaign Beamline_radbio_2026 \
  --campaign-timezone Europe/Berlin \
  --trigger-spool /data/damnit/hzdr/spool/kafka trigger.jsonl
```

- Name every campaign with `--campaign` (repeatable). Without it the builder
  builds only configured/spooled campaigns and the `_unassigned` bucket.
- `--campaign-timezone Europe/Berlin` (or `DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE`)
  matters: LabFrog times are local, and the day decides each shot's identity.
- Expected warnings: "multiple rows active" (fix in LabFrog) and "metadata
  block differs" (per-shot values are still all stored).
- The API reads the catalog on request; reload the page.

Check a build reached the catalog:

```bash
python3 -c "import json; c=json.load(open('/home/tippey/mnt/bigdata/HPLexp/nexus_2026-11/hzdr_sources.json')); s=[x for x in c['sources'] if x['key']=='Beamline_radbio_2026'][0]['shots'][0]; print(s['shot_key'], s['metadata'].get('laser'), len(s['metadata'].get('labfrog_variables', {})))"
```

## A build that never finishes

Symptom: builds fail with `Lock guard ... stayed busy for 10.0 s`, or nothing
rebuilds at all.

```bash
pgrep -af "hzdr-hdf5-builder|hzdr-container-worker"
ps -o pid,lstart,etime,stat,wchan:32 -p <pids>
```

A process in state `D` for hours (e.g. `folio_wait_bit_common`) is stuck in a
CIFS write the server never answered. It holds its campaign's lock and ignores
`kill -9`; only the share answering, an unmount the kernel accepts, or a
reboot frees it. `sudo dmesg -T | grep -iE "cifs|smb"` shows the share errors.

Without a reboot:

1. `sudo systemctl stop damnit-api`
2. Point `DW_API_HZDR_BUILDER__OUTPUT_ROOT` and `DW_API_METADATA__SOURCES_FILE`
   at a new folder on the share and `mkdir` it. The stuck processes only hold
   locks in the old folder, and nothing reads it any more.
3. Build each campaign into the new folder (command above), then
   `sudo systemctl start damnit-api`.
4. After the next reboot, delete the old folder.

Do **not** delete a held `.lock`/`.lock.guard` to get past it: if the share
ever answers, the old build would publish over the new catalog.

With a reboot: the share is in `/etc/fstab` with `x-systemd.automount` and a
credentials file, so it comes back by itself. After `umount -l` without a
reboot, bring it back with
`sudo systemctl restart home-tippey-mnt-bigdata.automount` (or
`sudo mount /home/tippey/mnt/bigdata`).

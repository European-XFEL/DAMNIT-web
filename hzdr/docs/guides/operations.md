# Operations guide (fwkt-webapps)

Day-to-day fixes for the deployed API, builder and frontend. Settings live in
`~/DAMNIT-web-hzdr/api/.env`; the service is `damnit-api`.

## Deploy a change

```bash
cd ~/DAMNIT-web-hzdr && git checkout main && git pull --ff-only
cd api && uv sync --locked && sudo systemctl restart damnit-api
cd ../frontend && pnpm install --frozen-lockfile && pnpm --filter ./apps/app build
```

The system nginx (`fwkt-damnit.fz-rossendorf.de`, ports 80/443) serves the
frontend from `/var/www/damnit-web` at the site root and proxies the API paths
to `127.0.0.1:8000`. A build is live only after it is copied there:

```bash
sudo cp -a /var/www/damnit-web /var/www/damnit-web.bak-$(date +%F)
sudo rsync -a --delete ~/DAMNIT-web-hzdr/frontend/apps/app/dist/ /var/www/damnit-web/
```

Then hard-refresh the browser (Ctrl+Shift+R). The app is at `/`, so build
without `VITE_BASE_URL`. Deep links such as `/source/<key>` need
`location / { try_files $uri /index.html; }` in the server block.

## Shot version display

The shot table defaults to the highest numbered version for each campaign,
shot day and shot number, excluding records explicitly marked archived or
superseded. This also applies when the export marks several revisions active.
Use **Show older and archived versions** above the table to inspect history;
the setting is saved per source and applies to the trends too. Tied highest
versions or records with unknown versions remain visible with a conflict warning.
The display policy does not modify LabFrog's recorded status or delete records.

Deploy the API and frontend using the commands above. Existing catalogs work
without a rebuild, using their shot dates. After a campaign rebuild the exported
`shot_day` is preserved for grouping and day labels when available.

## Context columns

Use Context builder to choose a field from **LabFrog fields**, **Shot metadata**
or an HDF5 dataset group. Field counts show availability across the campaign;
the example value is for the selected shot. If that shot lacks the field,
**Use a shot with this field** selects one containing it. Choose the display,
set the column title, and add it to the context file. **Preview example data**
checks the inputs; saved calculations run when the shot table loads context.

After deploying context fixes, use **Refresh context** on the shot page to
re-evaluate saved columns. Older generated nested `doc.get(...)` columns work
without editing the saved file. Scalar values appear as numbers or text in
each row; campaign trends appear when selecting a numeric cell. Actual per-shot
lineout and image previews remain in their cells.

## A new beamtime from LabFrog's Beamtime Setup

Since 2026-11-11 a campaign is prepared in LabFrog under Form Builder >
Beamtime Setup. Its **Outputs** section gives the line for DAMNIT,
`DW_API_HZDR_BUILDER__CAMPAIGNS: add <experiment_id>`. DAMNIT does not read
LabFrog's setup itself; carry the line over by hand:

1. Make sure the campaign is exported: its `experiment_id` is in
   `campaigns.txt` in `~/labfrog-sqlite-tools-repo` (the list the
   `labfrog-export-refresh` timer exports every 15 minutes), and
   `curated_files/<experiment_id>/<experiment_id>.sqlite` appears after the
   next run.
2. Add the id to `DW_API_HZDR_BUILDER__CAMPAIGNS` in `api/.env` (a JSON list,
   e.g. `["Helical_coils_2026"]`). Only listed (and spooled) campaigns' exports
   may claim `unassigned` triggers, and LabFrog numbers restart every campaign,
   so list a campaign only while it takes shots: take the previous beamtime
   out when it ends.
3. `sudo systemctl restart damnit-api`. The new campaign is built at the next
   export change or event; to build it now, use the hand rebuild below with
   its `--campaign`.

Beamtime Setup's **Check connections** reports DAMNIT as answering when
LabFrog's `DAMNIT_API_URL` is set and DAMNIT's `GET /config/health` responds;
it is skipped when the setting is empty.

## Rebuild a campaign by hand

The auto-trigger rebuilds when an export in `CURATED_ROOT` changes (mtime or
size) or events arrive. Since 2026-11-11 the export timer leaves an unchanged
campaign's files alone (labfrog-sqlite-tools `export-mongo --skip-unchanged`;
`FORCE=1 ./export_campaigns.sh` rewrites everything), so a quiet campaign is no
longer rebuilt every 15 minutes. A restart of `labfrog-explorer` still counts
as one change for its landing database (radbio): the Explorer writes its schema
and views there on start, so DAMNIT rebuilds that campaign once.

The trigger does **not** rebuild on restart or after a code change. So after
deploying a change to the file layout, rebuild every campaign by hand: bridge
profile v6 (2026-11-09, deployed 2026-11-11, `/entry/shots/authority_shot_number`)
appears in a campaign only once it is rebuilt, and resolution through a
LabFrog set's claimed shots needs an export made with labfrog-sqlite-tools
0.2.5 (schema 14). To rebuild now, with the same inputs the trigger uses:

```bash
cd ~/DAMNIT-web-hzdr/api && uv run python scripts/hzdr-hdf5-builder.py \
  --output-root /home/tippey/mnt/bigdata/HPLexp/nexus \
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
python3 -c "import json; c=json.load(open('/home/tippey/mnt/bigdata/HPLexp/nexus/hzdr_sources.json')); s=[x for x in c['sources'] if x['key']=='Beamline_radbio_2026'][0]['shots'][0]; print(s['shot_key'], s['metadata'].get('laser'), len(s['metadata'].get('labfrog_variables', {})))"
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
   at a temporary folder on the share (e.g. `HPLexp/nexus_2026-11`) and `mkdir`
   it. The stuck processes only hold locks in the usual folder, and DAMNIT no
   longer reads it.
3. Build each campaign into the temporary folder (command above, with its
   `--output-root`), then `sudo systemctl start damnit-api`.
4. After the next reboot (the hung processes are gone), set both settings back
   to `HPLexp/nexus`, rebuild each campaign there, restart `damnit-api`, and
   remove the temporary folder.

**Never delete `HPLexp/nexus`**: shot-aligner writes its output there too.

Do **not** delete a held `.lock`/`.lock.guard` to get past it: if the share
ever answers, the old build would publish over the new catalog.

With a reboot: the share is in `/etc/fstab` with `x-systemd.automount` and a
credentials file, so it comes back by itself. After `umount -l` without a
reboot, bring it back with
`sudo systemctl restart home-tippey-mnt-bigdata.automount` (or
`sudo mount /home/tippey/mnt/bigdata`).

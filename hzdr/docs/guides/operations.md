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
to `127.0.0.1:8000`. A build is live only after it is copied there.
`hzdr/scripts/next-on-server.sh --apply` does that on its own: it builds when
the checkout moved, and copies the build (with a dated backup) whenever it
differs from what nginx serves. By hand:

```bash
sudo cp -a /var/www/damnit-web /var/www/damnit-web.bak-$(date +%F)
sudo rsync -a --checksum --delete ~/DAMNIT-web-hzdr/frontend/apps/app/dist/ /var/www/damnit-web/
```

`--checksum` matters: a new `index.html` can have the old one's size and
time, and plain `rsync -a` then keeps the old page.

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

Context builder opens on **Help me choose**: ranked suggestions for the
campaign (`GET /contextfile/campaign/{campaign}/assist`), each with why it was
picked, a few example values and what the column will do. LabFrog values that
vary come first (the starter's picks marked **Top pick**), then registered
metadata keys whose values are numbers that vary, with their canonical unit
(and the trigger's ADC value; never the record namespaces `acquisition`,
`attribution`, `instrument`, `producer` and `run`, so no counter), then the
example shot's HDF5 images, lineouts and scalars. A column's function name
never takes a Python keyword or builtin, or a name the file uses (`np`,
`Skip`, ...): `class` becomes `class_column`. A LabFrog name with a dot in it
is read by name from `meta#labfrog_variables`, since `meta#` paths split on
dots. Each suggestion is a row with a checkbox; tick several and **Add N
columns** appends their `@Variable` blocks to the destination file in one
save (nothing is added when the save fails), or **Ignore ticked**. Selecting
a row shows its preview, reason and single **Add this column** / **Ignore
this suggestion** / **Customise** / **Show code** in the right column (under
the row on narrow screens). Ignoring hides a suggestion in this browser only
(localStorage, per campaign; **Show ignored suggestions again** brings them
back); **Customise** opens it in the builder. The file's existing columns are
a list with Edit, Move up/down and Delete (confirmed in the page). A link
`/source/<campaign>/context-builder?add=hdf5:<dataset>` (or
`?add=metadata:<path>`, optional `&shot=<shot_key or number>`) opens the
builder with that data chosen; Shot detail's **Add as column** uses it for a
dataset stored per shot (`by_shot/`, `shots/`, `shot/`), passing the shot. A suggestion drops off once the file reads its data
path (quoted); a column that only shares its function name reads other data,
so the suggestion stays and is renamed when added. A column reading the same
data through a helper is not recognised either, so that suggestion stays
until it is ignored.

In **Build a column myself**, choose a field from **LabFrog fields**, **Shot metadata**
or an HDF5 dataset group. Field counts show availability across the campaign;
the example value is for the selected shot. If that shot lacks the field,
**Use a shot with this field** selects one containing it. Choose the display,
set the column title, and add it to the context file.

**Preview** (in the builder, and for the selected suggestion)
follows the choices as they are made, with nothing to press. *In the table*
is the example shot's cell as the column will show it: the value with its
unit (a LabFrog decimal comma read as a number), *Missing* when the shot has
none, red when it is not a number; for a dataset, the scalar or the mean of
the lineout or image (marked ≈ when estimated from the reduced preview of a
large image). *On double-click* is the image or curve the cell panel opens.
*Across the campaign* is the value on every shot: a trend for numbers, the
labels and how many shots carry each for text. A custom function or a MongoDB
lookup is calculated only when the shot table loads, and the preview says so.
The dataset preview (`GET .../shots/{n}/datasets/{name}`) reads one strided
frame of an image and thins a lineout evenly over its whole length (at most
512 points), and returns `summary`/`summary_exact` for the cell.

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

1. Make sure the campaign is exported: its LabFrog campaign **name**, exactly
   as LabFrog shows it and with its spaces (`CoilsBordeaux 2026`, not the
   experiment ID `CoilsBordeaux_2026`), is a line of `campaigns.txt` in
   `~/labfrog-sqlite-tools-repo` (the list the `labfrog-export-refresh` timer
   exports every 15 minutes; `sudo systemctl start
   labfrog-export-refresh.service` runs it now). The exporter names the
   folder after the experiment ID: `curated_files/<experiment_id>/<experiment_id>.sqlite`
   appears after the next run, once the campaign has a record.
2. Add the id to `DW_API_HZDR_BUILDER__CAMPAIGNS` in `api/.env` (a JSON list,
   e.g. `["Helical_coils_2026"]`). Only listed (and spooled) campaigns' exports
   may claim `unassigned` triggers, and LabFrog numbers restart every campaign,
   so list a campaign only while it takes shots: take the previous beamtime
   out when it ends.
   One line does it, with a copy first:
   `cp .env .env.bak-$(date +%Y%m%d)` and
   `sed -i 's/^DW_API_HZDR_BUILDER__CAMPAIGNS=.*/DW_API_HZDR_BUILDER__CAMPAIGNS=["<experiment_id>"]/' .env`.
   `DW_API_HZDR_KAFKA_SPOOL__CAMPAIGN` is only the fallback for a message
   with no `experiment_id`; set it to the same campaign for consistency. A
   test campaign (`DataMgmtDemo` on fwkt-webapps) may stay listed beside the
   real one: its records claim no shot-authority numbers, so it cannot take
   the beamtime's triggers, but it is registered in SciCat like any other.
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
and v7 (2026-11-15, `/entry/labfrog_history`, superseded LabFrog versions out
of `/entry/shots`) appear in a campaign only once it is rebuilt, and resolution through a
LabFrog set's claimed shots needs an export made with labfrog-sqlite-tools
0.2.5 (schema 14). To rebuild now, with exactly the trigger's inputs (the
command is assembled from `api/.env` by the API's own code):

```bash
cd ~/DAMNIT-web-hzdr/api
uv run --no-sync python scripts/hzdr-rebuild.py --print        # show the command
uv run --no-sync python scripts/hzdr-rebuild.py                # rebuild, then check the layout
uv run --no-sync python scripts/hzdr-rebuild.py --check-only   # layout check only
uv run --no-sync python scripts/hzdr-rebuild.py --campaign Beamline_radbio_2026
```

- It builds what the trigger builds: the `CAMPAIGNS` list, every spooled
  campaign and the `_unassigned` bucket. `--campaign` (repeatable) adds one,
  `--all-exports` every campaign with an export; a named campaign's export may
  claim `unassigned` triggers during that build.
- After the build it checks each `<OUTPUT_ROOT>/<c>/<c>.nxs` for
  `/entry/shots/authority_shot_number` and `/entry/labfrog_history` and exits
  1 if one lacks either.
- `hzdr/scripts/next-on-server.sh` runs it as its `rebuild` step.
- `DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE=Europe/Berlin` must be set in
  `api/.env` (`--print` shows it as `--campaign-timezone`): LabFrog times are
  local, and the day decides each shot's identity.
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

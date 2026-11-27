# HZDR changelog

Notable changes to the HZDR fork of DAMNIT-web. Newest first. Upstream
(European-XFEL/DAMNIT-web) changes are summarised only where they reach HZDR
behaviour; the merge PR has the details.

## 2026-11-27

### NXhzdr_target v0.11: the DAPHNE4NFDI laser pump-probe schema

Campaign files follow the DAPHNE4NFDI laser pump-probe schema without breaking
anything v0.10 wrote:

- **Every campaign file** has the schema's field names beside the v0.10
  fields:
  - `instrument/laser/beam/spot_size` (both beam waists, with their
    definition);
  - `polarization_label`;
  - `temporal_contrast` (with the new key `laser.contrast_time`);
  - `sample/target_type`.
- **A campaign with a probe delay** (`metadata.probe.delay`) also has a
  second entry at the file's root, `/pump_probe`:
  - it declares `NXlaser_pump_probe_hzdr_draco`;
  - it is written only when the campaign has everything the schema requires,
    and the build log names what is missing otherwise;
  - shots without a number from the shot authority are listed in
    `events_unidentified`, never dropped (ruling R-2026-11-27a).
- **Twelve keys** were added to the registry for this (R-2026-11-27b):
  `laser.contrast_time`, `laser.amplification_state`, and the `probe.*` and
  `sync.*` keys. No producer sends them yet.
- **The definitions** are in `hzdr/nxdl/`: the schema's core
  `NXlaser_pump_probe`, the base class `NXsynchronization` and the HZDR site
  definition `NXlaser_pump_probe_hzdr_draco`.
- **The validation gate** checks `/pump_probe` against its own definition.
  pynxtools cannot check an enumeration on a per-shot string array, so the
  gate checks `events/status` itself.

The bridge profile stays `hzdr-canonical-shot-v8`.

**Deploying:** the code changed, so the next build publishes each campaign
once, quiet builds included. That build applies v0.11. No setting changes.

## 2026-11-24

Released as **hzdr-v0.3.2**: the HZDR fork's root package, frontend and damnit-api all
read 0.3.2. The API was already 0.3.2 (for `frontend_commit`); the root and frontend
follow it, so one number names the release.

### Slow context columns leave shot loading responsive

The shot table evaluates its active context in a worker, with one evaluation
at a time. Slow HDF5 reads can no longer hold up shot records and other API
requests on the event loop.

The shot table displays context column headers as soon as the context loads
and fills their values in batches. The Context Builder's inline previews
use smaller images and plots. The shot page shows the selected cell above
trends and shot detail. Shot detail places HDF5 datasets above the collapsed
linked source events and data products.

### Context Builder samples campaign shots and keeps previews in the list

Context Builder uses up to 32 shots for suggested columns, the example shot
picker and metadata previews. Links to a specific shot include that shot.
The suggestions request times out after 15 seconds. Selecting a row opens
its preview below it, and add buttons name the file they save to. The
confirmation explains how to use a column saved in a variant.
Add preserves existing columns and checks for unsaved edits and intervening
changes to the file. After adding to `context.py`, **Show added columns**
opens the shot table with those columns beside the shot number.

## 2026-11-23

### Bridge v8 writes offset-bearing campaign timestamps

The bridge interprets old naive LabFrog and Shotsheet times in the
configured campaign zone (Europe/Berlin by default). DAMNIT-owned shot
timestamp fields and generated LabFrog source event times now carry
offsets. The NeXus and SciCat bounds use the same instants, and the campaign
day governs dashboard grouping. Run `hzdr-rebuild.py --force` after updating
to v8 to rewrite existing output files.

### Context Builder: no bookkeeping suggestions, no nan
"Help me choose" no longer offers the build's bookkeeping datasets
(`event_id`, `event_index`, `shot_key`, `container`, ...); a generated HDF5
column (number, image, lineout) skips a shot with no finite value instead of
showing `nan`; the preview says "No number on this shot". Found on Vanlife,
whose BAM had only bookkeeping until the container worker ran.
Its eight dataset slots now go to images, then lineouts, then numbers, a
detector's `data/...` before its `acquisition_settings`/`file_metadata`, and
a container's `data/image` is titled by its detector: in name order a
Vanlife container (613 datasets) filled them with one camera's settings.

### Container comparison reads an offset-less start_time as campaign time
`hzdr-compare-containers.py` paired nothing on Vanlife 12-03 (150 DAMNIT,
151 shot-aligner containers unpaired): shot-aligner's older containers write
`/entry/start_time` as Berlin wall clock without an offset (15:21:38 for
DAMNIT's 14:21:38+00:00). A bare time is now read in the campaign zone
(`--timezone`, default `Europe/Berlin`), for pairing and for the per-pair
check (`hzdr_compare.instant`).

## 2026-11-22

### shot-aligner's decisions as DAMNIT's evidence
Rulings R-2026-11-22a/b (maintainer): a confirmation made in shot-aligner is
a person's decision. A Shotsheet row maps to a LabFrog record by the shot
authority first, then the record, then the Count, and is double-checked by
date, time and the details both record. Plan:
`hzdr/docs/plans/plan-aligner-bridge.md`.
- `metadata/hzdr_aligner.py` reads shot-aligner's `<date>.index.json` and
  `<date>.decisions.json` as written; each file is found by (date folder,
  instrument folder, file name).
- A confirmed file attaches as `aligner_confirmed` (match rank 6; the number
  ranks move up by one). It must pass these checks:
  - the authority number, the LabFrog record and the Count name the same
    shot;
  - LabFrog's time is within 120 s of `Zeit`;
  - `gvd`, `tod` and `elaser` agree.
- An unconfirmed pair is suggested (`shot_aligner`). A failure waits as
  `aligner_disagrees`, `aligner_check_failed` or `aligner_no_shot`, and
  `aligner_detail` shows on the page.
- `DW_API_HZDR_BUILDER__ALIGNER_INDEX_DIR` / `--aligner-index-dir`, off by
  default. The folder is a rebuild input. `next-on-server.sh`'s `labfrog`
  step reports it and the reviewed dates without an index.
- On shot-aligner's 2025-12-03 day all 2,544 shot files attach to the
  reviewed shot, with none wrong (`hzdr-evaluate-time-rule.py --rule aligner`).

### A campaign packaged on bigdata, ready to hand out
Ruling R-2026-11-22i. Plan: `hzdr/docs/plans/plan-campaign-package.md`.
- **`api/scripts/hzdr-package-campaign.py --master <c>.nxs`** writes
  `PACKAGE.json` (every file with its size, the counts, version, bridge
  profile, NDS's validation verdict) and `README.md` (silx for the master,
  h5web or myhdf5 for one container) beside the master. It copies nothing.
- `--checksums` adds sha256 and `SHA256SUMS`, and `--tar` writes one archive.
- A dangling container link is refused, and a failed NDS gate marks the
  package not valid.
- `hzdr-campaign-backfill.py --apply --package` packages each campaign
  after its steps.

### Quiet builds: an unchanged campaign is not rewritten on the share
Ruling R-2026-11-22h ("not too much reading across apps, servers and drives").
Plan: `hzdr/docs/plans/plan-quiet-builds.md`.
- Every build used to rewrite every campaign's master and catalog entry on
  bigdata. Now a campaign whose result equals the last published one prints
  `unchanged, not rewritten` and writes nothing: no NeXus file, no catalog
  entry, no SciCat.
- The stamp (`.<name>.nxs.build-stamp.json`) covers the shots, events, laser
  constants, never-shot kinds, the LabFrog NeXus source, the containers'
  manifest and the code that writes the files.
- `--force` and `hzdr-rebuild.py --force` publish anyway.
- `CONTAINERS_ENABLED` stays off. The console script runs the worker on
  request.

### One console script per campaign, and the parsed indexes stored
Rulings R-2026-11-22f/g. Plan:
`hzdr/docs/plans/plan-backfill-store-and-console.md`.
- **`api/scripts/hzdr-campaign-backfill.py`:**
  - it reports each listed date: index age, links confirmed, Shotsheet
    rows, the stored copy, and the shots and files attached or waiting in
    the catalog;
  - `--apply` runs shot-aligner's `align.py index` for missing dates, the
    rebuild, the container worker and its relink build, and with
    `--aligner-build` the phase 6 compare.
- **Stored days:** each parsed day goes in `.aligner-cache/<date>.aligner.json`
  beside the catalog (`ALIGNER_CACHE_DIR`, `--aligner-cache-dir`), keyed by
  the index's and decisions' size and mtime. A build reads only the dates
  its events fall on.
- **A confirmation counts as shot-aligner counts it:** the decisions file
  as it is now, while the event still has the Count it was confirmed against
  (`matched_count`). Before, a confirmation made after the index was
  written waited for the index to be rewritten. The report marks an index
  older than its decisions, and `--apply` rewrites it.
- **Day indexes are written** by shot-aligner's Write index JSON task or
  `align.py index`, not by opening a date (the docs said so wrongly).
- **Faster matching:** `parse_datetime` keeps a parsed time string, and the
  bridge checks each shot-aligner event once. A Vanlife build went from
  4.1 s to 3.5-3.8 s with the same output.

### This year's campaigns from shot-aligner's Shotsheets, Vanlife first
Rulings R-2026-11-22d/e (maintainer): this year's shot records are the
Shotsheet rows that shot-aligner finds and links to their dates; Vanlife
12.2025 is the test. Plan: `hzdr/docs/plans/plan-campaign-backfill.md`.
- `DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS` (campaign -> dates) /
  `--aligner-campaign <campaign>=<date>`.
- **Shots:** for a date LabFrog has no records of, the counted Shotsheet
  rows of shot-aligner's day index become shots:
  - `shot_number` is the position in the day;
  - the Count is in `labfrog_local_count`;
  - values are kept, and `experiment_id_source` is `shotsheet`.
- **Files:** the acquisitions become file events (`shot-aligner`,
  instrument from the catalogue), made at build time and never spooled. A
  watchdog event for the same file wins.
- **Multi-campaign:** a listed campaign is built without an export or
  spool.
- **Vanlife** from the two committed indexes builds 258 shots. On 12-03 all
  2,544 files attach. On 12-01 1,698 wait as suggestions until that day is
  reviewed. The container worker wrote 12-03's 150 containers and the master
  links them; their detectors fill on the server, where the raw files are.

### Bulk confirm no longer offers files, and tests every shot
Since ruling A7 a time proposal has one candidate, so the page's "every other
candidate 2 min further" test never ran. On shot-aligner's two days it would
have offered 328 and 583 wrong files.
- The review route now gives each event's nearest other shot over the whole
  source (`runner_up_gaps_s`).
- The page offers a clear time case only when that shot is 2 min or more
  further, and offers triggers only.
- `hzdr-evaluate-time-rule.py --rule bulk` measures it.

## 2026-11-21

### The one-to-one time rule measured on real shot days
- `api/scripts/hzdr-evaluate-time-rule.py` scores the rule against
  shot-aligner's day indexes: each acquisition as the watchdog event DAMNIT
  receives (raw instrument clock), each Shotsheet row as a shot, every pair
  checked against the reviewer's link.
- On 2025-12-01 and 2025-12-03 (Vanlife) the rule mispairs 21 to 56 % of
  what it pairs at 90 s or less, and pairs 0.4 to 16 % of files at 120 s or
  more. Instrument clocks run up to about two minutes off, `Zeit` is typed to
  the minute, and shots are a median 60 s apart on 12-03. **Leave
  `TIME_MATCH_ONE_TO_ONE` off**; `next-on-server.md` item 8 says so and how to
  measure a LabFrog day with triggers on the server. Results and the next
  options (clock-offset fitting as shot-aligner does; the rule for triggers
  only): `hzdr/docs/plans/plan-time-rule-real-data.md`.

### Review matches made more automatic, the way shot-aligner does it
Ruling R-2026-11-21 (maintainer: all options, "use how shot aligner does
it"); plan and checklist in `hzdr/docs/plans/plan-review-automation.md`.
- **One-to-one time rule** (`DW_API_HZDR_BUILDER__TIME_MATCH_ONE_TO_ONE`,
  off by default, `--time-match-one-to-one`): an event without a shot number
  attaches to a LabFrog shot when the two are each other's only neighbour
  within the tolerance among events of its source, kind and instrument,
  shot-aligner's `labfrog._match_by_time`. New match quality
  `time_one_to_one` (rank 3; the ranks above move up by one). Numbered events
  never pair by time; a watchdog attribution naming other shots wins.
- **Why it waits**: every review event carries `review_reason`, and the page
  shows one line of guidance for it.
- **Suggestions from evidence other than time**: `suggested_shot_key` when
  the watchdog's attribution names one candidate, or one candidate alone
  lacks that instrument's file. The page badges it and confirms suggestions
  in bulk, noting the evidence.
- **A campaign for an unassigned shot**: `campaign_suggestions` when the
  shots before and after it that day are in one campaign. The page pre-fills
  it, and **Assign the N suggested** assigns them.
- **Kinds that are never a shot** (`DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS`):
  their unmatched events are acknowledged by rule (`rule:never_shot_kinds`)
  in the catalog.
- `next-on-server.sh` reports whether the campaign schedule is set and
  current.
- Characterization tests pin what A7 did before: of two shots in the
  tolerance only the nearest was offered, and a tie left the event unmatched
  with no candidate. The reasons now name both cases.

### Faster deploys: the frontend is built only when it changed
- `next-on-server.sh` rebuilds the frontend only when `frontend/` changed
  since the last build (recorded in `dist/.damnit-frontend-commit`), and
  runs `vite build` without `tsc -b` (CI type-checks; `FRONTEND_TYPECHECK=1`
  restores it), with `pnpm install --prefer-offline`. A pull that changes
  only the API, docs or scripts builds nothing.
- `GET /config/version` adds `frontend_commit`, the last commit that changed
  `frontend/`; the build records the same as `VITE_DAMNIT_COMMIT`, and the
  header compares the two, so an API-only update no longer shows *Out of
  step with the API*. damnit-api 0.3.2.

### Review matches: time gaps in the campaign's zone, clear cases in bulk
- `GET .../sources/{key}/review` adds `candidate_gaps_s` (event_id ->
  candidate shot_key -> seconds from the shot to the event), read in
  `DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE` as the builder reads LabFrog's
  naive local times. The browser could not, so on real LabFrog data the
  "closest in time" highlight and the gap column were mostly empty; they now
  use the API's figures.
- Where one shot is clearly closest (within 30 s, every other candidate 2 min
  or more further, all gaps known), **Review the N** lists those events and
  **Confirm these N** confirms them together. A person still decides (ruling
  A7); each decision's note says it was confirmed in bulk, with the gap.
  Meant for the time until every trigger carries the shot authority's
  number, when events match by time only.

### Review matches: decisions in batches
- **Acknowledge all N** for unmatched events from one producer and kind (a
  test series, a source that never belongs to a shot), behind a second click
  that names the count.
- **Assign several**: every waiting unassigned shot, or one day's, to one
  campaign in one go.
- Both still record one decision per event or shot, with your name, through
  the existing routes; a failure is reported and the rest still go. Nothing
  about what the builder decides on its own has changed (ruling A7).

### Review matches refreshes itself
- The page reads the campaign summaries every 30 s while visible, so the
  picker's counts stay current, and reloads the open campaign's lists only
  when its waiting count, shot count or newest shot changed (never while a
  decision is being saved). The campaign it opened on stays, even when
  another becomes busier.

### Docs and screenshots
- The in-app Docs page describes Views, Download CSV, New since your last
  visit, the self-refresh, Trends' Compare with and columns on a shot's
  container. The screenshots are recaptured; the shot-table capture now
  shows a saved view and a second trend value. The capture script now also
  writes the Docs page's four smaller images, so they follow every capture.

### Shot table: new shots appear without a reload
- The campaign page reads the campaign summary every 20 s while its tab is
  visible (the same light route Home polls) and fetches the shots and your
  context columns again only when the campaign's shot count, newest shot
  or review counts changed. The refresh is quiet: the table, its selection,
  filters and scroll stay as they are, and a failed refresh keeps what is
  shown. A new shot counts in **New since your last visit**, and a button
  beside the quick filters, **N new shots arrived: show the newest**,
  selects it (and goes away once used).

### Home: a light summary route instead of every shot
- `GET /metadata/hzdr/source-summaries?since=<ISO>` returns each campaign's
  counts (shots, latest shot time, shots since `since`, decisions waiting,
  shots needing review or revision) without its shots or events. Home polls
  it every 5 s with the browser's local midnight as `since`, instead of
  `GET /metadata/hzdr/sources`, which carries every shot of every campaign.
  A `fired_at` without an offset is read in the zone of `since`, as the
  browser read it before. Deploy the API with the frontend.
- The summary's `waiting` leaves out an `unassigned` shot with a pending
  experiment ruling, as Review matches does, and `unreadable_times` counts
  shots whose `fired_at` is set but is no ISO-8601 time (a grey badge on the
  Home row) instead of skipping them silently.

### Shot table: what is new since your last visit
- A quick-filter chip beside the status and day chips, **New since your
  last visit N**, shows only the shots fired after the newest one this
  browser showed when you last opened the campaign. The mark is kept for the
  whole visit (a reload does not clear it) and moves on for the next one.
  Nothing on a first visit; the table itself is unchanged.

### Trends: your columns, and a second value to compare
- Trends offers your numeric context columns beside the metadata values
  (marked "your column"; image and array columns are left out).
- **Compare with** adds a second value over the same shots, drawn dashed on
  its own axis at the right, with a legend; a shot without the second value
  is a gap in that line.

### Shot table: saved views as chips, and Download CSV
- Above the quick filters, **Views** lists your named table views (filter,
  sort, hidden and ordered columns) as chips: one click applies a view, the
  current one is marked, **Save view** names the current state, x deletes.
  They use the existing per-user `.../sources/{key}/views` store beside the
  catalog; where it is unavailable (Mongo) the row does not show.
- **Download CSV** (beside Add columns) saves the shots the table shows, in
  its order and with its visible columns, `shot_key` first. Images and
  arrays are left empty; text that would start a spreadsheet formula is
  prefixed with an apostrophe.

### Review matches: one summary request instead of a review per campaign
- Review matches opens on the busiest campaign from the summary route (its
  `waiting` counts as the page does, and it now carries `experiment_id` for
  the campaign suggestions); it no longer loads every campaign's shots and
  every campaign's review to count what waits.
- The shot page says "No data source is known for these shots yet." when
  shots exist but none names a source, instead of "No shots yet.".

### Shot detail: "Add as column" for a shot container's datasets
- A dataset inside the shot's container (`<YYYYMMDD>_<NNNNNN>/...`, read
  through the campaign file's root link) is offered as a column, as
  `{container}/...`. The generated column takes
  `container: "meta#shot_container"`, which the API fills with the shot's
  link name (from its `shot_key`), and reads each shot's own container.
- A column on any templated path (`{shot_id}` or `{container}`) now skips a
  shot that lacks the dataset instead of failing.

### e2e: HZDR pages at phone width, and Home's summary route
- `frontend/e2e/tests/app/hzdr/`: Home, Flow monitor, Review matches, Docs
  and the shot table must not scroll sideways at 390 px; Home must read
  `source-summaries` and never the full sources list. The HZDR routes are
  mocked in `frontend/e2e/support/hzdr.ts`; CI's e2e job runs them.

### Header: a warning when the frontend and the API are out of step
- `GET /config/version` returns the `damnit-api` version and the checkout's
  commit when the process started. A frontend built with
  `VITE_DAMNIT_COMMIT` (`next-on-server.sh` sets it) shows *Out of step with
  the API* in the header when the two commits differ, so a missed rebuild or
  restart after a pull is visible. Unknown on either side: no warning.

### Polling: paused in a hidden tab, slower while the API is down
- Home, Flow monitor (its campaign list and, in Live, health and activity)
  poll through one hook (`usePolling`): nothing while the tab is hidden, at
  once on return, and a failed poll doubles the wait up to 60 s. Flow
  monitor and the shot page's campaign switcher read the summary route too
  (it now carries `latest_shot_number`), not every shot of every campaign.

### API: the parsed catalog is reused while the file is unchanged
- `hzdr_sources.load_sources_file` keeps the one most recent parse of
  `hzdr_sources.json` and reuses it while the file's inode, size, mtime and
  ctime stay the same; a different file replaces it, so memory stays at one
  catalog. A file changed in the last 2 s is always read again. Mongo is not
  cached. Polled routes no longer parse and validate the whole catalog on
  every request.

### Shot table: links to a shot, and trend points that open their shot
- The selected shot is in the address (`?shot=<shot_key>`, or a shot
  number), so a copied URL opens the campaign on that shot; Shot detail has
  **Copy link** beside the shot key, for a logbook or a chat.
- A point on the Trends curve is a button: clicking it (or Enter) selects
  that shot in the table and scrolls to it; the selected shot is marked on
  the curve.

### Home: help to get oriented
- Home opens with what DAMNIT-web is for, the figures at a glance
  (campaigns, shots today, decisions waiting with a link to Review matches,
  the newest shot and its campaign) and **Continue with** the campaign last
  opened in this browser (localStorage). Beside the campaign list, *How it
  works* gives three steps (open a campaign, add your own columns, settle
  what DAMNIT will not guess), each linking its Docs section, and points to
  Flow monitor when shots are not arriving.

### Shot table: Trends at the top of the side panel
- The trend (pick a value, see it over the shots) is now the first panel
  beside the table, named **Trends**, above Selected cell and Shot detail;
  it was at the bottom as "Shot sets", below the long Shot detail. It plots
  the shots the table shows, so the quick filters and the text filter apply.

### UI cleanup across every page (from the UI review)
- **Header:** "Inspect sources" is now **Campaigns**. Below tablet width the
  tabs fold into a menu button, so every page is reachable on a phone;
  **Send feedback** shrinks to its icon there.
- **Home** opens on the campaign list, newest first, with a filter box.
  Each campaign shows its last shot, "+N today", how many decisions wait in
  Review matches (a link there) and how many shots need review or revision.
  The three cards that repeated the tabs are gone; the DAMNIT folder is
  small print.
- **Shot table:** the table and its context previews stay the page's main
  content. Around it: one line of status chips (SciCat, wiki, producers,
  Flow monitor) replaces the three cards; quick filters for *Needs review*,
  *Needs revision* and each day; **Add columns** (was Context builder) sits
  beside Columns; the trend picker names fields in words; the arrow keys
  move between shots.
- **Shot detail** opens by default, above Shot sets. It lists only the
  selected shot's datasets, as a folding tree with a search box; the rest
  of the campaign file is behind a toggle (it listed every shot's datasets,
  13,000 px for 16 shots). Facts come first, then a compact OK / Review /
  Revise control. Times, match quality and empty values read in words; the
  shot key has a copy button. Data products in the campaign file preview
  inline (a product recorded with the campaign file as its path counts),
  with **Add as column** where the dataset is stored per shot (`by_shot/`,
  `shots/`, `shot/`): a dataset named for one event or container would
  repeat that shot's value in every row, so it gets no such link.
- **Review matches** says "All clear" when nothing waits instead of four
  empty cards; the campaign picker shows what waits in each campaign and
  opens on the busiest one unless you chose; the count chips jump to their
  section; in an ambiguous case the candidate closest in time is
  highlighted (time alone still never decides).
- **Flow monitor** opens in Live where live traffic is configured and
  remembers your choice per browser; Demo shows a banner. The traffic log is
  a full-width table under the diagram; "Poll DAMNIT" is **Check now**; the
  right rail shows the current campaign instead of repeating Home's list.
  API: `GET /config/runtime` returns `flow_monitor.live_traffic` (true when
  a spool consumer is enabled).
- **Context Builder** (page title *Add columns*): tick several suggestions
  and **Add N columns** in one save; the selected suggestion's preview shows
  in the right column (under its row on narrow screens); the file's existing
  columns are a list with Edit, Move up/down and Delete (confirmed in the
  page); the example shot reads "Shot 7 · 1 Jul, 11:36". A link
  `?add=hdf5:<dataset>` or `?add=metadata:<path>` (optional `&shot=`) opens
  the builder with that data chosen.
- Context Builder previewed a per-shot dataset (`by_shot/<id>/...`) from the
  campaign file's last shot whatever the example shot was (shot 16's image
  labelled Shot 1); it now reads the example shot's own copy.
- **Docs:** a contents list beside the text on wide screens, sections
  linkable as `/docs#review-matches`, a screenshot per section, and names
  that match the buttons. The launcher commands moved out to
  `hzdr/docs/guides/operations.md`.

## 2026-11-20

### Context Builder: generated columns that cannot break a context file
- A LabFrog variable named like a Python keyword, builtin or one of the
  file's own names (`class`, `str`, `float`, `np`, `Skip`) produced a
  function that did not compile, or one that replaced `float`/`np` for every
  other column in the file. Such names now get a suffix (`class_column`),
  in suggestions and in a new workspace's starter `context.py`.
- A LabFrog name with a dot in it ("E. field") gave a column that was always
  Missing, since `meta#` paths split on dots; it is now read by name.
- Values "nan" and "inf" no longer count as numbers ("from nan to nan").
- A suggestion is hidden only when the file reads its data, not when some
  column merely shares its function name.
- Switching campaigns drops the earlier campaign's late suggestions, so Add
  cannot write them into the wrong file.
- Dataset previews: an image side of 65-127 pixels is strided instead of
  cut to its first 64 (the summary was a corner's); a lineout is read whole
  only up to 8 MiB; text, compound and HDF5 array values get no summary; the
  summary is `np.nanmean`'s, none when infinite; a lineout's missing values
  leave gaps instead of drawing as zero. Previews already read are reused.

### Context Builder: previews show the real column, and follow the form
- One preview for the builder and for each "Help me choose" suggestion (a
  **Preview** button on every card). *In the table* is the example shot's
  actual cell: the value with its unit, *Missing*, or red when not a number,
  and for a dataset the scalar or the mean, not `nanmean(<path>)` placeholder
  text. *On double-click* is the image (now drawn on a canvas) or the curve.
  *Across the campaign* is a trend for numbers or label counts for text.
- The builder previews as you choose: the **Preview example data** button
  and the JSON *Technical values* box are gone.
- LabFrog values typed with a decimal comma now count as numbers in the
  campaign trend (they were left out).
- API: a dataset preview returns `summary` (the scalar, or the mean) and
  `summary_exact`; a lineout is thinned evenly over its whole length (at
  most 512 points) instead of cut at its first 200 samples. Shot-table image
  thumbnails draw on a canvas too.

### Context Builder: "Help me choose" suggests columns to add or ignore
- Context Builder now opens on **Help me choose**: a ranked list of columns
  worth adding, each saying why it was picked (how many shots record it, the
  range or labels it holds, example values) and what the column will do
  (number, label, image or lineout preview). **Add this column** appends it
  to the context file and saves; **Ignore this suggestion** hides it in this
  browser (per campaign; it can be shown again); **Customise** opens it in
  the builder. The old form is **Build a column myself**; its preview and
  generated-code panels show only there. Six suggestions show first, the
  rest behind **Show more**; a suggestion leaves the list once the file
  reads its data.
- API: `GET /contextfile/campaign/{campaign}/assist` (`contextfile/assist.py`).
  LabFrog values are ranked as the starter is (its picks marked "Top pick");
  beyond them registered metadata keys whose values are varying numbers,
  with their canonical unit (degC shown as °C), and the trigger's ADC value
  are offered, never the record namespaces (acquisition, attribution,
  instrument, producer, run) or counters. Each suggestion's `@Variable` is self-contained, so it works
  in any existing file. The example shot's HDF5 images, lineouts and scalars
  are suggested by the browser.
- Screenshots: a seventh capture, `context-assist.png`; the capture can use
  an installed Chromium (`HZDR_CHROMIUM_EXECUTABLE`).

## 2026-11-16

### Context: make a saved variant the active one
- The shot table runs `context.py`; a variant saved with Save as had no way
  to become active. Context Builder now shows "Make <variant> active" for a
  selected variant: it writes the editor's text to `context.py` and keeps the
  replaced file as `context_previous.py`. `/docs` explains variants.

### next-on-server.sh publishes the frontend it builds
- The script built the frontend into `frontend/apps/app/dist` but never
  copied it to `/var/www/damnit-web`, which nginx serves, so the site kept
  the old icon, guide and pages after a deploy. `--apply` now copies the
  build there (dated backup first) whenever the two differ, comparing by
  content (`rsync --checksum`); without `--apply` it lists the step.
  `DAMNIT_WEB_ROOT` overrides the folder.

### Context: suggested starter columns from the campaign's LabFrog records
- A user's first context.py for a campaign has up to six columns: values the
  campaign's LabFrog records hold on enough shots and that vary, numbers with
  units first (`contextfile/suggested.py`). Diagnostic on/off settings,
  constant flags, bookkeeping and what the table already shows are left out.
  Titles are tidied (`proton_energy_tps45` -> "Proton energy TPS45"), every
  micro spelling (`u`, Greek mu, mis-decoded) reads as the micro sign, and a
  decimal comma is read as a number; a value that is not a number shows red.
- `GET /contextfile/campaign/{campaign}/suggested` returns that file without
  writing it; Context Builder's manual editor has "Load suggested columns"
  (review, then save) for existing workspaces. `/docs` explains both.

### Flow monitor Live keeps the diagram; HZDR legal notice and contact; user guide
- Live mode shows the diagram (without the emulation buttons) above the
  health cards and moves real traffic through it: a lane animates when its
  Kafka topic, ASAPO stream or DAMNIT's spool gained messages since the last
  5 s poll (`utils/flow-activity.ts`).
- Footer: Legal Notice opens a new local `/legal` page (HZDR as service
  provider, worded after LabFrog's imprint) instead of European XFEL's;
  Contact, Send feedback and the user menu write to the HZDR maintainer
  instead of `da@xfel.eu`.
- `/docs` is rewritten as a user guide for the deployed flow (shot authority,
  watchdogs, LabFrog export, matching, Review matches, the table, context
  columns, the campaign file and SciCat, troubleshooting); the emulator-era
  text (LaserData making shots through ASAPO, JSONL as the combine boundary)
  is gone, and the developer commands are in a collapsed last section.

### Shot table: drag columns into any order; no starter columns
- Drag a column header onto another to move it; the order is kept per
  campaign with the rest of the table view, and "Reset order" in Columns
  restores the default. New context variables join at the end. Before, the
  fixed columns had a fixed order and context columns could only be moved
  by reordering the variables in context.py.
- A new user's context.py defines no variable: the four starter columns
  (owner, campaign, a copy of Energy, and "Computed field", a made-up
  product that was Missing on every shot) only cluttered the table. The
  examples remain as comments. Existing workspaces keep their file.
- Shot detail: a long shot key or record id wraps inside its column instead
  of running into the next one.

### Kafka consumer starts again on kafka-python-ng 2.2.3
- The D-M01 fetch limits passed `receive_message_max_bytes`, which only
  kafka-python 3.0 knows; the locked 2.2.3 refused it ("Unrecognized
  configs") and `damnit-api` stopped at startup. Only the limits the
  installed client knows are passed now (`supported_fetch_limits`). The
  tests mocked the consumer; one now builds the real client's settings.

### SciCat: campaigns move to managed publishing one at a time
- `DW_API_HZDR_SCICAT__MIGRATE_LEGACY` (JSON list of experiment ids) lets a
  campaign registered through `from-json`/`push` move to the managed
  `publish` route, which sends the `hzdr-scicat-campaign-summary-v1` block.
  The listed campaign gets one new managed dataset; its legacy PID is kept as
  `scicat_legacy_pid` and sent as `legacy_pid_reference`, and the legacy
  dataset is never written. An unlisted campaign, and any other incompatible
  state (another publisher, identity or plugin target), still reports
  `migration_required` without a write. Tests:
  `api/tests/test_hzdr_scicat_publishing.py`.
- Brings DAMNIT's managed-campaign refinements of 2026-11-13 to `main`
  (`5bdedc17` and the six commits before it: record-count semantics,
  `record_identity_coverage` for active duplicate records, version flags,
  replay diagnostics).

## 2026-11-15

### Kafka consumer: a backlog over about 1 MB is read again (D-M01)
- kafka-python's defaults let one fetch reply exceed what the client
  accepts (`max_partition_fetch_bytes` 1 MiB per partition against
  `receive_message_max_bytes` 1,000,000 bytes), so a consumer behind by
  more than about 1 MB was refused every reply ("Invalid frame length") and
  never caught up. `consumer/kafka.py` now sets `FETCH_LIMITS` (1 MiB per
  partition, 4 MiB per fetch, 8 MiB accepted). Found by the constellation
  emulator's 200-shot mixed day (M1) in its own reader, which uses the same
  library with the same defaults. Tests:
  `api/tests/test_hzdr_kafka_fetch_limits.py`.
### Data rights and privacy notice
- New public page `/privacy` (`HZDRPrivacyPage`), linked as "Privacy" in the
  site footer. Worded after LabFrog's notice, with the same controller (HZDR)
  and data protection officer, and stating what this app stores about a
  person: the sign-in details in the session cookie, the user name on review
  decisions and saved table views, the browser's table layout, and request
  logs. Readable without signing in, as LabFrog's is.

### History rows in a preserved LabFrog NeXus shot table: accepted
- Documentation only. A shot table preserved from a LabFrog NeXus file
  (`--labfrog-nexus`) keeps its superseded versions, because other groups
  refer to its rows by position. Maintainer, 2026-11-15: fine for now, as
  long as they can be filtered. They can: `/entry/shots/has_newer_version`
  is true on those rows (`hzdr/docs/architecture.md`). Bridge profile v7
  passed the constellation emulator's E13 3 of 3 on the SQLite path.

### Superseded LabFrog versions leave the shot table: bridge profile v7
- A LabFrog record version that a later one replaced (an operator's
  correction; `archived`, or a non-active row beside an active one of the same
  campaign, day and number) was kept in `/entry/shots`, and its LabFrog row in
  `/entry/source_events`, with nothing in the file marking it as history: after
  a typed 44 was corrected to 4, a reader saw two shots with authority number 4.
  Such a version is now a row of **`/entry/labfrog_history`** (`NXcollection`:
  `history_index`, `record_id`, `shot_number` as typed,
  `authority_shot_number`, `superseded_by`) and of neither table. The group is
  written by every build, empty when nothing was superseded. Maintainer's
  decision of 2026-11-14 on the constellation emulator's E13: history
  reachable but not mixed in.
- `superseded_by` is the `record_id` of the version that replaced the row:
  from the export's `shot_version_links` table (LabFrog's `_id_OLD`), else the
  one active row of the same campaign, day and number, else empty.
- The profile string is `hzdr-canonical-shot-v7` (root, `/entry/shots`, and
  the catalog's `integration_profile`). Shot identity is as in v6: a
  LabFrog-backed shot keeps LabFrog's own, possibly typed, number as
  `shot_number` and in `shot_key`, the authority's beside it.
- The catalog, the API and the frontend are unchanged: the catalog never
  listed a superseded version. `/entry/sample` and the laser/vacuum snapshots
  no longer read a superseded version.
- A shot table preserved from a LabFrog NeXus file (`--labfrog-nexus`) keeps
  its history rows: the table is LabFrog's, other groups refer to its rows by
  position, and its own `has_newer_version` column marks them. Their events
  still leave `/entry/source_events`, and the history group is written.
- The openPMD preflight gives `/entry/labfrog_history` its own axis
  (`labfrog_history`): a rule on it is never read as shot-aligned by a
  coincidence of lengths and never joined to an iteration.
- `api/scripts/hzdr-rebuild.py` now also reports a campaign file without
  `/entry/labfrog_history` as `MISSING`. **Deploying:** the trigger does not
  rebuild after a code change, so rebuild every campaign by hand
  ([operations guide](docs/guides/operations.md)); nexus-design-studio's copy
  of the profile and the combo's ledgers follow separately.

## 2026-11-14

### A corrected LabFrog record replaces its typo (D-E13)
- The export keeps every version of a record; DAMNIT marked the older ones
  `has_newer_version` only within the same (campaign, day, LabFrog shot
  number), so a correction of the number itself (a typed 44 corrected to 4)
  left the archived typo current beside it: an extra shot 44 in the catalogue
  and the NeXus file. An `archived` row is now always a previous version.
  Found by the constellation emulator's E13.

### Containers of a drained `_unassigned` bucket are collected (D-E14)
- A shot built in the `_unassigned` bucket (no LabFrog record yet, so no
  campaign) and routed to its campaign by a later build left its container
  in `_unassigned/shots/`: the same raw file was then in two containers. The
  worker refused to collect on a master with no acquisition at all, which is
  exactly what a drained bucket is. The bucket's master now collects (to
  `.trash`, purged after 7 days as before); a campaign's master with no
  acquisition still collects nothing. Found by the constellation emulator's
  E14 (LabFrog export one cycle late).

### Spool consumer durability (review findings R01, R02, R08)
- **A refused spool write is retried, never committed past (R01).** The
  consumer keeps a claimed batch until every event in it is on disk and only
  then commits; a failed write retries the same batch after the poll interval
  instead of claiming the next one. Already-written events are skipped by
  dedup. A failed commit after a durable batch is logged and let go (the
  broker redelivers; dedup absorbs).
- **A torn last spool line is repaired before the next append (R02).** A
  tail that is valid JSON gets its missing newline; anything else is moved to
  `<spool>.torn-<n>` beside the spool and the spool is truncated to its last
  complete line, so a crash mid-append no longer glues the next event onto a
  fragment and stops every build. Malformed interior lines are left alone.
- **The spool keeps the broker's coordinates (R08).** Each Kafka record's
  observed `topic`, `partition` and `offset` are written into `payload_ref`;
  a producer-supplied position that disagrees is kept under
  `payload_ref.producer_position` and logged.

### Rewritten files (emulator E4)
- An event that a later one replaces (`payload_ref.replaces`, the file
  watchdog's marked re-delivery of a file the instrument rewrote) stays in the
  shot's events as history but gets no data product, and the per-shot
  container records the replacement's sha256, not the stale first one.

## 2026-11-13

### SciCat campaign publishing
- Campaign summaries distinguish current-record counts from distinct shot keys
  and explicitly flag duplicate active-key groups for source-owner review.
  Status remains authoritative; no record is discarded by version-number guesses.
- Canonical bridge builds now persist each row's `has_newer_version` flag.
  Fresh SQLite-based masters retain version history while allowing inspection
  to distinguish current catalogue records from superseded LabFrog versions.
- Campaign inspection compares the catalogue with explicitly current master
  rows, reports retained version-history counts and verifies LabFrog record IDs
  when present. Historical master rows no longer alone imply a mismatch.
- Add a standalone read-only campaign inspection command that saves bounded
  metadata, explicit linked-file inventory, existing PID/migration state and
  catalogue/master shot-key agreement before any real campaign publishing.
- Verification receipts retain the HTTP status and recognized action of the
  latest direct replay response, including failed unchanged checks, without
  copying arbitrary response bodies.
- Standalone verification imports no longer initialize API server routers or
  require production authentication settings. Server router exports remain
  available on demand. Fresh test checkouts must sync the `damnit-api` workspace
  package to install the runner's runtime dependencies.
- Opt-in `ENDPOINT=publish` uses the plugin's journal-managed PID lifecycle,
  authenticates with a plugin service key, preserves partial registration PIDs
  and logs actual created/updated/unchanged/partial outcomes. Legacy defaults
  remain unchanged; existing legacy PIDs require reviewed migration.
- Searchable campaign summaries now carry time coverage, distinct instruments,
  multiple targets with canonical units, authority-number coverage, separate
  LabFrog counts, match/review coverage as present in normalized events and source
  provenance. Summaries omit notes and bound distinct values.
- Register the master and only explicitly linked shot containers. Metadata-only
  and companion-content changes participate in skip detection. Campaign slugs
  and display names are not promoted to catalogue IDs in managed mode.
- Optional explicit overview PNG/JPEG references include preview contents in
  skip detection. Optional preview failures retain the core PID and remain
  retryable. Production/HZDR/pilot examples select managed DAMNIT publishing,
  with registration disabled until journal, service key and migration are ready;
  normal Watchdog/site/pilot configurations keep direct SciCat push off.

## 2026-11-12

### Review matches
- **An event that belongs to no shot is listed for review even when the
  campaign has no LabFrog rows** (emulator finding D-C01,
  [status note](docs/status/emulator-clock-findings-2026-11-12.md)). A
  watchdog file the PC could not attribute (`no_trigger`, `ambiguous`,
  `unregistered`, `rescan`) has no shot number. In a build without LabFrog
  rows, which is always the case for the `_unassigned` bucket, it was written
  to the master's `/entry/source_events` but got no match status, so the
  catalog's review list and counts left it out. It is now `unmatched`, or
  `ambiguous` with the shots its attribution candidates name as choices. No
  shot, number or campaign is invented. The emulator's C3, C5 and C11
  schedules pass against the fix on the real local chain; C2's remaining
  failure is the watchdog's wrong shot number.

### Flow Monitor emulator
- **The demo writes the envelopes the real producers send** (flow mesh plan
  M9; contradictions X13, X14, X19). The Shotcounter button now stages the
  shot authority's trigger: source `DRACO-Trigger`, kind
  `trigger.threshold_crossing`, `experiment_id: "unassigned"`, topic
  `draco.trigger` (was `Shotcounter` / `shot_counter_event` on
  `shotcounter.shots`, with DAMNIT naming the campaign), in
  `events/draco-trigger.jsonl` (was `shotcounter.jsonl`). The Watchdog button
  stages a DAQ File Watchdog file event attributed to the latest shot, also
  `unassigned`, with `instrument.*`, `attribution.*`, `acquisition.*` and
  `producer.instance_id`. Both are checked against `HZDREventV1` before they
  are written. A shot opened by a trigger is marked
  `experiment_id_source: "schedule"`: the emulator plays the authority and
  the campaign resolution. `POST /metadata/hzdr/emulator/events` still
  accepts `source: "Shotcounter"` and answers with the same trigger. The
  LaserData button's event kind is `laser.pulse`, no longer the superseded
  key `pulse_energy_j`. The diagram itself is unchanged (boxes: M3 to M7).
- **Producer status reads the real envelopes** (M11, X15). A shot authority
  trigger counts as the Shotcounter (channel from `payload_ref.channel_id` or
  `metadata.trigger.channel_id`), so Source Home no longer shows it `absent`
  on real data. A watchdog card is one PC, named by
  `metadata.producer.instance_id`, with the rule from
  `metadata.watch.watch_name`; before, every PC collapsed into one card named
  after the Kafka topic. Events without those keys are grouped as before.
- **`hzdr-local-acceptance.py --real-topology`** (flow mesh plan step 6)
  rehearses the deployed flow on generated data: unassigned triggers and a
  watchdog file event in a spool, a LabFrog export, a campaign schedule, the
  real multi-campaign builder, a ruling over HTTP, the rebuild. The
  `-WithAcceptance` / `--with-acceptance` test runs include it.

## 2026-11-11

### SciCat
- **A rebuild no longer registers a new SciCat dataset** (ledger `I7`). Each
  build stamps `damnit_bridge_updated_at`, so the file's SHA-256 never
  matched the last registration and every rebuild (about 100 a day for
  radbio) made a new dataset. `register_campaign_nexus` now also compares a
  content fingerprint (`scicat_content_fingerprint` in the catalog): SHA-256
  over every group, dataset, attribute and link, leaving out
  `damnit_bridge_updated_at` and the HDF5 layout. Two builds of the same
  inputs were checked to give the same fingerprint. The first build after
  the deploy registers once more, since the catalog has no fingerprint yet.
- **Every registration is logged.** The builder prints one `SciCat:` line per
  campaign (registered new / unchanged, kept / not registered), and the
  auto-trigger copies those lines into the API's log.
- **`api/scripts/hzdr-scicat-duplicates.py`** removes the duplicates already
  in SciCat, and only provable replicates. Every check must pass: the same
  name and `experiment_id`, the same creating account and no other editor,
  the same source folder, created before the catalog's dataset and at least a
  day ago, and not published. An unreadable field means keep. A campaign
  whose catalog dataset SciCat lacks, or lacks DAMNIT's marks, loses nothing.
  It only looks unless `--apply --expect N` names the count it just printed.
  It re-checks each dataset on a fresh copy right before deleting it, logs in
  with the plugin's env file, and writes `--report` for a SciCat admin.

### Operations
- **`hzdr/scripts/next-on-server.sh`**: the open server work on fwkt-webapps
  in one script, look-only unless `--apply`: pull, restart every unit still
  running code older than its checkout (after `uv sync`), the two expected
  untracked-file warnings, the 2024-08-08 rulings copy, a campaign rebuild
  with the v6 check, Beamtime Setup's settings, and the reports. What needs a
  person is in `hzdr/docs/guides/next-on-server.md`.
- **`api/scripts/hzdr-rebuild.py`** rebuilds by hand with exactly the
  auto-trigger's command, assembled by the API's own code
  (`consumer/bootstrap.builder_command`, which reads the spool layout without
  building a consumer, so the running API keeps its Kafka partitions), then
  checks each campaign file for `/entry/shots/authority_shot_number`.

## 2026-11-09

### Data
- **The shot authority's number is in the NeXus file** (bridge profile v6).
  `/entry/shots/authority_shot_number` holds it beside each shot: the LabFrog
  export's `authority_shot_number` for a LabFrog-backed shot (whose
  `shot_number` is LabFrog's own and may be typed), the events' number for a
  trigger-only or event-built shot, `-1` otherwise. A LabFrog NeXus source's
  `-1` (labfrog-sqlite-tools 0.2.5) is read as no number. Rebuild a campaign
  to get the column.
- **Campaign resolution reads every shot a LabFrog record claimed.** From
  labfrog-sqlite-tools schema 14 (0.2.5) the export has an `authority_shots`
  table, one row per claimed shot, because a set that claimed several shots
  leaves `shots.authority_shot_number` empty. `read_labfrog_sqlite_shots` now
  attaches those numbers as `authority_shot_numbers`, and resolution step 1
  routes an `unassigned` event whose number one of them names to that
  record's campaign (still only when exactly one campaign claims it). They
  are not used to match an event to the set's row: the trigger becomes a
  shot of its own in that campaign. A schema-13 export reads as before.

### Shot containers
- **Nomarski-style frames are one shot's frame each** (shot-aligner ruling X5,
  2026-11-01). The vendored `sequence_frames` pack manifest is re-synced to
  shot-aligner `ac4690b`, which adds the `prefixed_set_camera_and_ordinal`
  name pattern: a description, a set, one or more camera tags and an ordinal
  (`Nomarski_water_jet_515nm_set1_C1_C1_00001.tif`) is now its own
  acquisition with label `set1` and ordinal 1, as `set10_00001.tif` already
  was. Before, every such frame fell to `conditions_and_frame` and the whole
  folder became one recording. A condition label without a camera tag
  (`20cm_6kv_00001.tif`) is still a recording. The vendored files are part of
  the conversion-code digest, so the next container-worker pass rewrites every
  container.

## 2026-11-03

### Data
- **LabFrog SQLite values reach the catalog and NeXus file** (#25). The builder
  now reads `shots.laser_energy` as `metadata.laser.pulse_energy` (J), keeps
  `gvd`, `tod`, `tw_delay`, `comments` and `mode`, and attaches every
  `shot_variables` row as `metadata.labfrog_variables` (`{name: {value, unit,
  kind}}`): capacitor voltages, ICT charge, TPS45 proton energy, diagnostic
  settings. Event metadata now merges into LabFrog's per namespace instead of
  replacing it, so a producer's laser key no longer drops LabFrog's energy.
  Existing catalogs need a rebuild to pick this up.
- **Context files read nested registry keys** (#27). An argument missing as a
  flat key follows `LEGACY_KEY_MAP` (`laser_energy_j` -> `laser.pulse_energy`,
  `chamber_pressure_mbar` -> `vacuum.chamber_pressure`) or a `meta#a.b`
  annotation. The starter template's "HZDR/Laser energy J" and "Computed field"
  columns work again without editing workspace copies.

### Shot table
- **Nested context fields show the correct record's value.** Existing generated
  `doc.get("a.b")` columns resolve nested fields, and shot-number lookups are
  scoped to the evaluated record so days and revisions cannot borrow another
  row's value. New columns use direct metadata annotations; context results
  carry record IDs for unambiguous matching. Scalar cells show their values,
  with campaign trends kept in the selected-cell panel.
- **Context data selection starts with readable fields and example values.**
  Fields are grouped by source, available across all shots with coverage counts,
  and can locate an example shot containing a missing field. Data and display
  choices precede the title; Python naming is under advanced settings. Custom
  calculations request only their selected inputs, and example-data previews
  are distinguished from executing saved calculations.
- **Show current versions by default.** The table and its trends hide archived
  records and lower numbered versions of the same campaign/day/shot, even when
  the export marks several revisions active. "Show older and archived versions"
  restores the history and is saved per source. Equal highest or unknown
  versions stay visible with a conflict warning. Version numbers and history
  labels distinguish these records without rewriting LabFrog's stored status.
  The builder now preserves exported `shot_day` metadata for grouping and labels;
  existing catalogs fall back to their shot date until rebuilt.
- **Sorting and column hiding keep duplicate LabFrog records distinct.** Rows
  now include the LabFrog record ID in their UI identity, so records sharing a
  shot key (including revisions with the same timestamp) no longer leave stale
  rows or cells when sorting or changing visible columns. All records remain
  visible; canonical shot keys still identify API requests and context results.
- **Shots that share a number are kept apart** (#25). LabFrog restarts shot
  numbers each day; Day labels, row selection and highlighting, Context Builder
  rows, trend points and the status/metadata edits now use the shot's
  `shot_key` (date + number). Edits send `?shot_key=` so they can no longer
  change another day's shot. Labels read `<number> · <date>`.
- **The source header shows where the data came from** (#26) - one badge per
  source (LabFrog, each event producer) with its shot count - instead of a
  fixed "Emulated package stream" badge.

### Builder
- **A busy lock on a network share is waited out, not fatal** (#28). On a
  CIFS/SMB mount, `flock` reports a lock held by another process as EACCES; the
  builder now retries it like any held guard (up to `GUARD_TIMEOUT_S`, then
  `BuilderAlreadyRunningError`).

### Upstream merge (#29, if merged)
- 694 upstream commits (2026-07-07 to 2026-11-03): SQLite read lock, 401/4401
  for missing logins, live-update resilience, `runs/` package split, proposal
  membership permission, zensical docs, character check, pnpm 10.34 with a
  7-day `minimumReleaseAge`, restructured frontend and e2e suite. Fork behaviour
  kept; see `hzdr/docs/status/upstream-merge-2026-11.md` on that branch.

### Operations (fwkt-webapps)
- Two auto-trigger builds hung on 2026-10-28 in uninterruptible CIFS writes to
  `//gssnfs/bigdata` and held the radbio lock for six days, so no build ran
  after it. The output root moved to `/home/tippey/mnt/bigdata/HPLexp/nexus_2026-11`
  (`DW_API_HZDR_BUILDER__OUTPUT_ROOT`, `DW_API_METADATA__SOURCES_FILE`) until
  the next reboot clears the hung processes; then both settings go back to
  `HPLexp/nexus`. That folder is shared with shot-aligner's output and is never
  deleted. The share's write errors (`cifs_flush` hangs, "No writable handle
  ... rc=-13") are reported to IT. Runbook: `hzdr/docs/guides/operations.md`.

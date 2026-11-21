# HZDR changelog

Notable changes to the HZDR fork of DAMNIT-web. Newest first. Upstream
(European-XFEL/DAMNIT-web) changes are summarised only where they reach HZDR
behaviour; the merge PR has the details.

## 2026-11-21

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

# HZDR changelog

Notable changes to the HZDR fork of DAMNIT-web. Newest first. Upstream
(European-XFEL/DAMNIT-web) changes are summarised only where they reach HZDR
behaviour; the merge PR has the details.

## 2026-11-13

### SciCat campaign publishing
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

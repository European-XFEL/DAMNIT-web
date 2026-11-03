# HZDR changelog

Notable changes to the HZDR fork of DAMNIT-web. Newest first. Upstream
(European-XFEL/DAMNIT-web) changes are summarised only where they reach HZDR
behaviour; the merge PR has the details.

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

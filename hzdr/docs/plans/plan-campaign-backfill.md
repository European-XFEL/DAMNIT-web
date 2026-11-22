# Plan: this year's campaigns into DAMNIT from shot-aligner's Shotsheets and indexes

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Follows
[plan-aligner-bridge.md](plan-aligner-bridge.md). The bridge attaches files
that a reviewer confirmed in shot-aligner, but only to shots DAMNIT already
has and only for files DAMNIT has events for. Neither is true for this
year's campaigns: there is no watchdog event and no LabFrog record. Same
format as before: rulings first, a box ticked in the commit that does the
work.

## Rulings (maintainer, 2026-11-22)

- **R-2026-11-22d: where this year's shot records come from.** "The
  records are in Shotsheets that shot-aligner finds and tries to link to the
  relevant dates and campaigns. The shot index had to be built or pulled from
  the shotlists." So a day's shots are the Shotsheet rows in shot-aligner's
  day index (`shotsheet.rows`), as shot-aligner read them from the workbook
  that its pairing chose for the date. DAMNIT reads no workbook itself, so
  the Excel reader stays shot-aligner's alone.
- **R-2026-11-22e: Vanlife first.** The December 2025 Vanlife beamtime
  (`FWKT:VANLIFE_12.2025`) is the test campaign. Its dates are 2025-12-01,
  02, 03 and 05. Here, 12-01 and 12-03 are measured (their indexes are
  committed); the other two follow on the server once their indexes are
  built.

## Decisions (this plan)

- **F1: which rows are shots.** A row is a shot when shot-aligner's
  inclusion rule counts it (`counted: true`). A placeholder row (only a
  Count, at the end of a set, with nothing linked to it) is not.
- **F2: LabFrog first, the Shotsheet only where LabFrog has nothing.** For
  a listed campaign, a date whose LabFrog export has records keeps them.
  Shotsheet rows make the shots of a date with none, so no shot is ever
  built twice.
- **F3: a Shotsheet shot's identity.**
  - `shot_number` is its position in the day: 1 to N, sets in workbook
    order, then rows in order. Counts restart in every set, so a Count is no
    identity.
  - The Count goes in `labfrog_local_count`, which is already "the
    experimenters' Count, a user aid, never an identity".
  - `authority_shot_number` is `-1`: there is no authority number.
  - `experiment_id_source` is the new value `shotsheet`. It is a string
    column, so there is no layout change (D5 of the review plan).
  - The record id is `shotsheet:<date>:<excel_row>`, so the bridge's
    *record* evidence and its *Count* evidence both apply.
  - The row's values go into the shot's metadata: `gvd` and `tod` as
    themselves, `elaser` as `laser.pulse_energy` (J), everything else under
    `shotsheet.*`, plus the row's set, Count, line and comments. The time is
    the row's `Zeit` on its date, in the campaign's zone.
  - Until the shot authority covers these days, this numbering is DAMNIT's
    own and is documented as such.
- **F4: the files, from the same index, made at build time.** Each shot
  acquisition becomes one file event. It is synthesized in the build, not
  written to a spool, so removing the setting removes it.
  - **Event:**
    - `source` is `shot-aligner`, `kind` is `shot-aligner.file` and
      `transport` is `file`;
    - `event_id` is deterministic: `aligner-` plus a hash of
      (date, folder, file);
    - `shot_number` is null;
    - `timestamp` is the instrument's raw clock.
  - **`payload_ref`:** each file's absolute path under the index's
    `dataFolder`, in `members`.
  - **`metadata.instrument`:** from the vendored catalogue, through its
    `folder_aliases` (id, format, group, timing role, `record_source:
    catalogue`). This is what the container worker needs. An instrument not
    in the catalogue gets no id and no format, as an unregistered watchdog
    file does, and so no container.
  - **`metadata.acquisition`:** `time` and `time_source` from the index.
  - **No `attribution`:** the bridge attaches these by file, so the event
    model and its vendored copies are unchanged.
  - **Auxiliary files** (alignment, synchro) belong to no shot and get no
    event.
  - **A watchdog event later sent for the same file wins:** the synthesized
    one is dropped.
- **F5: then the bridge, unchanged.** A confirmed link attaches its files
  (`aligner_confirmed`). An unconfirmed one is suggested. Every check of
  plan-aligner-bridge B4 still runs.
- **F6: settings.** `DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS` is a JSON map
  from campaign to dates, for example
  `{"Vanlife_12.2025": ["2025_12_01", "2025_12_02", "2025_12_03", "2025_12_05"]}`.
  The default is empty, which means off. It needs `ALIGNER_INDEX_DIR`.
  - The builder flag is `--aligner-campaign-date <date>`, repeatable.
  - The trigger passes the dates of the campaign being built.
  - In multi-campaign mode a listed campaign is built even without an
    export or a spool.
  - The dates are listed by hand: shot-aligner's date to campaign pairing is
    a suggestion, and which dates belong to a campaign is a person's call.

## Checklist

- [x] Plan written first (this file), linked from `plan-aligner-bridge.md`
- [x] **F1/F3, the shot list:** `hzdr_aligner.shotsheet_shots(index,
      experiment_id, timezone)`; tests on the committed fixture (placeholder
      rows, numbering across two sets, values, time)
- [x] **F4, the files:**
  - `hzdr_aligner.acquisition_events(index, experiment_id)`;
  - a catalogue lookup by folder alias;
  - tests: instrument and format, members, auxiliary left out, the
    deterministic id, a watchdog duplicate dropped.
- [x] **F2/F5/F6, the build:**
  - `build()` merges the shot list with LabFrog's, by date;
  - the events are added;
  - the settings, the flag and the trigger, including multi-campaign mode;
  - `experiment_id_source` `shotsheet`;
  - tests: a real builder run on the fixture, and LabFrog winning a date.
- [x] **Vanlife measured:** a real build of Vanlife 12-01 and 12-03 from
      the committed indexes (the NeXus file and the catalog). Shots,
      attached, suggested and waiting; the files without a catalogue
      instrument.
- [x] **Docs and next-on-server:**
  - `deploy-notes.md` and `next-on-server.md`: set `ALIGNER_CAMPAIGNS` for
    Vanlife, build 12-02 and 12-05's indexes, rebuild, then the
    containers and the phase 6 compare;
  - `operations.md`, `architecture.md`, `CLAUDE.md`, the settings template,
    `hzdr/CHANGELOG.md`.
- [x] **Gates:**
  - ruff, pyright at its 197 baseline, pytest, the coverage map;
  - the frontend label for `shotsheet`, with vitest, lint and e2e if the
    frontend changes;
  - acceptance.
- [x] **GitLab:**
  - hzdr-combo `NEXT.md` (the rulings);
  - the fwkt-webapps DAMNIT page;
  - the PR #58 description.

## Not in this plan

- **Containers for Vanlife:** they need the raw files on bigdata, so they
  are written on the server: the container worker, then
  `hzdr-compare-containers.py` against shot-aligner's.
- **More campaigns:** each is one more entry in `ALIGNER_CAMPAIGNS`, once
  its days are indexed and reviewed in shot-aligner.

## Results

**Vanlife 12.2025 from the two committed indexes** (single-campaign build,
no LabFrog export, no events, `--aligner-campaign` for 2025_12_01 and
2025_12_03; 4 s):

| Day | Shots (Shotsheet) | Files | Attached | Waiting as suggestions |
| --- | ---: | ---: | ---: | ---: |
| 2025-12-03 (reviewed) | 150 | 2,544 | **2,544** (every shot has its files) | 0 |
| 2025-12-01 (not reviewed) | 108 | 1,698 | 0 | 1,698 (`aligner_unconfirmed`) |

- Every instrument folder was found in the vendored catalogue; no file is
  without an instrument.
- `/entry/shots/experiment_id_source` is `shotsheet` for all 258 shots.
- The container worker accepted the events: it wrote all 150 of 12-03's
  containers, and the rebuilt master links them all from its root. Here the
  detectors are empty and the 12,120 recorded problems are missing raw
  files, which are on bigdata. On the server the same run fills them, and
  `hzdr-compare-containers.py` checks them against shot-aligner's (phase 6).
- 12-02 and 12-05 have no index committed; they follow on the server
  (`deploy-notes.md` step 7).

**Tests:**
- 8 more in `test_hzdr_aligner.py`, 28 in all:
  - the shot list across two sets, with a placeholder row;
  - the file events and an uncatalogued folder;
  - LabFrog keeping its date, a producer keeping its file (and a file of
    the same name on another day);
  - strict date parsing and the trigger arguments;
  - a real single build and a multi-campaign build with no spool.
- **Gates:**
  - ruff is clean;
  - pyright is at **193**, 4 below the 197 baseline: the builder's
    `active` list now has a type;
  - pytest: 1,109 passed, 33 skipped;
  - the `next-on-server.sh` check was run by hand: a listed date without an
    index is named;
  - no frontend change.

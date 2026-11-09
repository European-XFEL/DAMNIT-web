# Container writer (campaign output, phase 3)

Design note, 2026-10-04. Phase 3 of HZDR_combo `planning/NEXUS_OUTPUT_PLAN.md`
("Container writer"); the repository-level summary is
[campaign-output-plan.md](campaign-output-plan.md). It settles how DAMNIT turns
the events of one shot into `shots/<YYYYMMDD>_<shot_number>.nxs`, held to the
reference fixture's manifest (`api/tests/fixtures/hzdr-reference/`). Phase 4
links the containers from the master, phase 5 validates them; neither is here.

## 1. Product row or join: **join `source_events` by `event_id`**

The converter reads the published master's `/entry/source_events` table
(`event_id`, `shot_key`, `payload_ref_json`, `metadata_json`) and its
`/entry/shots` table (`shot_key`, `fired_at`, LabFrog columns). Every fact a
pack needs is already there: `metadata.instrument.{id,format,timing_role}`,
`metadata.acquisition.{time,time_source}`, and `payload_ref.members` with each
member's `sha256`. A `/entry/data_products` row of kind `file` keeps its
`metadata_json.event_id`, which is the join key back to the same row.

Why: `data_products` stays a flat table of references, nothing is stored twice,
and the bridge profile stayed `hzdr-canonical-shot-v5` (v6, 2026-11-09, only
adds `/entry/shots/authority_shot_number`). The master is also the
one place where matching, campaign resolution and review rulings have already
decided which shot an event belongs to, so the worker never re-runs matching
and cannot disagree with the master it will be linked from.

The worker opens the master read-only, reads both tables, and closes it before
converting anything, so a long conversion never holds the master open (on
Windows an open handle would block the builder's atomic rename).

## 2. Grouping events into acquisitions

Per shot (`shot_key`) and instrument (`metadata.instrument.id`), the files of
all its events (`payload_ref.members`, or `payload_ref.path` alone) are grouped
by the **acquisition key** shot-aligner's `claim()` gives each file name
(section 3). Files with the same key are one acquisition:

- a camera's PNG and its CSV sidecar share a stem, so they are one acquisition
  (watchdog already sends them as one event with two members);
- a recording named by its conditions (`20cm_6kv_00001.tif`, `_00002.tif`; the
  `conditions_and_frame` pattern) has the label as its key, so the per-frame
  events planet-watchdog sends for one cadence group (`frames_per_shot`) become
  one acquisition and one `[frames, y, x]` stack, as shot-aligner writes it;
- set-and-ordinal frames (`set10_00001.tif`) keep their stem as key, so each is
  its own acquisition, again as in shot-aligner;
- a `.rec` comment sidecar falls to its frame's key, whether it arrives as a
  member or as an event of its own.

A recording whose cadence spans two shots splits by shot: grouping is within a
shot, so each shot gets the frames attributed to it.

Two acquisitions of one instrument in one shot become two detectors. They are
ordered by their earliest `metadata.acquisition.time`, then by key, whatever
order the events arrived in (shot-aligner's index order is its event's
acquisition order, which is also time). The first keeps the plain name; the
next takes shot-aligner's `<detector>_<seq>`, or, with no ordinal, its
sanitised key (file stem or recording label) rather than shot-aligner's `_0`.
A name that would land on a field the writer owns gets a suffix: a family that
sanitises to an entry field (`title`, `start_time`, `conversion_problems`, ...)
becomes `<name>_instrument`, and a detector called `name` becomes
`name_detector`. An event whose
`instrument.format` names no pack is recorded as a problem and skipped; events
without `metadata.instrument` (triggers, LabFrog rows) are not acquisitions.

## 3. `seq`, `label`, `when`: from the file name, no event-schema change

`seq` and `label` come from the vendored pack manifests' `namePatterns` (the
same regexes `claim()` uses; suffix stripping as each pack's `_stem`). `when`
is `metadata.acquisition.time` of the acquisition's earliest event, and
`time_source` comes beside it. `hzdr-event-v1` is unchanged.

One deliberate difference from shot-aligner: its recording claim also requires
a quantity token and refuses a set label, because there it decides *whether a
file is an acquisition at all*. A producer has already decided that here. So
`focus_00001.tif` and `focus_00002.tif`, which shot-aligner leaves unparsed,
stack here as one recording of the `focus` label when both are attributed to
the same shot, and a name no pattern fits is converted with its stem as key
and no `seq`. Tested in `test_frames_with_a_label_but_no_quantity_still_stack`.

## 4. Container layout

`<campaign folder>/shots/<YYYYMMDD>_<shot_number:06d>.nxs` (date and number
parsed from `shot_key`; `unknown` when the shot has no date). Digits,
underscore and `.nxs` only, so the name is legal on Windows and the `Z:` share,
and it does not change when a ruling moves the shot to another campaign. The
`shot_key` is stored as an attribute on the root and on `/entry`.

One `NXentry`. Group names come from the vendored, unchanged
`nxwrite.container_groups`, fed from the vendored NDS catalogue
(`hzdr_packs/vendor/hzdr-draco-<version>.json`, the version the packs sync pins):
`family` is shot-aligner's `group`, `instrument_name` its `instrumentName`,
`detector_name` its `detectorName`. So M1_Spec_Fib_Cer lands at
`/entry/Reflected_light_spectroscopy/_515_Reflected_Light_Spectrometer`,
exactly where the manifest has it. Each detector also gets shot-aligner's
`local_name` (the catalogue's `display_name`), `timing_role` and the
`file_metadata` `NXnote`. `file_path` there is the path the event recorded,
not this host's mount of it. `recorded_offset_removed` is 0.0 with a
description saying DAMNIT fits no offset (the contract lists the field).

## 5. Mapping rows: phase 4b, `hzdr_packs/mapping_rows.py`

shot-aligner's `mappings.apply_to` (the reviewed and proposed NDS rows that
link pack output to agreed paths) is ported to h5py with its rules intact:

- **Additive.** A row hard-links the dataset the pack wrote to the agreed path
  (shot-aligner's `NXlink`), so both names stay valid. A row with
  `value_transform`/`convert_to_unit` writes a new dataset instead, stamped
  `derived_from`, with the factors shot-aligner's `TRANSFORM_FACTORS` and
  `UNIT_SCALE` hold; anything else is reported, never guessed.
- **Reported, never forced.** A source the acquisition did not write, a target
  another instrument already claimed, a group the build wrote, a dataset no
  mapping wrote, or a row placed for a detector or machine this diagnostic is
  no longer written as: each is one line in the container's own
  `/entry/mapping_problems` note (kept apart from `conversion_problems`), and
  the other rows are still written.
- **Stamped.** Every linked or derived dataset carries `mapped_from`,
  `mapping_status`, `nds_local_name`, `nds_status`, `source_path` (plus
  `nds_confidence`, `registry_key`, the row's note as `description`).
- **Definitions.** A mapping's application definition is recorded on its
  detector (`nds_definition`); rows placed in `/entry/<detector>` go to an
  `NXsubentry` carrying `definition`, whose `NXdata` is told to plot what the
  detector plots. Without a subentry it is claimed on the entry only when the
  container holds that one instrument.
- **Applied last**, after every detector and the shot's own fields, as in
  shot-aligner's build; for every detector kept, by its `instrument.id`.
- **As shot-aligner writes them.** A link carries nexusformat's `target`
  attribute (the original name) unless the dataset already had one;
  `source_path` and `derived_from` have no leading slash. Attributes stamped on
  a hard link are the pack's dataset's too, as in nexusformat. Checked against
  shot-aligner's own build of the reference shot: the definition subentry
  matches its manifest node for node, and `/entry/mapping_problems` holds the
  same lines as the mapping part of its `/entry/alignment/problems`.
- **Deliberate differences.** A row that raises costs that row only (the
  original would fail the build); `nds_subentry` and the subentry plot are
  set only when a row actually landed in the subentry.
- **Listing.** A linked dataset has two names, and `visititems` reports the
  first in name order, which can be its subentry name. Shot detail lists each
  dataset once, under the detector's own name; a derived value (one name
  only) is listed where the mapping wrote it.

The mapping files are vendored byte for byte from shot-aligner's
`config/mappings/` into `hzdr_packs/vendor/mappings/` by
`sync-hzdr-packs` (a mapping added or removed upstream is drift, and `--apply`
brings or removes it). They are data: the conversion-code digest leaves them
out, and each container's fingerprint carries the sha256 of the mappings of
the instruments it holds, so changing one mapping rebuilds only the shots
holding that instrument. The reference container now matches all 101 contract
nodes; the definition subentries stay outside the contract, as in shot-aligner's
fixture.

## 6. Worker

`api/scripts/hzdr-container-worker.py` is a separate process; the conversion
lives in `damnit_api.metadata.hzdr_containers`.

- **Started by the builder trigger** when
  `DW_API_HZDR_BUILDER__CONTAINERS_ENABLED=true` (default off): once before the
  master build, so already published shots convert while it runs, and once after
  a successful build, so new shots convert without waiting for another event.
  The trigger does not wait for it; it logs to `.hzdr-container-worker.log`
  beside the output, moved to `.log.1` past 5 MiB.
- **One worker, campaigns in turn** (review decision d). `--master` names one
  campaign; `--output-root` finds every `<root>/<campaign>/<campaign>.nxs`, and
  `--campaign` (repeatable) limits that to the named ones for a manual run.
- **The `_unassigned` bucket is skipped** with `--output-root` (review decision
  a): its shots are converted again once a campaign claims them, and a date is
  1 to 20 GB. `--include-unassigned`, or
  `DW_API_HZDR_BUILDER__CONTAINERS_INCLUDE_UNASSIGNED=true`, converts it too;
  an explicit `--master` is always converted.
- **Its own lock per campaign**: `shots/.convert.lock`, the same
  `single_writer_lock`, never the master's `<campaign>.nxs.lock`. A worker that
  finds the lock held writes `shots/.convert.pending` and exits; the holder
  re-reads the master and makes another pass while that marker exists or the
  master changed since its pass began, and checks the marker once more after
  releasing the lock, so no request is lost.
- **The lock records `host:pid:process-start`** (shared with the builder). An
  empty lock younger than 5 s is one being written and counts as held. A dead
  PID, or a PID whose start time differs (reused after a reboot), on this host
  is reclaimed. **On this host the PID decides, never age**: a live worker
  that stalled (a hung read on a mount, one huge container) keeps its lock.
  Another host's PID cannot be checked: the worker refreshes its lock once per
  container and reclaims another host's lock not refreshed for 30 minutes; the
  builder passes no age and never steals another host's lock (before, it
  checked that PID locally and could). A legacy bare-PID lock behaves as
  before. The record ends in a per-acquisition nonce, and a holder removes the
  lock on release only while it still holds its own record.
- **A holder whose lock was taken over stops.** `WriterLock.refresh()` reads
  the lock back and raises `LockLostError` when it no longer holds this
  holder's record. The worker calls it before each container, before each
  rename and before each manifest write, so a worker overtaken by age (another
  host's reclaim) publishes nothing more; the error fails that campaign's run
  (exit 1). The window left is a reclaim landing between a refresh and the
  rename it guards, which needs a 30-minute stall to end in those
  microseconds.
- **The guard is shared by every user.** It is created and then chmodded
  0666, and one another user created without write access is opened
  read-only, which `flock` and `msvcrt.locking` accept, so an operator's
  manual builder run beside the service user's guard is serialized, not
  refused. On NFS, where Linux emulates `flock` with a byte-range lock that
  refuses a read-only descriptor (`EBADF`), that run falls back to "no kernel
  locks" (no reclaim). Guards made before this change are 0644: `chmod 0666`
  any existing `*.lock.guard` when deploying.
- **A worker stuck forever on a dead mount keeps its lock** (its PID is
  alive). Kill it; the next worker reclaims the lock from the dead PID.
- **Reclaiming a stale lock is serialized.** Every create, reclaim and release
  runs under a kernel lock on a sidecar `<lock>.guard` (`flock` on POSIX,
  `msvcrt.locking` on Windows; held for milliseconds, released by the kernel
  if its holder dies, kept on disk so its identity never changes). Under it a
  reclaim renames the stale lock to a unique tombstone, checks that the
  tombstone says what was judged stale, and only then creates. Without the
  guard the tombstone alone is not enough: a third process can create while a
  moved lock is out, and measured with six contenders it double-held in most
  rounds. So where the filesystem has no kernel locks (`ENOLCK`) a stale lock
  is **not** reclaimed automatically and must be removed by hand. On sshfs the
  kernel emulates the guard per host: it excludes every process on the API
  host, where the worker and builder run, not processes on two hosts.
- **Atomic and resumable**: each container is written to
  `<name>.nxs.<nonce>.tmp` (the writer's own, from its lock record),
  fsynced, and renamed into place, retried up to 10 x 0.5 s while Windows
  refuses the rename because a reader holds the target (review decision c; the
  builder's master rename has the same retry). Its input fingerprint is stored
  as a root attribute and in `shots/.build-manifest.json` (written atomically,
  flushed every few seconds and at the end). A container is skipped when the
  manifest, or failing that its own attribute, holds the same fingerprint. A
  crash mid-date leaves finished containers in place; the next run adopts them
  and converts the rest. Earlier writers' temp files (`*.nxs*.tmp`) are
  removed at the start of a pass, under the lock; an earlier writer still
  running cannot publish, because its `refresh()` fails first.
- **One container's failure is that container's.** A refused rename, a full
  disk or any other error is recorded as `error` in its manifest entry, the
  worker exits 1 and names it, and the pass goes on with the next shot.
- **Fingerprint**: per member the producer's `sha256` *and whether the file is
  there* (so a file that comes back is converted even when a crash lost the
  manifest); a stat only when a producer sent no `sha256`. Also the acquisition
  facts above, the shot fields written, the catalogue's SHA-256, a digest of
  the conversion code (packs, vendored files, this module), the h5py, libhdf5
  and Pillow versions, and a digest of the path map. Any of them changing
  rebuilds the containers it covers.
- **Changed under the same sha256** (review decision b): the producer's
  `sha256` is trusted, but each member's `[size, mtime_ns]` is recorded at
  conversion (manifest and the container's `damnit_input_stats` attribute) and
  stat'ed on every pass. When it moved, the shot is reconverted from the bytes
  on disk and `/entry/conversion_problems` says which file changed.
- **Memory** is bounded by one frame while converting (the packs stream), and
  by one slice of `READ_SLICE` (4096) rows while reading the master: only
  events naming `metadata.instrument.format` are kept, and only the fields a
  container is written from (instrument, watch folder, acquisition time; paths,
  sizes and `sha256`).
- **Missing or unreadable files**: a detector whose pack wrote nothing
  plottable and no array is removed (and its `NXinstrument` if left empty), and
  the reason goes into `/entry/conversion_problems` (`NXnote`). Partial
  problems (a missing CSV beside a readable frame) keep the detector and are
  recorded the same way. A pack that raises costs its detector, not the shot.
  A file that comes back changes the fingerprint (above); an unreadable file is
  not retried until its bytes change.
- **Path map**: raws are read through `DW_API_METADATA__PATH_MAP`
  (`shared/hzdr_paths.py`), or `--path-map`.
- `file_metadata/sha256` lists each member's recorded `sha256`, one
  `<name> <sha256>` per line (a DAMNIT field the manifest does not have).
- **Deploy: every writer is upgraded together.** Code before 615df7a reads the
  record `host:pid:start:nonce` as PID -1 and steals a live lock, so the API
  checkout and any `/opt` install (and a manual builder) must run the same
  version. A crashed builder's lock whose host name has since changed (a
  container restart) looks foreign and is removed by hand.
- **Not here**: the master's links and garbage collection (phase 4, section 8
  below), validation (phase 5),
  the mapping rows (review decision e: a phase of its own, planned by the
  coordinator).

## 7. Shot-level metadata (minimal)

`/entry`: `title` (`<campaign> <date> shot <number>`), `start_time` (the
shot's `fired_at` from `/entry/shots`, the trigger or earliest event time),
`experiment_identifier`, `entry_identifier` (the container stem), attributes
`shot_key`, `shot_number`. Where `/entry/shots` has a LabFrog row,
`/entry/labfrog_shot` (`NXcollection`) carries `record_id`, `date_time` and
`local_count`. Root: `NX_class=NXroot`, `default=entry`, the container profile
`hzdr-shot-container-v1`, the fingerprint.

Deferred: the LabFrog shot parameters with registry units (shot-aligner's
`shot_parameters`), the target sample and laser groups (they stay in the
master), backgrounds (`<campaign>_backgrounds.nxs`), and an entry-level plot
(decision 6 keeps only each detector's default).

## 8. Phase 4: the master links the containers

- **Links.** The builder links each container from the master's **root**:
  one relative `ExternalLink("shots/<YYYYMMDD>_<number>.nxs", "/entry")` per
  shot, named by the container's stem, so the master is a multi-entry NeXus
  file: `/entry` (the campaign) beside one `NXentry` per shot, as
  shot-aligner's masters are built. Under `/entry` (the first version) pynxtools
  validated the containers as part of the campaign entry and declared it
  invalid against NXhzdr_target; at the root each is an entry of its own and
  the campaign entry stays valid (phase 5 found this). `/entry/shot_containers`
  (`NXcollection`, `damnit_source="shot_containers"`) is the index: `shot_key`
  and `container` string datasets, so a reader joins `/entry/shots` on
  `shot_key` rather than parsing names. A shot is linked when **this build**
  has an acquisition event for it (`metadata.instrument.format`, the rule the
  worker plans containers by, `hzdr_nexus.is_acquisition`) **and** its
  container is in place: the file opens as HDF5, holds `/entry` and its root
  `shot_key` is this shot's. So a shot whose files a ruling moved elsewhere
  keeps its row but is not linked to a stale container, and a foreign file or
  another campaign's shot under the same name is not linked. Every build drops
  the root links into `shots/` it finds (a seeded previous master's) and
  writes them and the index whole. The bridge profile is unchanged (no table
  column changed). Relative links resolve against the master's own folder
  (checked with a decoy `shots/` in the working directory; `HDF5_EXT_PREFIX`
  would override it).
- **The master never links a missing container**: it links only files already
  renamed into place, and is itself renamed last.
- **Catching up.** Containers are written outside the campaign lock, so a new
  shot's container lands after the master that introduced it. When the worker
  is done with a campaign it compares what *this invocation* did with the
  master as published *then* (`relink_needed`): a container it wrote that the
  master does not link, or one it collected that the master still links. Any
  such container makes it exit `RELINK_EXIT` (3; 4 when a container also
  failed), and the trigger asks for one more build
  (`BuilderTrigger.worker_finished`). Judging at the end, across every pass,
  matters: a build that publishes during a long pass makes `run_conversion`
  run a second pass that writes nothing, and the containers the first pass
  finished after that build looked must still be linked. Only this
  invocation's containers count, so it converges (at most about two extra
  builds when the before- and after-build workers both ask; their wakes
  coalesce).
- **Garbage collection.** After each pass, from the master as published, the
  worker collects `<YYYYMMDD|unknown>_<number>.nxs` files whose shot has no
  acquisition in that master (moved to another campaign, or its files ruled
  onto another shot), and drops their manifest records. Only a container
  whose own root `shot_key` names this master's campaign is collected, so a
  folder shared by two masters (single-campaign mode after `OUTPUT_NEXUS`
  moved to a new campaign in the same directory) keeps the other's
  containers; an unreadable file is left for a person. A collected container
  is **moved to `shots/.trash/<name>.<unix time>`, not deleted**, and purged
  after `TRASH_GRACE_S` (7 days): a build that missed a producer for once
  costs a reconversion, never the containers. A shot that comes back is
  converted again from its raw files; restoring one from `.trash` instead is
  a manual move. It never
  touches the lock, its guard, the pending marker, the manifest, temp or
  tombstone files, or any other name. A master with no acquisition at all
  collects nothing. A file held open on Windows is retried on a later pass.
  Only campaigns the worker converts are collected, so the `_unassigned`
  bucket keeps its containers unless it is converted (`--include-unassigned`).
  That is intended (maintainer, 2026-10-20).
- **API.** `hzdr_sources.list_container_datasets(campaign file, shot_key)`
  follows that shot's link (`visititems` does not), and shot detail lists
  the container's datasets as `<stem>/...` with the link in `container`; previews read them through the same campaign file.
  A preview reads only what it shows (the first frame of a stack, strided; the
  first 200 values of a line), since a name can now reach a camera stack.
- **Cost.** Each build checks the container of every shot with an acquisition
  is in place. It opens only the ones it has not seen: a container the last
  build found in place for the same `shot_key`, with the same size, mtime and
  inode, is taken as still in place (`_InPlaceCache`,
  `.hzdr-container-check.json` beside the master, added 2026-10-20). The
  worker only renames whole new files into place, which changes all three.
  Each build keeps only its own finds, so a container that is gone drops
  out. A cache that is missing, unreadable or cannot be written costs one
  full check, never a build.
- **SciCat** still registers the campaign file; registering the folder
  (master + `shots/`) belongs with the side-by-side run (phase 6).

## 9. Phase 5: the validation gate

`api/scripts/hzdr-nexus-validate.py` runs in nexus-design-studio's own
environment (NDS has pynxtools; DAMNIT does not depend on it) and imports
nothing from `damnit_api`, so one process checks a whole campaign: about
0.33 s per container with an Irr8 subentry, so some 50 s for 150.

- **Master**: NDS's structural check; pynxtools against the definition
  `/entry` declares (`NXhzdr_target`, overlaid from `hzdr/nxdl`); and every
  root link into `shots/` must resolve to a container holding `/entry` (the
  master never names a missing container). The per-shot entries at the root
  declare no definition, so pynxtools leaves them to the container checks.
- **Containers** (this campaign's, by their own `shot_key`; another master's
  in a shared folder are left out): NDS's structural check (NX classes, a
  top-level NXentry), and pynxtools on every `NXsubentry` that declares a
  definition (the mapping rows' claims: `NXoptical_spectroscopy` for the Irr8
  spectrometers). One container that cannot be checked is an error for it,
  not the end of the run.
- **Exit 1, the gate**: a structural error in the master or a container, the
  master's entry not valid against its definition, a dangling container
  link, or a subentry finding outside the gaps `KNOWN_SUBENTRY_GAPS` lists
  for the definition that subentry declares. Warnings are
  counted, never gating. A subentry whose only findings are the known gaps is
  *not certified* and gates only with `--strict-subentries`.
- **Exit 2, could not run**: no nexus-design-studio or pynxtools in that
  Python, a missing `--output-root`, no NXDL in `--definitions`, or a
  `--master` that is not there (checked before NDS loads; a campaign that
  fails still makes the run exit 1). It writes a report with `"ran": false`
  wherever the campaign folder exists, so an older passing one is not read
  as current.
- **Known gaps (today)**: every Irr8 subentry lacks `experiment_type`, the
  `beam_TYPE` and `detector_TYPE` groups and `definition/@URL`/`@version`,
  and its `number_of_cycles` is not NX_INT. shot-aligner's own build of the
  reference shot has exactly the same findings (checked in review). Filling
  them is a mapping decision (the rows in shot-aligner's `config/mappings`,
  reviewed by a person), not a converter's to invent; once they are filled,
  drop them from `KNOWN_SUBENTRY_GAPS` and run with `--strict-subentries`.
  The gaps are keyed by definition (`NXoptical_spectroscopy` only), so the
  same finding under another definition is new.
  Any *other* subentry finding is new and fails the gate, so a regression is
  not hidden behind the known ones.
- **Report**: `<campaign folder>/.validation.json` (written atomically,
  fsynced) and one line per campaign, each finding once (pynxtools' own
  stderr echo is silenced while the gate runs it), e.g. `Validation (c.nxs): passed;
  master 0 error(s), 1 warning(s); 150 container(s), 0 error(s), 150
  warning(s); subentries 0/40 certified`.
- **After each build**: with `DW_API_HZDR_BUILDER__VALIDATION_PYTHON` set to
  that environment's Python (e.g. `<nexus-design-studio>/.venv/bin/python`),
  the trigger starts the gate when a container worker exits, or right after a
  successful build when containers are off, logging to `.hzdr-validation.log`
  beside the output. Not after a worker that asked for a relink (its build
  follows, and that build's worker validates) or one that converted nothing
  (`BUSY_EXIT`, 5: another worker had every campaign). **One run at a time**:
  a request while one runs is remembered once and starts when it ends. When
  it ends, the API log gets each campaign's counts from the reports that run
  wrote (one older than its start, e.g. a campaign without a published
  master under `OUTPUT_ROOT`, is skipped), and "could not run" for exit 2.
  Empty (the default): off.
- **In CI**: `api/tests/test_hzdr_nexus_validate.py` runs the gate on the
  reference output with that Python (`HZDR_NDS_PYTHON`, or the sibling
  `../nexus-design-studio/.venv`) and skips where there is none, like the
  shot-aligner sync checks without their sibling. DAMNIT's GitHub CI has no
  NDS checkout, so there it skips (the exit-2 cases still run); it runs
  wherever the sibling is (the combo, `test-all`, fwkt-webapps). The gate uses
  NDS's public `assemble_definitions_tree` and `load_pynxtools_validator`
  (NDS `feat/public-validation-helpers`), falling back to their private
  `_`-prefixed forms in an older NDS; those tests break if neither is there.

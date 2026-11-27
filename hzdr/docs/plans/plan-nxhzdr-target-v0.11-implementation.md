# Plan: putting `NXhzdr_target` v0.11 in force

Branch `feat/nxhzdr-target-v0.11`, from `main` at `8bbe3cb7` (PR #62 merged).
Same format as the other plans here: rulings first, then decisions, and a
checklist ticked in the commit that does the work. The proposal is
[nxhzdr-target-v0.11-draft.md](nxhzdr-target-v0.11-draft.md); the session
notes are in
[handoff-nxhzdr-target-v0.11-implementation.md](handoff-nxhzdr-target-v0.11-implementation.md).

## Rulings (maintainer, 2026-11-27)

- **R-2026-11-27a:** "Shots without a number should be in an ambiguous
  section or something, not thrown out." Shots the shot authority numbered
  go to `pump_probe/events`. Every other shot goes to
  `pump_probe/events_unidentified`.
- **R-2026-11-27b:** "keys look OK for now." The 12 proposed keys are
  registered as the draft names them.
- **R-2026-11-27c** (the maintainer chose these from options put to them
  during the implementation, after pynxtools was tried on a real file):
  - the record is a **root entry, `/pump_probe`**, not an `NXsubentry` of
    `/entry` (D0);
  - pynxtools' crash on per-event enumerations is handled in the gate, and the
    schema drops its `@reference_beam` enumeration (D12).

## Decisions (this plan; the maintainer may overturn any of them)

- **D0: a root entry, not a subentry** (R-2026-11-27c). pynxtools does not
  switch definitions at an `NXsubentry`: it checks the subentry's contents
  against `NXhzdr_target`, so every campaign with a probe delay failed the
  gate. As a second `NXentry` at the file's root, beside `/entry`, the
  record is checked against its own definition, and `/entry` stays valid.
  The master already has more than one entry at its root, since the
  container links are there too. `NXhzdr_target` describes `/entry` only, so
  the draft's `NXsubentry` block left it. Paths in this plan that read
  `/entry/pump_probe` are now `/pump_probe`.

The schema is the HZDR_combo copy at
`combo/planning/papers/daphne-laser/schema/` (draft v0.2): the core
`NXlaser_pump_probe`, the base class `NXsynchronization`, and the site
definition `sites/NXlaser_pump_probe_hzdr_draco`.

- **D1: which definition the record declares.** The record declares
  `NXlaser_pump_probe_hzdr_draco` when everything the site definition
  requires is there. Otherwise, when everything the core requires is there,
  it declares the core `NXlaser_pump_probe`, and the build log names the
  site items that are missing. The site items the core does not require are:
  - `experiment_identifier`;
  - `events/time` on every numbered shot;
  - `events/status`;
  - `source_pump/frequency`;
  - `beam_pump/spot_size`.
  
  Data the campaign has is not dropped because the site asks for more.
- **D2: when a required core item is missing, no record is written.** The
  build logs one warning that lists every missing item. v0.11 promises that
  nothing v0.10 wrote breaks, so a record that would fail validation is
  never written. The core items that can be missing are:
  - `start_time`;
  - a shot with an authority number;
  - the laser's `name`, `pulse_energy`, `pulse_duration` and
    `incident_wavelength`;
  - `probe.source` and `probe.type`, and a probe kind derived from the type
    (D6);
  - `sync.scheme` and `sync.delay_mechanism`;
  - `/entry/sample/name`.
- **D3: `events`.**
  - It holds the shots with an authority number (`authority_shot_number` ≥ 0),
    in `/entry/shots` order.
  - `identifier` is that number, with `@issuer = "HZDR DRACO shot authority"`.
  - `shot_key` is on every row, to join back to `/entry/shots`.
  - `@axes = "identifier"`. `@signal = "pulse_delay"`, a soft link to
    `instrument/beam_probe/pulse_delay`, as the schema's Kiel example does.
  - A campaign without a numbered shot writes no record (D2). There is
    nothing to give an identifier to, and the shots stay in `/entry/shots`.
- **D4: per-shot arrays have one row per `events` row.**
  - `beam_probe/pulse_delay` takes `probe.delay` per shot, `NaN` where a
    numbered shot has none.
  - `pulse_delay_set` is written only when some shot has `probe.delay_set`,
    `NaN` elsewhere.
  - `events/amplification_state` is written only when every numbered shot has
    `laser.amplification_state`. It is an enumeration, so a filler value
    would be invalid; the log says when it was left out.
  - `events/time` is `fired_at`. It is left out (D1) when a numbered shot has
    none.
  - `events/status` is LabFrog's `shot_status`, whose values are the schema's
    enumeration (`shot`, `misfire`, `test`, `dark`, `calibration`).
- **D5: campaign-level values come from the first shot that has them.** This
  applies to the `probe.*` constants (`source`, `type`, `wavelength`) and to
  `sync.*`. It is the rule the laser, target and vacuum snapshots already
  follow, with one warning when a later shot differs.
- **D6: `source_probe/probe` and `previous_source`.** The core requires
  `probe` (the NXsource enumeration) but no key carries it. It is derived from
  `probe.type`:
  - `UV Laser` gives `ultraviolet`;
  - `Optical Laser` and `Laser` give `visible light`, as the main entry
    already labels the 800 nm DRACO laser.
  
  For a laser-type probe, `previous_source` names `source_pump`: the DRACO
  probe arm is split from the pump. Any other `probe.type` has no derived
  probe kind, so no record is written (D2). `probe.type` stays a free string
  in the registry. A 13th key for the probe kind would need a ruling.
- **D7: constants.** Paths are absolute inside the record, as in the
  schema's examples:
  - `source_pump/associated_beam` and `source_probe/associated_beam` name
    `/pump_probe/instrument/beam_pump` and `.../beam_probe`;
  - `beam_pump/associated_source` and `beam_probe/associated_source` name the
    two sources;
  - `pulse_delay/@reference_beam` names `beam_pump`;
  - `pulse_delay/@synchronization` names `/pump_probe/instrument/synchronization`.
- **D8: entry-level fields.**
  - `title` is a soft link to `/entry/title` when that exists. Otherwise it
    is a dataset, `"<experiment_id>: laser pump-probe record"`.
  - `start_time`, `end_time` and `experiment_identifier` are soft links to
    their `/entry` fields.
  - `sample` is a group of its own. It links `/entry/sample`'s `name`,
    `description` and `target_type`, but not `type`: the HZDR classes held
    there fail the base `NXsample/type` enumeration.
  - Every link is a NeXus link: the linked object carries `@target`, as
    pynxtools expects.
  - `definition` is a dataset (D1).
- **D9: `synchronization/time_zero`.** The schema requires `@method` and
  `@determined_at` on `time_zero`, so `time_zero` is written only together
  with `sync.time_zero_method` and `sync.time_zero_date`. Otherwise it is left
  out and the log says so.
- **D10: links into the laser group, not copies.** These are soft links:
  - `source_pump`: `name`, `type`, `probe` and `frequency`;
  - `beam_pump`: `pulse_duration`, `incident_wavelength`, `spot_size`,
    `polarization_label` and `temporal_contrast`;
  - `beam_pump/pulse_energy`: a link to `/entry/instrument/laser/pulse_energy`,
    the laser's pulse energy in J.
  
  `source_pump` and `beam_pump` are real groups, because they also carry
  `associated_beam` and `associated_source`. `polarization_label` is linked
  only when its value is in the core's enumeration (`p`, `s`, `circular left`,
  `circular right`). A registry label such as `circular_left` would fail
  validation, and the field is optional.
- **D11: Part A in the main entry.**
  - `spot_size = [beam_waist_x, beam_waist_y]` (um), with
    `@definition = "1/e^2 intensity radius"`, only when both waists are
    present.
  - `polarization_label` has the same value as `incident_polarization`.
  - `temporal_contrast` (NXdata, `@signal = "intensity_ratio"`,
    `@axes = "time"`) has `intensity_ratio = [contrast_ratio]` and
    `time = [-contrast_time]` (ps). It is written only when both keys are
    present.
  - `/entry/sample/target_type` has the same value as `type`.
  
  Config-filled values keep `damnit_source="config"` on the new fields too.
- **D12: the gate checks `/pump_probe` against its own definition**
  (R-2026-11-27c). NDS already checks every root entry that declares a
  definition. pynxtools' `is_valid_enum_hdf` raises on a 1-D string array
  with an enumeration (`events/status`), which ends its check of the entry
  there. A "known gap" would therefore have hidden every finding after it: a
  file without `sync.scheme` passed. Instead, on that crash the gate
  (`Validator.recheck_without_enum_arrays`):
  - checks each such array's values against the NXDL enumeration itself;
  - removes the arrays from a temporary copy;
  - has pynxtools check the rest of the copy.

  Every finding gates. In HZDR_combo the schema's `pulse_delay/@reference_beam`
  lost its enumeration, which held the template `/ENTRY/INSTRUMENT/beam_pump`
  that no path can match, and the copy in `hzdr/nxdl/` matches it again.
- **D13: the unit of the new numeric keys.** The unit is the registry's:
  ps for `laser.contrast_time`, `probe.delay`, `probe.delay_set` and
  `sync.time_zero`, and nm for `probe.wavelength`. The enumerations go in
  `METADATA_KEY_VALUES`:
  - `laser.amplification_state`: `full`, `reduced`, `unamplified`;
  - `sync.scheme`: NXsynchronization's `common oscillator`, `rf locked`,
    `trigger only`, `measured per event`;
  - `sync.delay_mechanism`: `optical delay line`, `electronic phase shift`,
    `bunch selection`, `pulse picking`, `trigger delay`.

  As for every registry enumeration, a value outside these lists triggers a
  warning, never a rejection.

## Checklist

- [x] Plan written first (this file)
- [x] **Part A** in the writer, with tests (D11)
- [x] **Registry** (D13):
  - the 12 keys with their units in `METADATA_KEY_REGISTRY`, and the three
    enumerations in `METADATA_KEY_VALUES`;
  - the CLAUDE.md registry table, with a dated paragraph;
  - the event fixtures regenerated, if the schema export changes.
- [x] **Part B:** `write_pump_probe_entry()` (D1-D10), called from
  `write_nexus_bridge()`
- [x] **Definitions:**
  - the draft copied over `hzdr/nxdl/NXhzdr_target.nxdl.xml`;
  - the core, the base class and the HZDR site definition added to
    `hzdr/nxdl/`;
  - the draft file marked as superseded.
- [x] **The version bumped in three places:**
  - the writer constant;
  - the profile document (§2 map, §4 current version and history);
  - the NXDL enumeration.
  
  The laser map in `nexus-semantic-maps.md` is updated as well.
- [x] **Gate:** `/pump_probe` checked against its own definition, with the
  enumeration recheck (D12)
- [x] **Tests:**
  - a campaign without `probe.delay` writes only the v0.10 layout plus Part A;
  - each shot is in exactly one of `events` and `events_unidentified`, and no
    identifier is `-1`;
  - no record when a required core item is missing, and the core
    definition when only a site item is missing;
  - the record passes the gate where NDS is installed.
- [x] **Gates** (2026-11-27, Windows desktop):
  - ruff: clean;
  - pyright: 70 errors, the same as `main` before the change;
  - pytest: 1182 passed, 13 skipped. Six failed on the first full run:
    - two were this change's, and are fixed: the coverage map, and the
      registry-to-writer check, which now also recognises the `"ns", "key"`
      call shape;
    - four are Windows-only and in code this change does not touch:
      `test_config_version` (subprocess working directory),
      `test_hzdr_campaign_backfill` (backslash paths),
      `test_hzdr_package_campaign` (`sha256sum`) and
      `test_hzdr_sources_cache` (a refused local socket). They were not
      re-run on `main` or in WSL;
  - the NDS-backed suites with `HZDR_NDS_PYTHON` set: 168 passed, 6 skipped;
  - `hzdr-local-acceptance.py`: passed in both modes;
  - hzdr-combo `check_alignment.py run --groups ontology,docs,contract`:
    - the registry, profile and NXDL version checks pass;
    - the NDS transcriptions, the NDS and fwkt-webapps version mentions, and
      the `hzdr_event.py` copy in daq-watchdog fail until the cross-repo MRs
      below;
    - the hub status block and the shotcounter's timestamp-test id fail
      independently of this change.
- [x] **CHANGELOG**, and the deploy note: a rebuild applies v0.11. The code
  changed, so a quiet build publishes each campaign once.

## Cross-repo, after the DAMNIT PR (each its own MR)

These are listed in the handoff:
- the NDS profile rows and the `source_ref` re-pin;
- the daq-watchdog and shotcounter revendor, if the event fixtures change;
- in hzdr-combo: the `ontology --fix` run, the rulings in `NEXT.md`, and an
  optional emulator case with a probe delay.

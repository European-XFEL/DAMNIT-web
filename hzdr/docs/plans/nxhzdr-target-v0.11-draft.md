# `NXhzdr_target` v0.11: draft

**Status: in force since 2026-11-27** (rulings R-2026-11-27a, section 4, and R-2026-11-27b, the keys in section 3). The implementation and the decisions it took on what this draft left open are in [plan-nxhzdr-target-v0.11-implementation.md](plan-nxhzdr-target-v0.11-implementation.md). The draft definition that sat in `plans/drafts/` is now `hzdr/nxdl/NXhzdr_target.nxdl.xml`, beside the schema's `NXlaser_pump_probe`, `NXsynchronization` and `NXlaser_pump_probe_hzdr_draco`; the draft file is in the history of PR #62. The text below is the proposal as agreed, with one change (ruling R-2026-11-27c): the `pump_probe` record is a second root entry, `/pump_probe`, not an `NXsubentry` of `/entry`, because pynxtools checks a subentry against the parent's definition (implementation plan D0).

## 1. Why

The DAPHNE4NFDI laser pump–probe use case (HZDR, Kiel University, European XFEL) has a draft schema for laser pump–probe data:
- a core application definition, `NXlaser_pump_probe`;
- optional modules;
- one site definition per facility, built from that facility's marks.

HZDR's is `NXlaser_pump_probe_hzdr_draco`. The schema, its explorer and its partner pack are in HZDR_combo, `combo/planning/papers/daphne-laser/schema/` (hzdr-combo MR !149, which merged !145 with the other paper MRs on 2026-11-27).

v0.11 brings DAMNIT's campaign files in line with that schema without breaking anything v0.10 writes:
- **A. Always:** add the schema's conventions beside the v0.10 fields. Nothing is removed or renamed.
- **B. Only for a campaign with a probe delay:** add a `pump_probe` subentry that conforms to `NXlaser_pump_probe_hzdr_draco`. Most of it is links into the entry DAMNIT already writes. NeXus lets one file satisfy several definitions through `NXsubentry`, so the main entry stays `NXhzdr_target`.

The breaking clean-up is left to a later v1.0:
- `NXsample/type` back to its NeXus meaning;
- polarization as a Stokes vector;
- the laser group renamed `source_pump`.

## 2. Part A: additions to the main entry

| v0.10 (unchanged) | Added in v0.11 | Source key | Notes |
| --- | --- | --- | --- |
| `instrument/laser/beam/beam_waist_x_1e2_radius`, `_y_` | `instrument/laser/beam/spot_size` = [x, y], `@definition = "1/e^2 intensity radius"` | `laser.beam_waist_x`, `laser.beam_waist_y` | One field carrying its definition, as the schema proposes for NXbeam |
| `instrument/laser/beam/incident_polarization` (label) | `instrument/laser/beam/polarization_label`, same value | `laser.polarization` | The label under the schema's name; the Stokes vector is left to v1.0 |
| `instrument/laser/beam/contrast_ratio` | `instrument/laser/beam/temporal_contrast` (NXdata): `intensity_ratio` = [ratio], `time` = [−contrast_time] | `laser.contrast_ratio` + **new** `laser.contrast_time` | Written only when both keys are present. A contrast without its time stays in the v0.10 field alone |
| `sample/type` (HZDR target classes) | `sample/target_type`, same value | `target.type` | The schema's SITE name for the HZDR classes |

## 3. Part B: the `pump_probe` subentry

The subentry is written only when a campaign has a probe delay (`probe.delay`). No producer sends that key yet, so in practice the subentry starts with the first laser-probe campaign that records one.

| Schema item | In the subentry | From |
| --- | --- | --- |
| `events/identifier` `@issuer` | soft link to `/entry/shots/authority_shot_number`; `@issuer = "HZDR DRACO shot authority"` | bridge table v6 column (see section 4) |
| `events/time` | soft link to `/entry/shots/fired_at` | bridge table |
| `events/status` | per-shot LabFrog `shot_status` | LabFrog export |
| `events/amplification_state` | per shot | **new** `laser.amplification_state` (`full`, `reduced`, `unamplified`) |
| `source_pump`, `beam_pump` | soft links to `/entry/instrument/laser` and its `beam` fields, plus `associated_beam`/`associated_source` | v0.10 laser group |
| `source_probe` | `name`, `type`, `probe`; `previous_source` → the pump laser for an optical probe | **new** `probe.source`, `probe.type` |
| `beam_probe/incident_wavelength` | per campaign or per shot | **new** `probe.wavelength` (nm) |
| `beam_probe/pulse_delay`, `pulse_delay_set` | per shot, positive = probe later | **new** `probe.delay`, `probe.delay_set` (ps) |
| `synchronization/scheme`, `delay_mechanism` | `common oscillator`, `optical delay line` for the DRACO probe arm | **new** `sync.scheme`, `sync.delay_mechanism` |
| `synchronization/time_zero` `@method` `@determined_at` | per campaign | **new** `sync.time_zero` (ps), `sync.time_zero_method`, `sync.time_zero_date` |
| `sample` | soft link to `/entry/sample` | v0.10 sample group |

**New registry keys.** Accepted for now (ruling R-2026-11-27b, maintainer: "keys look OK for now"), and not registered yet:
- `laser.contrast_time` (ps)
- `laser.amplification_state`
- `probe.source`, `probe.type`, `probe.wavelength` (nm)
- `probe.delay`, `probe.delay_set` (ps)
- `sync.scheme`, `sync.delay_mechanism`
- `sync.time_zero` (ps), `sync.time_zero_method`, `sync.time_zero_date`

"For now": they may still change until the implementation registers them; once a producer emits one, renaming it is a breaking change, as for every registry key. They join `METADATA_KEY_REGISTRY` with the implementation, together with the NDS laser profile rows and the daq-watchdog (formerly planet-watchdog) revendor that the key-registry topic requires.

## 4. The event identifier (ruled 2026-11-27)

The schema says an event's identifier is issued once, at the source, by a named issuer. At HZDR that is the shot authority's number.

DAMNIT's `/entry/shots/shot_number` is not always that number. For a LabFrog-backed shot it is LabFrog's own, possibly typed. The authority's number is beside it in `authority_shot_number` (bridge table v6), which is `-1` where a shot has none.

**Ruling R-2026-11-27a (maintainer):** "Shots without a number should be in an ambiguous section or something, not thrown out." So:
- **`events`** holds the shots the authority numbered, with `identifier` = their `authority_shot_number` and `@issuer = "HZDR DRACO shot authority"`. No other number is ever given as an identifier.
- **`events_unidentified`** (`NXcollection`) holds every shot without one: `shot_key`, `record_id`, `fired_at`, `status` and `reason` ("no authority number"). It is written only when there is such a shot. It is named *unidentified* rather than *ambiguous* because in DAMNIT "ambiguous" already means an event waiting for review in Review matches.
- Every shot of the campaign is in exactly one of the two. A shot moves from `events_unidentified` to `events` once a later export or event gives it an authority number.
- Both are written as datasets, with `shot_key` on each row to join back to `/entry/shots`. `events` cannot be soft links to the `/entry/shots` columns, because those columns also hold the `-1` rows.

This replaces the three options of the first draft. Leaving such shots out was the recommendation then; it would have dropped shots.

## 5. What putting it in force would take

The next session starts from [handoff-nxhzdr-target-v0.11-implementation.md](handoff-nxhzdr-target-v0.11-implementation.md). It adds the items the core `NXlaser_pump_probe` requires that the list below does not name.


1. ~~Rulings on section 4 and on the keys in section 3.~~ Both made on 2026-11-27 (R-2026-11-27a and R-2026-11-27b).
2. **Writer** (`api/src/damnit_api/metadata/hzdr_nexus.py`):
   - `write_nexus_laser_group()` writes `spot_size`, `polarization_label` and `temporal_contrast`;
   - the target writer writes `target_type`;
   - a new `write_pump_probe_subentry()`, called from `write_nexus_bridge()` only when `probe.delay` is present, writes the links and the probe and sync datasets, and splits the shots into `events` and `events_unidentified` (section 4).
3. **Registry:** the new keys in `METADATA_KEY_REGISTRY` and the CLAUDE.md table, the NDS facility profile rows, and the revendor in daq-watchdog (formerly planet-watchdog).
4. **Definitions:**
   - copy the draft over `hzdr/nxdl/NXhzdr_target.nxdl.xml`;
   - add `NXlaser_pump_probe.nxdl.xml`, `NXsynchronization.nxdl.xml` and `NXlaser_pump_probe_hzdr_draco.nxdl.xml` to `hzdr/nxdl/`, so that `nds validate --pynxtools` can certify the subentry;
   - bump `HZDR_TARGET_PROFILE_VERSION`, the profile document and the enumeration together;
   - run `check_alignment.py run --groups ontology --fix` for the mirrors.
5. **Tests:**
   - a campaign without `probe.delay` writes exactly the v0.10 layout plus the Part A fields;
   - a campaign with it writes a subentry that `examples.py`-style checks and pynxtools accept;
   - a campaign with shots both with and without an authority number puts every shot in exactly one of `events` and `events_unidentified`, with no `-1` in `events/identifier`;
   - an emulator case with a probe delay.
6. **Bridge table:** no change. `/entry/shots` keeps its columns, so the bridge profile string stays `hzdr-canonical-shot-v8`.

## 6. How this draft was checked

- The draft definition (then `drafts/NXhzdr_target-v0.11-draft.nxdl.xml`) and the live v0.10 file both validate against `nxdl.xsd` from nexusformat/definitions `3b20fbc`.
- The draft differs from v0.10 only by additions (89 lines) and the version enumeration (0.10 → 0.11).
- The live profile and writer were not touched, and the alignment checker's ontology group was run afterwards (see the PR).

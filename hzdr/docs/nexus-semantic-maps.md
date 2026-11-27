# NeXus Semantic Maps — `laser.*`, `vacuum.*`, `diagnostic.*`

Updated: 2026-07-27

The versioned definition of the non-target semantic maps the NeXus bridge
writer implements: how the registry namespaces `metadata.laser.*`,
`metadata.vacuum.*`, and `metadata.diagnostic.*` land in the canonical
campaign NeXus file, using **standard NeXus classes** (`NXsource`, `NXbeam`,
`NXdata`, `NXenvironment`, `NXdetector`) — no HZDR-local class is defined
here, unlike the target map's `NXhzdr_target`.

This document is the laser/vacuum/diagnostic companion to
[nxhzdr-target-profile.md](nxhzdr-target-profile.md) (the `metadata.target.*`
→ `/entry/sample` map). Together the two documents are the normative prose
reference for the `NXhzdr_target` application definition
(`hzdr/nxdl/NXhzdr_target.nxdl.xml`), which since profile **v0.6** covers all
groups described here in addition to the sample group.

**Versioning:** this document does not carry its own version number. Any
semantic change to the maps below (field added/removed/retyped, unit changed,
placement moved) bumps the shared profile version — `HZDR_TARGET_PROFILE_VERSION`
in `api/src/damnit_api/metadata/hzdr_nexus.py`, the NXDL enumeration, and the
version/history in [nxhzdr-target-profile.md §4](nxhzdr-target-profile.md#4-versioning-rule)
— exactly as for the target map. The canonical units cited below are fixed by
the metadata key registry (`METADATA_KEY_REGISTRY` in
`api/src/damnit_api/metadata/hzdr_event.py`; human-readable copy in
[CLAUDE.md](../../CLAUDE.md)); the writer stamps them as `@units` at write
time and never hardcodes a unit string.

Related: [standards-alignment.md §3.3/§3.5–3.7](standards-alignment.md#33-laser-parameters)
(HELPMI cross-walk and the group/class mapping these maps implement),
[target-ontology.md §5](target-ontology.md#5-units-convention) (bare-key units
convention, family-wide since 2026-07-02).

---

## 1. Campaign-level vs per-shot

Laser, target, and vacuum blocks have **campaign-level snapshot groups**
from the first shot carrying each block. A later non-empty difference logs one
warning (`_first_shot_laser` / `_first_shot_vacuum` /
`_first_shot_target` in `hzdr_nexus.py`). Since profile v0.8, target is
also preserved losslessly per shot as sorted JSON in
`/entry/shots/target_metadata_json`; `/entry/sample` remains the standard
`NXsample` snapshot. Laser and vacuum differences remain warning-only.
Two other families are inherently per-shot and are written as full
shot-indexed series:

- every **numeric** `metadata.laser.<key>` → the `shot_series` `NXdata` group
  (§2.3) — energy jitter is data, not noise;
- every `metadata.diagnostic.<key>` → one `NXdetector` series group per key
  (§4.1).

## 2. Laser map: `metadata.laser.*` → `/entry/instrument/laser`

Writer: `write_nexus_laser_group()` (snapshot) and
`write_nexus_laser_shot_series()` (series) in
`api/src/damnit_api/metadata/hzdr_nexus.py`. Fields absent or `null` are
skipped entirely — never written as empty datasets.

### 2.1 `NXsource` group (`/entry/instrument/laser`)

| Source | NeXus path (under `/entry/instrument/laser`) | Canonical unit | Upstream NeXus field? |
| --- | --- | --- | --- |
| constant | `type` = `"Laser"` | — | Standard `NXsource.type` |
| constant | `probe` = `"visible light"` | — | Standard `NXsource.probe` enum value |
| `laser.system` | `name` | — (string) | Standard `NXsource.name` |
| `laser.repetition_rate` | `frequency`, `@units` | Hz | Standard `NXsource.frequency` |
| `laser.pulse_energy` | `pulse_energy`, `@units` | J | Standard `NXsource.pulse_energy` |

### 2.2 Nested `NXbeam` group (`/entry/instrument/laser/beam`)

The beam group is nested **inside** the source group — a documented deviation
from the more common sibling placement; see
[nxhzdr-target-profile.md §5](nxhzdr-target-profile.md#5-known-deviations).

| Source | NeXus path (under `.../laser/beam`) | Canonical unit | Upstream NeXus field? |
| --- | --- | --- | --- |
| `laser.pulse_energy` | `incident_energy`, `@units` | J | Standard `NXbeam.incident_energy` |
| `laser.pulse_duration` | `pulse_duration`, `@units` | fs | Standard `NXbeam.pulse_duration`; DRACO's typical value is about 30 fs, interpreted as intensity FWHM |
| `laser.wavelength` | `incident_wavelength`, `@units` | nm | Standard `NXbeam.incident_wavelength` |
| `laser.polarization` | `incident_polarization` | — (string enum, §2.4) | Standard field name (`NXbeam.incident_polarization` is formally a vector); DRACO's signed label is `p`, meaning the electric field lies in the plane of incidence |
| `laser.beam_pos_x` / `beam_pos_y` | `beam_position_x` / `beam_position_y`, `@units` | mm | **Profile extension** — no standard `NXbeam` field |
| `laser.beam_waist_x` / `beam_waist_y` | `beam_waist_x_1e2_radius` / `beam_waist_y_1e2_radius`, `@units` | um | Facility meaning is the focal-spot radius at 1/e² intensity, normally symmetric for DRACO (about 1.5–2.25 um radius from a 3–4.5 um diameter). The explicit HZDR profile fields are not interchangeable with generic `NXbeam.extent`; writer and NXDL implement them since profile v0.9. |
| `laser.contrast_ratio` | `contrast_ratio`, `@units` | — (dimensionless) | **Profile extension** — no standard `NXbeam` field |
| `laser.beam_waist_x` + `beam_waist_y` | `spot_size` = [x, y], `@units`, `@definition = "1/e^2 intensity radius"` | um | Since v0.11, beside the two v0.10 fields: one field carrying its definition, as `NXlaser_pump_probe` proposes for `NXbeam`. Only when both waists are present |
| `laser.polarization` | `polarization_label` | — (string) | Since v0.11: the same label under `NXlaser_pump_probe`'s name; `incident_polarization` keeps it too |
| `laser.contrast_ratio` + `laser.contrast_time` | `temporal_contrast` (`NXdata`, `@signal = "intensity_ratio"`, `@axes = "time"`): `intensity_ratio` = [ratio], `time` = [−contrast_time] | — / ps | Since v0.11. `laser.contrast_time` is how long before the peak the ratio was measured. Only when both keys are present; a bare ratio stays in `contrast_ratio` alone |

These meanings were signed for the Semantic Test Baseline on 2026-07-23.
DRACO commonly operates with p-polarization at oblique incidence (often about
45 degrees) for TNSA experiments. The signed NDS v0.3 profile is the implemented
transcription authority. Since profile v0.9, `write_nexus_laser_group()` and
`NXhzdr_target` use the explicit 1/e²-radius dataset names and do not emit the
old generic `extent_x`/`extent_y` aliases.

### 2.3 Per-shot series (`/entry/instrument/laser/shot_series`, `NXdata`)

Every numeric `metadata.laser.<key>` seen on **any** shot becomes a
shot-indexed dataset aligned with the canonical `/entry/shots` table, `NaN`
where a shot lacks the key, `@units` from the registry. The group carries
`signal` (`pulse_energy` when present, else the first key alphabetically),
`axes = "shot_index"`, `auxiliary_signals` for the rest, and a `shot_index`
axis dataset. String-valued keys (`system`, `polarization`) stay
campaign-level in the parent `NXsource` group.

### 2.4 Fixed laser-system constants (`damnit_source="config"`, since v0.10)

Four of the keys above describe the *laser*, not a shot: `laser.system`,
`laser.wavelength`, `laser.repetition_rate`, and `laser.polarization`. No
producer event naturally carries them, which is why
[standards-alignment.md §3.10](standards-alignment.md#310-gap-summary) routes
them through the source catalog rather than through LaserData. A deployment
states them once as `DW_API_HZDR_LASER__{SYSTEM,WAVELENGTH,REPETITION_RATE,
POLARIZATION}` (bare registry keys, registry units — nm and Hz) and the
builder passes them to `write_nexus_bridge(laser_config=…)`.

The merge rule (`_merge_laser_config()`) is:

- **A producer value always wins.** Config says what the laser *is*; an event
  value is a measurement and is never overwritten.
- **Only gaps are filled**, and each filled dataset is stamped
  `damnit_source="config"` so a campaign constant is never read as a measured
  per-shot value. The attribute is declared in the NXDL on `name`,
  `frequency`, `incident_wavelength`, and `incident_polarization`.
- **The group is written even when no shot carries a laser block at all** — a
  campaign whose producers send no laser metadata still records the system's
  fixed properties.
- **An unconfigured deployment changes nothing**: an empty block writes no
  datasets and stamps nothing.

`laser.polarization` is the registry's only string enum. The accepted labels
are `LASER_POLARIZATION_VALUES` in
`api/src/damnit_api/metadata/hzdr_event.py` — `p`, `s`, `horizontal`,
`vertical`, `linear`, `circular`, `circular_left`, `circular_right`,
`elliptical`, `unpolarized`, matched case-insensitively, with DRACO's
facility-signed value `p`. Config outside that vocabulary is rejected;
producer metadata outside it is warned about by `lint_metadata_keys()` and
still written, so the NXDL deliberately does **not** enumerate the field — a
file must not fail certification over a producer's label.

## 3. Vacuum map: `metadata.vacuum.*` → `/entry/sample/environment`

Writer: `write_nexus_vacuum_group()`. The chamber vacuum describes the sample
surroundings, so it lands under `NXsample` as an `NXenvironment` group — the
canonical placement the nexus-design-studio catalog assigns the class. The
group is a campaign-level snapshot (§1). When the sample group does not exist
yet (vacuum-only campaign), the writer stamps the `NXhzdr_target` profile
marker attributes on `/entry/sample` so the file stays certifiable.

| Source | NeXus path (under `/entry/sample/environment`) | Canonical unit | Upstream NeXus field? |
| --- | --- | --- | --- |
| constant | `description` = `"target chamber vacuum"` | — | Standard `NXenvironment.description` |
| `vacuum.chamber_pressure` | `chamber_pressure`, `@units` | mbar | **Profile extension** — pressure fields live on `NXsensor` upstream; HZDR writes the scalar directly |
| `vacuum.pre_shot_pressure` | `pre_shot_pressure`, `@units` | mbar | **Profile extension** |
| `vacuum.rga_dominant_species` | `rga_dominant_species` | — (string) | **Profile extension** |

## 4. Diagnostic map: `metadata.diagnostic.*` and data products → `NXdetector`

`NXdetector` is the nexus-design-studio ruling for the `diagnostic.*` registry
namespace; multiple `NXdetector` groups under `NXinstrument` is standard
NeXus. Two writers emit detector groups, distinguished by their
`damnit_source` marker attribute (which also protects preserved LabFrog
groups from being overwritten — a name collision with a non-DAMNIT group is
skipped with a warning, never clobbered):

### 4.1 Per-diagnostic series (`/entry/instrument/<key>`, `damnit_source="metadata.diagnostic"`)

Writer: `write_nexus_diagnostic_groups()`. One group per
`metadata.diagnostic.<key>`, each with a shot-indexed `data` dataset aligned
with `/entry/shots` (`NaN` where a numeric key is absent on a shot, `""` for
string series), a `coordinates = "/entry/shots/shot_index"` attribute, and
`@units` from the registry entry `diagnostic.<key>`.

**The `diagnostic.*` namespace is registry-governed (2026-07-18).** Registered
keys:

| Registry key | Canonical unit | Meaning |
| --- | --- | --- |
| `diagnostic.xray_counts` | counts | Integrated X-ray detector counts for the shot |
| `diagnostic.detector_signal_mean` | — (arbitrary/dimensionless) | Mean detector signal level |
| `diagnostic.alignment_score` | — (dimensionless, 0–1) | Automated alignment quality score |
| `diagnostic.tps90_proton_energy` | MeV | Proton energy from the 90° Thomson parabola |
| `diagnostic.tps90_si11_energy` | MeV | Si¹¹⁺ ion energy from the 90° Thomson parabola |
| `diagnostic.radiation_dose` | uSv | Radiation dose recorded for the shot |

A new diagnostic scalar must be added to `METADATA_KEY_REGISTRY` (and the
CLAUDE.md registry table) **before** a producer emits it. An unregistered key
is still written — the namespace stays open — but without `@units`, and
`lint_metadata_keys()` warns about it. The pre-namespace flat spellings
(`metadata.xray_counts` etc.) are folded into `metadata.diagnostic.*` by the
writer and flagged as legacy by the linter (`LEGACY_KEY_MAP`).

### 4.2 Per-product-kind references (`/entry/instrument/detector_<kind>`, `damnit_source="data_products"`)

Writer: `write_nexus_detector_groups()`. `/entry/data_products` stays the flat
transport table; per data-product `kind` a `detector_<kind>` group carries
`product_ids` / `shot_keys` / `file_paths` / `dataset_names` reference
datasets back to the rows, plus a `detector_type` attribute when the kind maps
to a known tag:

| Product kind | `detector_type` |
| --- | --- |
| `streak_camera` | `STREAK` |
| `proton_spectrometer` | `POS` |
| `thomson_parabola` | `THOMSON` |
| `frog` | `FROG` |
| `scintillator` | `SCINT` |

Generic transport kinds (`hdf5_dataset`, `file`) get no detector group — they
say how a product arrived, not what recorded it. An unknown kind still gets
its group, just without a `detector_type` claim.

## 5. Campaign time bounds (`/entry/start_time`, `/entry/end_time`)

Writer: `_write_campaign_time_bounds()` (since profile v0.6). Standard
`NXentry` fields derived from the earliest/latest parseable shot `fired_at`,
refreshed on every rebuild as the campaign grows. The datasets carry
`damnit_source="shots"`; an existing dataset **without** that marker (e.g.
written by a future LabFrog projection) is preserved, mirroring the group
claim rule in §4.

## 6. The laser pump-probe entry (`/pump_probe`, since v0.11)

Writer: `write_pump_probe_entry()`. Written only for a campaign with
`probe.delay` on some shot. It is a second `NXentry` at the file's root,
beside `/entry`, conforming to the DAPHNE4NFDI laser pump-probe schema: it
declares `NXlaser_pump_probe_hzdr_draco`, or the core `NXlaser_pump_probe`
when only an item the site definition adds is missing. When an item the core
requires is missing it is not written, and the build log says which. It is a
root entry rather than an `NXsubentry` of `/entry` because pynxtools checks a
subentry's contents against the parent's definition, which would fail every
such file. Most of it is NeXus links (with `@target`) into `/entry`.

| Schema item (under `/pump_probe`) | From |
| --- | --- |
| `title`, `start_time`, `end_time`, `experiment_identifier` | links to `/entry` (`title` written when `/entry` has none) |
| `events/identifier`, `@issuer = "HZDR DRACO shot authority"` | the shots with an authority number (`/entry/shots/authority_shot_number` ≥ 0), in `/entry/shots` order; `shot_key` on each row joins back |
| `events/time`, `status`, `amplification_state` | `fired_at`; LabFrog `shot_status`; `laser.amplification_state` (only when every numbered shot has one) |
| `events_unidentified` (`NXcollection`) | every other shot: `shot_key`, `record_id`, `fired_at`, `status`, `reason` (ruling R-2026-11-27a) |
| `instrument/source_pump`, `beam_pump` | links to the laser group and its beam (`name`, `type`, `probe`, `frequency`, `pulse_energy`, `pulse_duration`, `incident_wavelength`, `spot_size`, `temporal_contrast`, and `polarization_label` when it is one of `p`, `s`, `circular left`, `circular right`) |
| `instrument/source_probe` | `probe.source`, `probe.type`; `probe` derived from the type (`UV Laser` → `ultraviolet`, `Optical Laser`/`Laser` → `visible light`) |
| `instrument/beam_probe` | `probe.wavelength` (nm); `pulse_delay`, `pulse_delay_set` per event from `probe.delay`, `probe.delay_set` (ps, `NaN` where a shot has none) |
| `instrument/synchronization` | `sync.scheme`, `sync.delay_mechanism`; `time_zero` (ps) with `@method`, `@determined_at` only when all three keys are present |
| `sample` | links to `/entry/sample`'s `name`, `description`, `target_type` (not `type`: its HZDR classes are not the base `NXsample/type` values) |

Campaign constants (`probe.source`, `probe.type`, `probe.wavelength`,
`sync.*`) come from the first shot that has them, with one warning when a
later one differs. The decisions behind each row are in
[plans/plan-nxhzdr-target-v0.11-implementation.md](plans/plan-nxhzdr-target-v0.11-implementation.md).

## 7. Certification

`nds validate <file.nxs> --pynxtools --definitions hzdr/nxdl` certifies a
bridge file against the `NXhzdr_target` application definition declared in
`/entry/definition`. Since v0.6 that covers every group in this document; all
content fields are optional (the writer skips absent metadata), so
certification checks structure, enumerations, and the profile marker
attributes rather than presence. Since v0.11 the `/pump_probe` entry (§6) is
certified against its own definition; the definitions are in `hzdr/nxdl/`
too. pynxtools cannot check an enumeration on a per-event string array
(`events/status`), so the validation gate checks those values itself and
has pynxtools check the rest of the entry on a copy without them.

## Status

| Item | Status |
| --- | --- |
| Laser snapshot (`NXsource` + nested `NXbeam`) | ✅ implemented 2026-07-02 |
| Per-shot laser series (`shot_series` `NXdata`) | ✅ implemented |
| Vacuum snapshot (`NXenvironment` under sample) | ✅ implemented |
| Per-diagnostic `NXdetector` series | ✅ implemented |
| Per-product-kind `NXdetector` reference groups | ✅ implemented |
| `diagnostic.*` registry governance (keys + linter warning) | ✅ 2026-07-18 |
| `start_time` / `end_time` entry fields | ✅ 2026-07-18 (profile v0.6) |
| NXDL coverage of all groups above | ✅ 2026-07-18 (profile v0.6) |
| Schema conventions (`spot_size`, `polarization_label`, `temporal_contrast`, `target_type`) and the `/pump_probe` entry | ✅ 2026-11-27 (profile v0.11) |
| Semantic map doc for these namespaces | ✅ this doc (2026-07-18) |

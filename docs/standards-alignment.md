# Standards Alignment: DAPHNE4NFDI, HELPMI, NeXus, SciCat

Updated: 2026-06-26

How the HZDR/DAMNIT schema relates to broader photon/neutron/laser-plasma data
standards (DAPHNE4NFDI, HELPMI, NeXus, SciCat, Plasma-MDS, openPMD), a detailed
field-level cross-walk, a gap analysis, and which alignment routes are realistic.

Related docs: [event schema](event-schema.md) (the transport envelope these standards
map onto) and [alignment implementation plan](alignment-implementation-plan.md) (the
phased *how/when* for the routes in §4).

---

## 1. DAPHNE4NFDI

**DAPHNE4NFDI** (DAta from PHoton and Neutron Experiments for NFDI) is a DFG-funded
German national research data infrastructure consortium that brings together users and
large-scale research facilities (synchrotrons, free-electron lasers, neutron sources)
to implement FAIR data principles for photon and neutron experiment data. Its outputs
include metadata recommendations for beamtime proposals, sample descriptions,
instrument configurations, and measurement results, as well as tooling around SciCat,
NeXus, and PaNOSC.

Relevant DAPHNE4NFDI outputs for HZDR:
- Metadata recommendations built on PaNOSC/ExPaNDS output (proposal, beamtime,
  instrument, sample, technique, dataset).
- Advocacy for SciCat as the community metadata catalog, used by many Helmholtz
  facilities.
- NeXus Ontology (`nexusformat/NeXusOntology`) as a controlled vocabulary for
  NeXus field names, enabling federated search over heterogeneous NeXus files.

## 2. HELPMI

**HELPMI** (HElmholtz Laser-Plasma Metadata Initiative) is a 2-year Helmholtz
Metadata Collaboration project, led by **HZDR**, with GSI and HI-Jena as partners.
It addresses the specific gap that **no data standard exists for ultra-high intensity
laser-plasma experiments** (where DRACO and PHELIX operate). Its outputs include:

- **Devices-Detectors-Components Library (DDC):** A structured glossary of every
  component that appears in a laser-plasma laboratory and should be representable in
  a metadata system. Categories: Streak Camera, Proton/Ion Spectrometer, FROG,
  Scintillator Screen, environmental sensors, shutters, filters, optics, Foil Target,
  Particle Beam Probe. Each category has a `LaserClasses`, `DetectorClasses`,
  `DataClasses`, or `TargetClasses` document with field definitions.
- **NeXus definitions fork** (`NeXus-for-HELPMI/definitions`): Extended NeXus base
  classes for laser-plasma experiments, targeting `NXlaser`, `NXtarget`, and
  detector-specific classes.
- **openPMD extension:** The openPMD standard (currently used for laser-plasma
  simulation data) has been extended to support arbitrary NeXus-like hierarchies,
  making the two standards interoperable.
- **POLARIS and PHELIX example files:** Real NeXus data files from GSI's PHELIX Shot
  Database and the POLARIS laser, demonstrating what compliant files look like.

HELPMI is the closest existing initiative to what HZDR's DRACO experiment data needs.
HZDR leads the project, so alignment is not just desirable — it is the right path.

## 3. Detailed field-level alignment mapping

The following subsections give a concrete, field-by-field cross-walk between the current
HZDR/DAMNIT schema, the HELPMI DDC Library, standard NeXus base classes, Plasma-MDS, and
SciCat. The goal is to know exactly which fields are already present, which have the wrong
name or units, and which are simply missing.

### 3.1 Experiment / campaign level

| Standard field | DAPHNE4NFDI / HELPMI term | Current HZDR location | Recommended `metadata` key | Notes |
| --- | --- | --- | --- | --- |
| Proposal / beamtime ID | `proposalId` (SciCat), `Experiment_identifier` (NeXus) | `HZDRSource.metadata["experiment_id"]` | — (root field, already structured) | Derived from MediaWiki page title in LabFrog; already the canonical campaign ID |
| Campaign title | `title` | `HZDRSource.title` | — | Human-readable; already present |
| Primary investigator | `principalInvestigator` (SciCat) | not captured | `metadata.run.pi` | Stored in LabFrog; could be exported to sources catalog |
| Facility | `facility` | `HZDRSource.metadata["facility"]` | `metadata.run.facility` | Currently `"HZDR"` string; could add beamline sub-field |
| Beamline / instrument | `instrumentId` (SciCat), `NXinstrument.name` | not captured | `metadata.run.beamline` | e.g. `"DRACO"`, `"ELBE"` |
| Campaign start / end | — | derivable from `HZDRShot.fired_at` range | `metadata.run.start_utc`, `metadata.run.end_utc` | Not stored at source level; would need builder pass |
| Wiki / logbook link | — | `GET /metadata/hzdr/sources/{key}/wiki` | — | See [MediaWiki integration](mediawiki-integration.md) |
| Number of shots | — | `len(HZDRSource.shots)` | — | Derivable; not yet stored as metadata |

### 3.2 Shot / measurement level

| Standard field | DAPHNE4NFDI / HELPMI term | Current HZDR location | Notes |
| --- | --- | --- | --- |
| Shot number | shot_number | `HZDRShot.shot_number` | TANGO-authoritative; nullable; cross-system unique with `experiment_id` |
| Timestamp | `start_time` (NeXus `NXentry`) | `HZDRShot.fired_at` (UTC ISO-8601) | Present; same format as NeXus requirement |
| Shot key | — | `HZDRShot.shot_key` (`exp_id:YYYYMMDD:NNNNNN`) | HZDR-specific stable ID; more useful than numeric index alone |
| Match status | — | `HZDRShot.match_status` | `matched`, `labfrog-only`, `unmatched`; no DAPHNE4NFDI equivalent |
| Source events | — | `HZDRShot.events` → `HZDRSourceEvent` | Per-event `payload_ref` provides Kafka/ASAPO traceability |
| Data products | — | `HZDRShot.data_products` → `HZDRDataProduct` | Path, dataset name, preview kind, dtype, shape, units |
| NeXus dataset path | `HDF5_path` | `HZDRShot.hdf5_path` | Path to the shot group in the campaign NeXus file |
| Operator | — | `shot.metadata["operator"]` (emulator) | Emulator only; could come from LabFrog session |

### 3.3 Laser parameters

The emulator currently uses flat `shot.metadata` keys with units embedded in the name
(`laser_energy_j`, `pulse_width_fs`). The recommended HELPMI-aligned keys use a
`metadata.laser.*` namespace. All three columns must converge before HELPMI conformance
can be claimed.

| HELPMI DDC term | HELPMI LaserClasses field | Current emulator key | Recommended key | Unit | NeXus equivalent | Gap / note |
| --- | --- | --- | --- | --- | --- | --- |
| Pulse energy | `pulse_energy` | `laser_energy_j` | `metadata.laser.pulse_energy_j` | J | `NXsource.pulse_energy` / `NXbeam.incident_energy` | Unit encoding differs: NeXus uses `NX_ENERGY` with separate `@units` attribute |
| Pulse duration | `pulse_duration` | `pulse_width_fs` | `metadata.laser.pulse_duration_fs` | fs | `NXbeam.pulse_duration` (`NX_TIME`) | NeXus expects SI seconds; write value in fs, set `@units="fs"` |
| Central wavelength | `central_wavelength` | — | `metadata.laser.wavelength_nm` | nm | `NXbeam.incident_wavelength` (`NX_WAVELENGTH`) | **Missing** — not in emulator or any current producer |
| Repetition rate | `repetition_rate` | — | `metadata.laser.repetition_rate_hz` | Hz | `NXsource.frequency` | **Missing** — DRACO typically single-shot; HELPMI still requires it |
| Beam position X / Y | `beam_position_x`, `beam_position_y` | `beam_position_x_mm`, `beam_position_y_mm` | `metadata.laser.beam_pos_x_mm`, `metadata.laser.beam_pos_y_mm` | mm | `NXbeam.incident_beam_divergence` (partial) | Names OK; recommend de-duplicating `_mm` suffix to `@units="mm"` attribute |
| Beam waist / size | `beam_waist_x`, `beam_waist_y` | — | `metadata.laser.beam_waist_x_um`, `metadata.laser.beam_waist_y_um` | µm | `NXbeam.extent` | **Missing** — beam size at focus not captured |
| Polarization | `polarization` | — | `metadata.laser.polarization` | string enum | `NXbeam.incident_polarization` | **Missing** — `horizontal`, `vertical`, `circular`, `random` |
| Pulse contrast | `pulse_contrast` | — | `metadata.laser.contrast_ratio` | dimensionless | — | **Missing** — critical for laser-plasma experiments; not in standard NeXus |
| Peak intensity | `peak_intensity` | — | `metadata.laser.peak_intensity_wcm2` | W/cm² | — | **Missing** — derivable from energy, duration, waist but not stored |
| Laser system | `laser_system` | `source` field (`"LaserData"`) | `metadata.laser.system` | string | `NXsource.name` | `source` is producer label, not laser name; add `"DRACO"`, `"DRACO II"` |

### 3.4 Target / sample

HELPMI `TargetClasses` covers solid foil, gas jet, cluster, and liquid targets. DAMNIT
currently has only the free-form emulator `target` string.

> **The binding target schema lives in [target-ontology.md](target-ontology.md).** It
> supersedes the *Recommended key* and *Unit* columns below: stored keys are **bare**
> (`thickness`, not `thickness_nm`) with the unit applied as a NeXus `@units` attribute,
> and the schema adds `name`, `notes`, `provenance` (`wiki`/`manual`), `wiki_ref`, and an
> open `properties` bag. The cross-walk below is retained for the HELPMI field mapping.

| HELPMI TargetClasses field | Current emulator key | Recommended key | Unit | NeXus equivalent | Gap / note |
| --- | --- | --- | --- | --- | --- |
| Target type | `target` (free-form) | `metadata.target.type` | string enum | `NXsample.type` | Types: `foil`, `gas_jet`, `cluster`, `liquid`, `structured` |
| Material | — | `metadata.target.material` | string | `NXsample.chemical_formula` | **Missing** — e.g. `"Au"`, `"CH2"`, `"mylar"` |
| Thickness | — | `metadata.target.thickness_nm` | nm | `NXsample.thickness` | **Missing** — characteristic number for solid foils |
| Diameter | — | `metadata.target.diameter_mm` | mm | — | **Missing** |
| Substrate material | — | `metadata.target.substrate_material` | string | `NXsample.substrate_material` | **Missing** — relevant for structured targets |
| Sample temperature | `sample_temperature_c` | `metadata.target.temperature_c` | °C | `NXsample.temperature` | Present in emulator; rename for clarity |
| Gas species (gas jet) | — | `metadata.target.gas_species` | string | — | **Missing** — `"Ar"`, `"N2"`, `"He"` |
| Gas pressure (gas jet) | — | `metadata.target.gas_pressure_bar` | bar | `NXsample.gas_pressure` | **Missing** |

### 3.5 Environment / vacuum

HELPMI groups environmental sensors under a `Devices` vocabulary that includes pressure,
temperature, and humidity sensors. There is a direct NeXus mapping.

| HELPMI Devices term | Current emulator key | Recommended key | Unit | NeXus equivalent | Gap / note |
| --- | --- | --- | --- | --- | --- |
| Chamber pressure | `chamber_pressure_mbar` | `metadata.vacuum.chamber_pressure_mbar` | mbar | `NXenvironment.pressure` | Rename namespace; unit convention is fine |
| Pre-shot vacuum level | — | `metadata.vacuum.pre_shot_pressure_mbar` | mbar | — | **Missing** — pressure immediately before shot |
| Residual gas analyser reading | — | `metadata.vacuum.rga_dominant_species` | string | — | **Missing** — optional but useful for foil pre-ablation |

### 3.6 Diagnostics and detectors

Data products from diagnostics (detector images, spectra, particle counts) arrive as
`HZDRDataProduct` records. The mapping to HELPMI `DetectorClasses` and NeXus `NXdetector`
is currently structural (path + dataset name) rather than semantic.

| HELPMI DetectorClasses | Current location | NeXus class | Recommended path | Gap / note |
| --- | --- | --- | --- | --- |
| X-ray / particle count | `shot.metadata["xray_counts"]` (emulator scalar) | `NXdetector.data` | `metadata.diagnostic.xray_counts` | Emulator scalar only; real diagnostics deliver arrays |
| Streak camera image | `HZDRDataProduct` with `kind="streak_camera"` | `NXdetector` with `detector_type="STREAK"` | `/entry/data_products/{id}/values` | File path captured; `NXdetector.detector_type` attribute missing |
| Proton/ion spectrum | `HZDRDataProduct` with `kind="proton_spectrometer"` | `NXdetector` with `type="POS"` | `/entry/data_products/{id}/values` | File path captured; energy axis not structured |
| Thomson parabola | — | `NXdetector` with `type="THOMSON"` | — | **Missing** — important DRACO diagnostic |
| FROG trace | — | `NXdetector` with `detector_type="FROG"` | — | **Missing** |
| Scintillator screen | `HZDRDataProduct.source` | `NXdetector.detector_type="SCINT"` | — | Kind known; no structured detector geometry |
| Alignment score | `shot.metadata["detector_signal_mean"]` | — | `metadata.diagnostic.detector_signal_mean` | Generic; useful for quick go/no-go QA |
| Detector integration time | — | `NXdetector.count_time` | — | **Missing** in all real and emulated data |

### 3.7 NeXus bridge group class mapping

The canonical NeXus file written by `hzdr_nexus.py` currently uses `NX_class=NXcollection`
for most bridge groups. The table below shows the correct target classes once HELPMI
definitions are finalized, and the effort to migrate.

| Current path | Current `NX_class` | Target class (HELPMI/NeXus) | Migration note |
| --- | --- | --- | --- |
| `/entry` | `NXentry` | `NXentry` | Correct; set `entry/start_time` from first shot |
| `/entry/shots` | `NXcollection` | `NXcollection` | DAMNIT-internal shot table; custom class intentional |
| `/entry/source_events` | `NXcollection` | `NXcollection` | DAMNIT-internal event table; no standard equivalent |
| `/entry/data_products` | `NXcollection` | `NXcollection` + per-product `NXdetector` | Add `NXdetector` sub-group per product kind; needs HELPMI class map |
| `/entry/laserdata` | `NXcollection` | `NXbeam` or `NXsource` | LaserData time-series → `NXbeam` per shot; system properties → `NXsource` |
| `/entry/watchdog` | `NXcollection` | `NXcollection` (keep custom) | File-arrival log; no standard class; keep as-is |
| — | — | `/entry/instrument/laser` → `NXsource` | **Missing group** — add with `type="Laser"`, `probe="optical laser"`, `name` |
| — | — | `/entry/sample` → `NXsample` | **Missing group** — add with `name`, `chemical_formula`, `thickness` |

### 3.8 Plasma-MDS cross-walk

The Plasma-MDS schema (developed for low-temperature plasma, but with laser-plasma
applicability) organises metadata into five top-level objects. Mapping is approximate —
Plasma-MDS targets plasma reactors more than high-power laser shots, but the structure
is instructive.

| Plasma-MDS object | Key fields | DAMNIT equivalent | Fit / gap |
| --- | --- | --- | --- |
| `plasma.source` | `name`, `specification.waveform`, `specification.frequency`, `specification.power` | `HZDREventV1.metadata.laser.*` | Good conceptual fit; field names differ. `waveform` → pulse shape (not yet captured) |
| `plasma.medium` | `name`, `state`, `composition` | `HZDRShot.metadata.target.*` (proposed) | Gas targets map well; solid foil targets are a mismatch (medium ≠ target) |
| `plasma.target` | `material`, `geometry` | `metadata.target.material`, `metadata.target.thickness_nm` (proposed) | Plasma-MDS `target` is optional (reactor has no foil); laser-plasma needs it mandatory |
| `plasma.diagnostics` | per-diagnostic objects with `technique`, `parameters` | `HZDRDataProduct.source`, `.kind`, `.dataset_path` | `technique` maps to `kind`; `parameters` (wavelength range, energy range) not yet stored |
| `plasma.resources` | `data_path`, `software`, `format` | `HZDRDataProduct.path`, `.dtype`, `.shape_json` | `software` (which analysis code produced the product) not yet captured |

### 3.9 SciCat field mapping

`HZDRPayloadRef.scicat_pid` is reserved for back-population once a campaign file is
registered. The mapping below shows which SciCat `RawDataset` fields could be populated
from existing DAMNIT data without new producers.

| SciCat `RawDataset` field | Source in DAMNIT | Notes |
| --- | --- | --- |
| `proposalId` | `HZDRSource.metadata["experiment_id"]` | Direct 1:1 — the campaign ID is already proposal-scoped |
| `sampleId` | `metadata.target.material` (proposed key) | Not currently structured; would need target metadata capture |
| `instrumentId` | `metadata.run.beamline` (proposed) or `"DRACO"` hard-coded | Could be sourced from LabFrog if beamline field is exposed |
| `scientificMetadata` | entire `HZDRShot.metadata` dict | Already a free-form JSON dict; SciCat accepts it as-is |
| `dataFormat` | `"NeXus/HDF5"` | Constant; no source needed |
| `ownerGroup` | to be configured per deployment | HZDR Active Directory group; not in transport schema |
| `accessGroups` | to be configured per deployment | Per-campaign access control; not in transport schema |
| `size` | derivable from NeXus file size on disk | Not yet tracked in catalog |
| `numberOfFiles` | `len(HZDRSource.shots)` + 1 (NeXus file) | Derivable |
| `principalInvestigator` | `metadata.run.pi` (proposed) | Not yet captured; comes from LabFrog session |
| `sourceFolderHost` | HZDR data server hostname | Deployment-level config; not in transport schema |
| `sourceFolder` | `HZDRSource.damnit_path` | Already in sources catalog |

### 3.10 Gap summary

Fields that appear in HELPMI DDC or DAPHNE4NFDI recommendations and are **not** currently
captured anywhere in DAMNIT (transport envelope, emulator metadata, or NeXus output).
Many of the laser/environment/diagnostic rows below are produced by TANGO devices in the
control system; a future TANGO device self-archiving path could carry them in per-device
archived files, keyed to the shot context the archiver broadcasts — see
[integration-roadmap.md](integration-roadmap.md#future-tango-device-self-archiving-as-a-metadata-source):

| Missing field | Standard | Category | Effort to add |
| --- | --- | --- | --- |
| Central wavelength (`wavelength_nm`) | HELPMI LaserClasses, NeXus `NXbeam` | Laser | Low — LaserData producer knows this; add to `metadata.laser` |
| Repetition rate | HELPMI LaserClasses, NeXus `NXsource.frequency` | Laser | Low — fixed per system; add to source catalog |
| Beam waist / focus spot size | HELPMI LaserClasses | Laser | Medium — measured per campaign; add to LabFrog export |
| Polarization | HELPMI LaserClasses, NeXus `NXbeam` | Laser | Low — usually fixed; add to source catalog |
| Pulse contrast | HELPMI LaserClasses | Laser | Medium — measured separately; add to LaserData producer |
| Target material | HELPMI TargetClasses, NeXus `NXsample` | Target | Medium — in LabFrog shot record; needs LabFrog export |
| Target thickness | HELPMI TargetClasses | Target | Medium — same as material |
| Gas species / pressure | HELPMI TargetClasses | Target | Medium — gas jet shots only |
| Pre-shot vacuum pressure | HELPMI Devices | Environment | Low — sensors are present; add to LaserData or shotcounter |
| `/entry/instrument/laser` NeXus group | NeXus `NXsource` | NeXus structure | Low effort in `hzdr_nexus.py`; fields mostly known |
| `/entry/sample` NeXus group | NeXus `NXsample` | NeXus structure | Medium — needs target metadata |
| Per-product `NXdetector` sub-group | NeXus `NXdetector`, HELPMI DetectorClasses | NeXus structure | Medium — product kind already in catalog |
| Thomson parabola / FROG product kind | HELPMI DetectorClasses | Diagnostics | Low — add to `kind` enum; no new data |
| Detector integration time | NeXus `NXdetector.count_time` | Diagnostics | High — requires per-detector producer changes |
| `plasma.resources.software` | Plasma-MDS | Provenance | Low — add analysis tool name to `HZDRDataProduct.metadata` |
| `principalInvestigator` | SciCat, DAPHNE4NFDI | Experiment | Low — in LabFrog; add to sources catalog export |
| `instrumentId` / beamline | SciCat, DAPHNE4NFDI | Experiment | Low — hard-code `"DRACO"` per deployment |

## 4. Potential alignment routes

These are ordered from lowest to highest effort. None block the pilot or the go-live
gate — they are post-pilot quality improvements.

### Route 1: Structured `metadata` keys with HELPMI glossary terms (low effort)

The simplest alignment: document which `metadata` keys in `HZDRShot.metadata` and
`HZDREventV1.metadata` correspond to HELPMI DDC terms, and enforce consistent naming
in producers. Example:

```
metadata.laser.energy_j        → HELPMI LaserClasses: pulse_energy
metadata.laser.pulse_width_fs  → HELPMI LaserClasses: pulse_duration
metadata.target.material       → HELPMI TargetClasses: material
metadata.vacuum.pressure_mbar  → HELPMI Devices: vacuum_sensor.pressure
```

This is purely a documentation + convention change; no schema bump needed. The `hzdr_nexus.py`
builder can already write these as HDF5 attributes from the `metadata` JSON.

### Route 2: `NXlaser` and `NXtarget` groups in the NeXus bridge (medium effort)

The HELPMI `NeXus-for-HELPMI/definitions` fork extends NeXus with laser-plasma specific
base classes. Adding `/entry/laser` (`NXlaser`) and `/entry/target` (`NXtarget`) groups
to the NeXus bridge in `hzdr_nexus.py` would make the canonical NeXus file directly
readable by HELPMI-aware tools. This requires:

1. Choosing which producer events carry the relevant fields (LaserData, shotcounter).
2. Adding a `write_nexus_laser_group()` call in `write_nexus_bridge()`.
3. No change to the transport envelope; the data is already in `metadata`/`values`.

### Route 3: SciCat registration (lower effort — existing plugin)

`HZDRPayloadRef.scicat_pid` is already in the schema. HZDR already maintains a
**SciCat plugin** for dataset registration
(`codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/scicat_plugin`),
so this is not a from-scratch adapter: the builder calls the existing plugin to register
each campaign NeXus file as a SciCat Dataset, then back-populates `scicat_pid` in the
catalog so the DAMNIT API can surface direct SciCat links alongside the wiki link. No
transport schema change needed; `payload_ref.scicat_pid` is already reserved for this
purpose. The remaining work is the field mapping (§3.9) and wiring DAMNIT's builder to
the plugin, not the SciCat client itself.

### Route 4: NeXus Ontology annotation for federated search (higher effort)

The `nexusformat/NeXusOntology` (OWL, maintained by the FAIRmat and ExPaNDS projects)
provides machine-readable URIs for NeXus field names. Annotating the canonical NeXus
file's attributes with ontology URIs (`@type`, `@vocab` in JSON-LD terms, or HDF5
attributes pointing at the OWL term) would make the file discoverable in federated
ontology searches (e.g. the PaN portal). This is the highest-effort option and is
currently aspirational — HELPMI is still developing the laser-plasma-specific extensions.

### Route 5: openPMD interoperability (for simulation comparisons)

HELPMI has extended openPMD to accept NeXus-like arbitrary hierarchies. For HZDR's
DRACO experiments, this would enable linking the experimental NeXus file to PIC
simulation output in openPMD format, making comparison plots in the same analysis
pipeline straightforward. The transport envelope is unchanged; this is a NeXus
writer and analysis tooling concern.

---

## 5. Status

| Item | Status | Section |
| --- | --- | --- |
| Detailed HELPMI / DAPHNE4NFDI / SciCat / Plasma-MDS alignment mapping | ✅ committed | §3 |
| Gap analysis: 16 missing fields with effort estimates | ✅ committed | §3.10 |
| Rename `metadata` keys to HELPMI-aligned namespace (`metadata.laser.*` etc.) | ⬜ post-pilot | §3.3, Route 1 |
| Add `metadata.laser.wavelength_nm`, `polarization`, `repetition_rate_hz` | ⬜ low effort | §3.3, §3.10 |
| Add `metadata.target.*` fields from LabFrog shot record | ⬜ medium effort | §3.4, §3.10 |
| Add `/entry/instrument/laser` (`NXsource`) to NeXus bridge | ⬜ low effort | §3.7, Route 2 |
| Add `/entry/sample` (`NXsample`) to NeXus bridge | ⬜ medium effort | §3.7, Route 2 |
| Per-product `NXdetector` sub-groups in NeXus bridge | ⬜ medium effort | §3.6, §3.7 |
| `NXlaser` / `NXtarget` groups (HELPMI NeXus fork) | ⬜ post-pilot | Route 2 |
| SciCat registration + `scicat_pid` back-population (via existing HZDR SciCat plugin) | ⬜ wire up plugin | Route 3 |
| NeXus Ontology annotation for federated search | ⬜ aspirational | Route 4 |
| openPMD interoperability (simulation links) | ⬜ aspirational | Route 5 |

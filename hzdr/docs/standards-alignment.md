# Standards Alignment: DAPHNE4NFDI, HELPMI, NeXus, SciCat

Updated: 2026-07-27

How the HZDR/DAMNIT schema relates to broader photon/neutron/laser-plasma data
standards (DAPHNE4NFDI, HELPMI, NeXus, SciCat, Plasma-MDS, openPMD), a detailed
field-level cross-walk, a gap analysis, and which alignment routes are realistic.

Related docs: [event schema](event-schema.md) (the transport envelope these standards
map onto) and [alignment implementation plan](plans/alignment-implementation-plan.md) (the
phased *how/when* for the routes in §4).

---

## Source basis

This whitepaper now separates source-backed standards claims from local HZDR
profile decisions. The current source set is:

| Source | Why it matters here |
| --- | --- |
| [NeXus NXDL](https://manual.nexusformat.org/nxdl.html) | Defines the rule/validation model for NeXus terms, units, fields, groups, attributes, and extension boundaries. |
| [NeXus `NXsample`](https://manual.nexusformat.org/classes/base_classes/NXsample.html) | Provides the compatibility base for `/entry/sample`: `name`, `chemical_formula`, `temperature`, `description`, `type`, `thickness`, `physical_form`, environment, and incident-beam hooks. |
| [NeXus `NXsource`](https://manual.nexusformat.org/classes/base_classes/NXsource.html) and [`NXbeam`](https://manual.nexusformat.org/classes/base_classes/NXbeam.html) | Provide the standard laser/source and beam vocabulary used next to, but outside, the target profile. |
| [NeXus class indexes](https://manual.nexusformat.org/classes/base_classes/index.html) | The v2026.01 official class lists document `NXsample`; they do not document an official `NXtarget`, so HZDR uses a prefixed local profile name. |
| [NeXus Ontology](https://github.com/nexusformat/NeXusOntology) | Provides machine-readable identifiers for existing NeXus classes/fields and is the right later target for URI annotation. |
| [DAPHNE4NFDI](https://www.daphne4nfdi.de/) | Supplies the photon/neutron large-facility RDM context: linked metadata capture, catalogues, and reuse workflows. |
| [SciCat](https://www.scicatproject.org/) | Supplies the scientific metadata catalogue target for campaign-file registration and discoverability. |
| [FAIR principles](https://www.nature.com/articles/sdata201618) | Justifies machine-actionable metadata and stable provenance as design goals. |
| [Plasma-MDS](https://www.nature.com/articles/s41597-020-00771-0) | Provides an adjacent plasma-science metadata pattern: source, medium/target, diagnostics, and resources. |

The detailed `NXhzdr_target` design derivation lives in
[nxhzdr-target-profile.md §1.1](nxhzdr-target-profile.md#11-literature-and-standards-basis).

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
- **NeXus definitions fork** (`NeXus-for-HELPMI/definitions`): HELPMI explored
  extended NeXus base classes for laser-plasma experiments, including `NXlaser`,
  `NXtarget`, and detector-specific classes. HELPMI is now finished; HZDR should
  not wait for those classes and should define any missing local profile itself.
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
| Shot number | shot_number | `HZDRShot.shot_number` | Issued by the shot authority (planet-watchdog); nullable; cross-system unique with `experiment_id` |
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
| Pulse duration | `pulse_duration` | `pulse_width_fs` | `metadata.laser.pulse_duration_fs` | fs | `NXbeam.pulse_duration` (`NX_TIME`) | Signed DRACO meaning is intensity FWHM; a typical pulse is about 30 fs. Write the value in fs and set `@units="fs"`. |
| Central wavelength | `central_wavelength` | `wavelength` (emulators) | `metadata.laser.wavelength_nm` | nm | `NXbeam.incident_wavelength` (`NX_WAVELENGTH`) | ✅ captured 2026-07-27 — emulators emit it and `DW_API_HZDR_LASER__WAVELENGTH` fills it when a producer does not (§3.3.1); real LaserData capture still open |
| Repetition rate | `repetition_rate` | `repetition_rate` (emulators) | `metadata.laser.repetition_rate_hz` | Hz | `NXsource.frequency` | ✅ captured 2026-07-27 via `DW_API_HZDR_LASER__REPETITION_RATE` (§3.3.1); DRACO typically single-shot, but HELPMI requires the field |
| Beam position X / Y | `beam_position_x`, `beam_position_y` | `beam_position_x_mm`, `beam_position_y_mm` | `metadata.laser.beam_pos_x_mm`, `metadata.laser.beam_pos_y_mm` | mm | `NXbeam.incident_beam_divergence` (partial) | Names OK; recommend de-duplicating `_mm` suffix to `@units="mm"` attribute |
| Beam waist / size | `beam_waist_x`, `beam_waist_y` | — | `metadata.laser.beam_waist_x_um`, `metadata.laser.beam_waist_y_um` | µm | HZDR explicit profile extension | Signed meaning is focal-spot radius at 1/e² intensity, normally symmetric for DRACO: about 1.5–2.25 µm radius (3–4.5 µm diameter). Writer and NXDL profile v0.9 use explicit `beam_waist_*_1e2_radius` paths rather than generic `extent_x`/`extent_y`. |
| Polarization | `polarization` | `polarization` (emulators) | `metadata.laser.polarization` | string enum | `NXbeam.incident_polarization` | ✅ captured 2026-07-27 via `DW_API_HZDR_LASER__POLARIZATION` (§3.3.1); the enum is written down as `LASER_POLARIZATION_VALUES`. Signed DRACO value is `p`: electric field in the plane of incidence, commonly at oblique incidence around 45 degrees for TNSA. |
| Pulse contrast | `pulse_contrast` | — | `metadata.laser.contrast_ratio` | dimensionless | — | **Missing** — critical for laser-plasma experiments; not in standard NeXus |
| Peak intensity | `peak_intensity` | — | `metadata.laser.peak_intensity_wcm2` | W/cm² | — | **Missing** — derivable from energy, duration, waist but not stored |
| Laser system | `laser_system` | `source` field (`"LaserData"`) | `metadata.laser.system` | string | `NXsource.name` | `source` is producer label, not laser name; set `DW_API_HZDR_LASER__SYSTEM` to `"DRACO"` / `"DRACO II"` per deployment (§3.3.1) |

#### 3.3.1 Fixed laser-system constants

Four of the rows above — central wavelength, repetition rate, polarization,
and the laser system name — describe the *laser*, not the shot, so no producer
event naturally carries them. Since **2026-07-27** a deployment states them
once as `DW_API_HZDR_LASER__{SYSTEM,WAVELENGTH,REPETITION_RATE,POLARIZATION}`
(bare registry keys, registry units) and the builder fills them into
`/entry/instrument/laser`. This is the "add to source catalog" route of the
§3.10 gap summary, implemented DAMNIT-side so it does not wait on the producer
repos.

A producer value always wins over the configured one; only gaps are filled,
and every filled dataset carries `damnit_source="config"` so a campaign
constant is never read as a measured value (NXhzdr_target profile v0.10,
[nexus-semantic-maps.md §2.4](nexus-semantic-maps.md#24-fixed-laser-system-constants-damnit_sourceconfig-since-v010)).
Both emulators emit the three shot-carried keys as a real LaserData producer
would, so the local end-to-end path is populated without any configuration.
The remaining open item is the real LaserData/shotcounter producers
([alignment plan Phase 1](plans/alignment-implementation-plan.md#phase-1--namespaced-laser-metadata--low-effort-missing-fields-),
step 2).

> **Decided 2026-07-02:** stored keys are bare (see
> [target-ontology.md §5](target-ontology.md#5-units-convention)); the suffixed
> names in this table (`pulse_energy_j`, `pulse_duration_fs`, `wavelength_nm`,
> `repetition_rate_hz`, `beam_pos_x_mm`/`beam_pos_y_mm`,
> `beam_waist_x_um`/`beam_waist_y_um`) are the HELPMI cross-walk labels only.
> Canonical units live in the metadata key registry; SQLite carries them in
> the `units` table.
>
> **Facility sign-off 2026-07-23:** the pulse-duration, polarization, and
> beam-waist meanings above are approved for the Semantic Test Baseline.
> This is semantic approval, not proof that LaserData emits the fields. DAMNIT
> writer/NXDL profile v0.9 implements the explicit waist-radius paths.
> LaserData remains a future, non-blocking boundary for the test tier.

### 3.4 Target / sample

HELPMI `TargetClasses` covers solid foil, gas jet, cluster, and liquid targets. LabFrog
now captures structured manual target type plus gas species and backing pressure; DAMNIT
normalizes the portable SQLite columns into the binding target schema.

> **The binding target schema lives in [target-ontology.md](target-ontology.md).** It
> supersedes the *Recommended key* and *Unit* columns below: stored keys are **bare**
> (`thickness`, not `thickness_nm`) with the unit applied as a NeXus `@units` attribute,
> and the schema adds `name`, `notes`, `provenance` (`wiki`/`manual`), `wiki_ref`, and an
> open `properties` bag. The cross-walk below is retained for the HELPMI field mapping.

| HELPMI TargetClasses field | Current emulator key | Recommended key | Unit | NeXus equivalent | Gap / note |
| --- | --- | --- | --- | --- | --- |
| Target type | LabFrog manual/selectable target | `metadata.target.type` | string enum | `NXsample.type` (field name; HZDR enum values) | Types: `foil`, `gas_jet`, `cluster`, `liquid`, `structured`, `other`; manual gas-jet/cluster capture added 2026-07-19; written to `/entry/sample/type` since profile v0.5 |
| Material | LabFrog `OTHER` target export | `metadata.target.material` | string | `NXsample.material` (profile ext.); `chemical_formula` derived only when the value parses as a formula (profile v0.4) | Present for captured manual target records; wiki-selected curated material still needs per-shot enrichment |
| Thickness | LabFrog `OTHER` target export | `metadata.target.thickness` | nm | `NXsample.thickness` | Present for captured manual target records; DAMNIT converts known export units to canonical nm |
| Diameter | — | `metadata.target.diameter_mm` | mm | — | **Missing** |
| Substrate material | — | `metadata.target.substrate_material` | string | `NXsample.substrate_material` | **Missing** — relevant for structured targets |
| Sample temperature | `sample_temperature_c` | `metadata.target.temperature` | °C | `NXsample.temperature` | Present in emulator; bare-key namespace adopted |
| Gas species (gas jet) | LabFrog `target.gas_species` | `metadata.target.gas_species` | string | `/entry/sample` `gas_species` attribute | Captured and mapped end to end since 2026-07-19 |
| Gas pressure (gas jet) | LabFrog `target.gas_pressure` | `metadata.target.gas_pressure` | bar | `/entry/sample/gas_pressure` | SQLite schema v11 normalizes accepted source units to bar; mapped end to end since 2026-07-19 |

### 3.5 Environment / vacuum

HELPMI groups environmental sensors under a `Devices` vocabulary that includes pressure,
temperature, and humidity sensors. There is a direct NeXus mapping.

| HELPMI Devices term | Current emulator key | Registry key | Unit | NeXus equivalent | Gap / note |
| --- | --- | --- | --- | --- | --- |
| Chamber pressure | `chamber_pressure` (namespaced) | `metadata.vacuum.chamber_pressure` | mbar | `/entry/sample/environment/chamber_pressure` (`NXenvironment`) | Written to the canonical NeXus file since 2026-07-17 when a shot carries it (emulator does) |
| Pre-shot vacuum level | — | `metadata.vacuum.pre_shot_pressure` | mbar | `/entry/sample/environment/pre_shot_pressure` | Writer path done 2026-07-17; **no producer captures it yet** |
| Residual gas analyser reading | — | `metadata.vacuum.rga_dominant_species` | string | `/entry/sample/environment/rga_dominant_species` | Writer path done 2026-07-17; **no producer captures it yet** — optional but useful for foil pre-ablation |

> **Decided 2026-07-02:** stored keys are bare (see
> [target-ontology.md §5](target-ontology.md#5-units-convention)). Canonical
> units live in the metadata key registry; SQLite carries them in the `units`
> table. **Since 2026-07-17** `write_nexus_vacuum_group()` maps available
> `metadata.vacuum.*` keys to `/entry/sample/environment` (`NXenvironment`) —
> the same canonical placement the NeXus Design Studio catalog assigns the
> class (`BASE_CLASS_PATHS: NXenvironment → /entry/sample/environment`). The
> group sits outside the NXhzdr_target NXDL's modelled scope (like
> `/entry/instrument`), so it needs no profile version bump.

### 3.6 Diagnostics and detectors

Data products from diagnostics (detector images, spectra, particle counts) arrive as
`HZDRDataProduct` records. **Since 2026-07-17 two semantic promotion layers exist**
on top of the structural tables: per-shot `metadata.diagnostic.*` scalars become
`/entry/instrument/<key>` (`NXdetector`, shot-indexed `data` array — legacy flat
spellings `xray_counts`/`detector_signal_mean`/`alignment_score` are folded in by
the writer), and each semantic data-product *kind* becomes
`/entry/instrument/detector_<kind>` (`NXdetector` with `detector_type` when the
kind maps, carrying product-id/shot-key/path references back to the
`/entry/data_products` rows). The flow-monitor emulator emits the namespaced
`metadata.diagnostic.*` keys; real producers should follow.

| HELPMI DetectorClasses | Current location | NeXus class | Recommended path | Gap / note |
| --- | --- | --- | --- | --- |
| X-ray / particle count | `metadata.diagnostic.xray_counts` (emulator) | `NXdetector.data` | `/entry/instrument/xray_counts/data` | ✅ per-shot NXdetector series written 2026-07-17; real diagnostics deliver arrays (still producer-side) |
| Streak camera image | `HZDRDataProduct` with `kind="streak_camera"` | `NXdetector` with `detector_type="STREAK"` | `/entry/instrument/detector_streak_camera` + `/entry/data_products` rows | ✅ `detector_type` stamped 2026-07-17; pixel data stays in the referenced files |
| Proton/ion spectrum | `HZDRDataProduct` with `kind="proton_spectrometer"` | `NXdetector` with `detector_type="POS"` | `/entry/instrument/detector_proton_spectrometer` | ✅ `detector_type` stamped 2026-07-17; energy axis not structured |
| Thomson parabola | — | `NXdetector` with `detector_type="THOMSON"` | `/entry/instrument/detector_thomson_parabola` | Writer maps the kind; **no producer sends it yet** — important DRACO diagnostic |
| FROG trace | — | `NXdetector` with `detector_type="FROG"` | `/entry/instrument/detector_frog` | Writer maps the kind; **no producer sends it yet** |
| Scintillator screen | `HZDRDataProduct.source` | `NXdetector.detector_type="SCINT"` | `/entry/instrument/detector_scintillator` | Writer maps the kind; no structured detector geometry |
| Alignment score | `metadata.diagnostic.detector_signal_mean` (emulator) | `NXdetector.data` | `/entry/instrument/detector_signal_mean/data` | ✅ per-shot NXdetector series written 2026-07-17 |
| Detector integration time | — | `NXdetector.count_time` | — | **Missing** in all real and emulated data |

### 3.7 NeXus bridge group class mapping

The canonical NeXus file written by `hzdr_nexus.py` currently uses `NX_class=NXcollection`
for most bridge groups. The table below shows the correct target classes once HELPMI
definitions are finalized, and the effort to migrate.

| Current path | Current `NX_class` | Target class (HELPMI/NeXus) | Migration note |
| --- | --- | --- | --- |
| `/entry` | `NXentry` | `NXentry` | Correct; `/entry/experiment_identifier` written by the bridge itself since 2026-07-17 (no longer dependent on the preserved LabFrog projection); ✅ `entry/start_time`/`end_time` from earliest/latest shot `fired_at` done 2026-07-18 (profile v0.6, refreshed on rebuild under a `damnit_source="shots"` marker) |
| `/entry/shots` | `NXcollection` | `NXcollection` | DAMNIT-internal shot table; custom class intentional |
| `/entry/source_events` | `NXcollection` | `NXcollection` | DAMNIT-internal event table; no standard equivalent |
| `/entry/data_products` | `NXcollection` | `NXcollection` + per-kind `NXdetector` | ✅ done 2026-07-17: `/entry/instrument/detector_<kind>` (`NXdetector`, `detector_type` tagged) per semantic product kind, referencing the table rows; the flat table stays `NXcollection` |
| `/entry/laserdata` | `NXcollection` | `NXbeam` or `NXsource` | 🟡 per-shot laser series done 2026-07-17 as `/entry/instrument/laser/shot_series` (`NXdata`, per-shot `metadata.laser.*` arrays); the raw payload collections stay `NXcollection` |
| `/entry/watchdog` | `NXcollection` | `NXcollection` (keep custom) | File-arrival log; no standard class; keep as-is |
| — | — | `/entry/instrument/laser` → `NXsource` + `NXbeam` | Done in DAMNIT for available `metadata.laser.*`; producer-side fixed fields still need capture |
| — | — | `/entry/sample` → `NXsample` | Done for available `metadata.target.*`, including wiki extras (`wiki_page`/`wiki_ref`/`status`/`provider`/`amount`/`type`/`production_date`/`origin`); gas fields are captured by LabFrog and normalized by SQLite schema v11 |
| — | — | `/entry/sample/environment` → `NXenvironment` | Done 2026-07-17 for available `metadata.vacuum.*` (`chamber_pressure`, `pre_shot_pressure`, `rga_dominant_species`); covered by the NXhzdr_target NXDL since profile v0.6 (2026-07-18) — see [nexus-semantic-maps.md §3](nexus-semantic-maps.md#3-vacuum-map-metadatavacuum--entrysampleenvironment) |
| — | — | `/entry/instrument/<key>` → `NXdetector` (per `metadata.diagnostic.*` scalar) | Done 2026-07-17: shot-indexed `data` array per key, aligned with `/entry/shots`; legacy flat spellings (`xray_counts`, `detector_signal_mean`, `alignment_score`) folded in by the writer and linter-flagged since 2026-07-18, when `diagnostic.*` became registry-governed (`@units` stamped from the registry) — see [nexus-semantic-maps.md §4](nexus-semantic-maps.md#4-diagnostic-map-metadatadiagnostic-and-data-products--nxdetector) |

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
[integration-roadmap.md](status/integration-roadmap.md#future-tango-device-self-archiving-as-a-metadata-source):

| Missing field | Standard | Category | Effort to add |
| --- | --- | --- | --- |
| Central wavelength (`wavelength_nm`) | HELPMI LaserClasses, NeXus `NXbeam` | Laser | ✅ done 2026-07-27 — emulators emit `metadata.laser.wavelength`; `DW_API_HZDR_LASER__WAVELENGTH` fills it otherwise (§3.3.1). Real LaserData capture still open |
| Repetition rate | HELPMI LaserClasses, NeXus `NXsource.frequency` | Laser | ✅ done 2026-07-27 — fixed per system, stated as `DW_API_HZDR_LASER__REPETITION_RATE` (§3.3.1) |
| Beam waist / focus spot size | HELPMI LaserClasses | Laser | Medium — measured per campaign; add to LabFrog export |
| Polarization | HELPMI LaserClasses, NeXus `NXbeam` | Laser | ✅ done 2026-07-27 — fixed per configuration, stated as `DW_API_HZDR_LASER__POLARIZATION` against a written-down vocabulary (§3.3.1) |
| Pulse contrast | HELPMI LaserClasses | Laser | Medium — measured separately; add to LaserData producer |
| Target material | HELPMI TargetClasses, NeXus `NXsample` | Target | Base path done for LabFrog manual `OTHER`; extend capture for wiki/gas targets |
| Target thickness | HELPMI TargetClasses | Target | Base path done for LabFrog manual `OTHER`; extend capture for wiki/gas targets |
| Gas species / pressure | HELPMI TargetClasses | Target | Medium — gas jet shots only |
| Pre-shot vacuum pressure | HELPMI Devices | Environment | Low — sensors are present; add to LaserData or shotcounter |
| `/entry/instrument/laser` NeXus group | NeXus `NXsource` + `NXbeam` | NeXus structure | Done in DAMNIT for available `metadata.laser.*`; richer fixed fields depend on producer/source-catalog capture |
| `/entry/sample` NeXus group | NeXus `NXsample` | NeXus structure | Done for available `metadata.target.*`; richer fields depend on capture |
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
metadata.laser.pulse_energy      → HELPMI LaserClasses: pulse_energy
metadata.laser.pulse_duration    → HELPMI LaserClasses: pulse_duration
metadata.target.material         → HELPMI TargetClasses: material
metadata.vacuum.chamber_pressure → HELPMI Devices: vacuum_sensor.pressure
```

This is purely a documentation + convention change; no schema bump needed. The `hzdr_nexus.py`
builder can already write these as HDF5 attributes from the `metadata` JSON.

### Route 2: `NXsource`/`NXbeam` and `NXsample` groups in the NeXus bridge (ready)

**Update 2026-07-02: HELPMI is finished and will not publish further NeXus base
classes**, so the `NXlaser`/`NXtarget` fork is not a dependency. This route is
no longer blocked on HELPMI publication. Use the **standard** NeXus classes for broad
compatibility now: `/entry/instrument/laser` = `NXsource` (+ `NXbeam` for beam parameters),
and `/entry/sample` = `NXsample`.

For target-specific semantics, define an HZDR-local `NXhzdr_target` NXDL/profile rather
than using the official-looking `NXtarget` name. The compatibility-first path is to keep
`NX_class="NXsample"` in generated files and stamp HZDR profile attrs until the local
NXDL is bundled with validation; after that, HZDR-profile files can decide whether to use
`NX_class="NXhzdr_target"` directly. HELPMI DDC names remain as documentation cross-walk
only (§3.3, §3.4). This requires:

1. Choosing which producer events carry the relevant fields (LaserData, shotcounter).
2. ✅ Done in DAMNIT: `write_nexus_laser_group()` (`NXsource`/`NXbeam`) and
   `write_nexus_sample()` (`NXsample`) are wired into `write_nexus_bridge()`. Enrichment
   still depends on producers emitting the signed-off `metadata.laser.*` keys.
3. ✅ **Done 2026-07-02:** drafted the v0.1 HZDR `NXhzdr_target` profile document
   ([hzdr/docs/nxhzdr-target-profile.md](nxhzdr-target-profile.md)) and `write_nexus_sample()`
   now stamps the compatibility attrs (`damnit_nx_class="NXhzdr_target"`,
   `damnit_nxdl_version`) on `/entry/sample` while keeping `NX_class="NXsample"`.
   ✅ **Done 2026-07-13 (profile v0.2; current v0.11 — aligned with the DAPHNE4NFDI laser pump–probe schema):**
   NXDL formalization — the application definition
   `hzdr/nxdl/NXhzdr_target.nxdl.xml` encodes the profile, `write_nexus_bridge()` declares
   it via `/entry/definition`, and files are certified with
   `nds validate <file> --pynxtools --definitions hzdr/nxdl` (pynxtools; wired into the
   meta-repo alignment checker's `nexus` group). Since v0.6 (2026-07-18) the NXDL also
   models the laser/vacuum/diagnostic groups and `start_time`/`end_time`
   ([nexus-semantic-maps.md](nexus-semantic-maps.md)), and the
   `NX_class="NXhzdr_target"` swap decision is closed: `NX_class="NXsample"` is
   permanent (profile doc §6).
4. No change to the transport envelope; the data is already in `metadata`/`values`.

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

The plugin is an **HTTP service / Flask blueprint** over the upstream
`SciCatProject/scicat-ingestor` worker codepaths that **registers path references and
metadata only, never file contents** — a perfect fit for registering a campaign NeXus
file by path. DAMNIT's builder `POST`s the file path + assembled `scientificMetadata` to
`/scicat/from-json` (or `/scicat/push`, which also returns a deterministic `version_hash`
for re-registration detection) and stores the returned `pid`. Full interface and wiring
steps are in [integration-roadmap.md §SciCat Registration](status/integration-roadmap.md#scicat-registration)
and [Phase 4 of the alignment plan](plans/alignment-implementation-plan.md#phase-4--scicat-registration-via-the-existing-hzdr-plugin-).

### Route 4: NeXus Ontology annotation for federated search (higher effort)

The `nexusformat/NeXusOntology` (OWL, maintained by the FAIRmat and ExPaNDS projects)
provides machine-readable URIs for NeXus field names. Annotating the canonical NeXus
file's attributes with ontology URIs (`@type`, `@vocab` in JSON-LD terms, or HDF5
attributes pointing at the OWL term) would make the file discoverable in federated
ontology searches (e.g. the PaN portal). This is the highest-effort option and is
now HZDR-owned: HELPMI will not provide the missing target class, so the first local
ontology deliverable should be an `NXhzdr_target` profile with explicit mappings to
`NXsample`, HELPMI DDC target terms, and NeXus Ontology URIs where they exist.
**Done 2026-07-02:** the v0.1 profile document
([hzdr/docs/nxhzdr-target-profile.md](nxhzdr-target-profile.md)) delivers that explicit
mapping, and since profile v0.6 (2026-07-18)
[nexus-semantic-maps.md](nexus-semantic-maps.md) extends the "Upstream NeXus
field?" bookkeeping to the laser/vacuum/diagnostic namespaces — the complete
input for a future URI pass. NeXus Ontology URI annotation itself remains
open, deliberately deferred until a federated-search consumer (e.g. the PaN
portal) exists.

### Route 5: openPMD interoperability (for simulation comparisons)

HELPMI has extended openPMD to accept NeXus-like arbitrary hierarchies. For HZDR's
DRACO experiments, this would enable linking the experimental NeXus file to PIC
simulation output in openPMD format, making comparison plots in the same analysis
pipeline straightforward. The transport envelope is unchanged; this is a NeXus
writer and analysis tooling concern.

**Done 2026-07-18 (link schema):** the `metadata.simulation` link object —
series URI/path, matched iteration or window, code name/version, checksum,
optional SciCat PID — is specified in
[openpmd-linking.md](openpmd-linking.md) and characterization-tested to
round-trip the event normalizer losslessly
(`api/tests/test_hzdr_simulation_link.py`). Comparison tooling and a NeXus
`NXnote` mapping stay deferred until there is a concrete analysis user
(openpmd-linking.md §5–§6).

---

## 5. Status

| Item | Status | Section |
| --- | --- | --- |
| Detailed HELPMI / DAPHNE4NFDI / SciCat / Plasma-MDS alignment mapping | ✅ committed | §3 |
| Gap analysis: 16 missing fields with effort estimates | ✅ committed | §3.10 |
| Rename `metadata` keys to HELPMI-aligned namespace (`metadata.laser.*` etc.) | ⬜ post-pilot | §3.3, Route 1 |
| Add `metadata.laser.wavelength_nm`, `polarization`, `repetition_rate_hz` | ✅ done 2026-07-27: bare registry keys end to end — both emulators emit them, the `DW_API_HZDR_LASER__*` block fills them (plus `system`) when no producer does, filled datasets carry `damnit_source="config"` (profile v0.10), and the polarization enum is written down as `LASER_POLARIZATION_VALUES`; ⬜ real LaserData/shotcounter capture still open | §3.3, §3.3.1, §3.10 |
| Add `metadata.target.*` fields from LabFrog shot record | ✅ base path done; ✅ wiki extras (`wiki_page`/`wiki_ref`/`status`/`provider`/`amount`/`type`/`production_date`/`origin`) persisted, exported, and mapped end-to-end 2026-07-03; ✅ gas species/pressure captured, normalized to bar, and mapped end-to-end 2026-07-19 | §3.4, §3.10 |
| Add `/entry/instrument/laser` (`NXsource`/`NXbeam`) to NeXus bridge | ✅ done for available `metadata.laser.*`; producer enrichment still open | §3.7, Route 2 |
| Add `/entry/sample` (`NXsample`) to NeXus bridge | ✅ done for available target metadata | §3.7, Route 2 |
| Add `/entry/sample/environment` (`NXenvironment`) vacuum group to NeXus bridge | ✅ done 2026-07-17 for available `metadata.vacuum.*`; producer capture of `pre_shot_pressure`/`rga_dominant_species` still open | §3.5, §3.7 |
| Per-kind `NXdetector` groups in NeXus bridge (`detector_<kind>` + `detector_type` + row references) | ✅ done 2026-07-17 | §3.6, §3.7 |
| Per-shot `metadata.diagnostic.*` → `NXdetector` series + `laser/shot_series` `NXdata` | ✅ done 2026-07-17 (emulator emits `diagnostic.*` namespace; real producers still open) | §3.5, §3.6, §3.7 |
| Official `NXlaser` / `NXtarget` groups from HELPMI | ❌ cancelled — HELPMI finished | Route 2 |
| HZDR-local `NXhzdr_target` profile / NXDL | ✅ done 2026-07-13 (v0.2, current v0.11): NXDL application definition (`hzdr/nxdl/NXhzdr_target.nxdl.xml`) + `/entry/definition` stamped by the bridge + pynxtools certification via `nds validate --pynxtools --definitions`; v0.3 fixes the canonical temperature unit string to `degC`, v0.4 routes `target.material` to the free-text `material` dataset with `chemical_formula` derived only when the value parses as a formula, v0.5 writes the ontology-required `type` dataset with the §3 enum fixed in the NXDL, v0.6 grows the NXDL to the whole canonical entry (laser/vacuum/diagnostic groups, `start_time`/`end_time`) and closes the `NX_class` swap decision as keep-`NXsample`; v0.9 replaces generic laser-waist extent aliases with explicit 1/e²-radius fields; v0.11 adds the DAPHNE4NFDI laser pump–probe schema's field names and a `/pump_probe` entry for campaigns with a probe delay ([nxhzdr-target-profile.md](nxhzdr-target-profile.md), [nexus-semantic-maps.md](nexus-semantic-maps.md)) | Route 2, Route 4 |
| SciCat registration + `scicat_pid` back-population (via existing HZDR SciCat plugin) | 🟡 plugin built (HTTP `/scicat/from-json` \| `/scicat/push`); DAMNIT builder post-step + API link not yet wired | Route 3, [roadmap §SciCat Registration](status/integration-roadmap.md#scicat-registration) |
| NeXus Ontology annotation for federated search | ⬜ HZDR-owned design; no HELPMI blocker; deliberately deferred until a federated-search consumer exists (the "Upstream NeXus field?" columns in the profile docs are the prepared input) | Route 4 |
| openPMD interoperability (simulation links) | ✅ link schema (`metadata.simulation`) specified + normalizer round-trip pinned 2026-07-18 ([openpmd-linking.md](openpmd-linking.md)); ⬜ comparison tooling deferred until a concrete analysis user | Route 5 |

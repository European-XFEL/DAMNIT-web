# Schema, MediaWiki Integration, and DAPHNE4NFDI Alignment

Updated: 2026-06-26

This document covers three topics that are closely linked:

1. The current `hzdr-event-v1` schema — field choices, constraints, and the rationale behind each
2. The MediaWiki link built into every campaign source, how to configure it, and what it provides
3. How the schema relates to broader photon/neutron/laser-plasma data standards
   (DAPHNE4NFDI, HELPMI, NeXus, SciCat, openPMD) and which alignment routes are realistic

---

## 1. Current Schema (`hzdr-event-v1`)

### 1.1 What the schema is and is not

`hzdr-event-v1` is the **transport envelope**, not a full experimental metadata record.
Its job is narrow: carry one event (a trigger fire, a file-arrived notice, a laser
pulse record) from a producer to the DAMNIT reconciler in a way that is:

- **Replay-safe** — `event_id` is stable across producer retries; re-sending the
  same event with the same `event_id` is idempotent.
- **Traceable** — `payload_ref` carries transport position or URI so the event can
  always be traced back to the source broker/file/database record.
- **Closed at the top level** — `extra="forbid"` prevents field creep in producers;
  new producer-specific data goes in `metadata` or behind a `payload_ref`.
- **Joinable** — `experiment_id` + `shot_id` are the canonical join key; DAMNIT
  and LabFrog can always agree on which campaign and shot an event belongs to.

It is **not** a full experiment description, a NeXus entry, or an archival record.
Those live in the canonical NeXus file (`/entry/shots`, `/entry/source_events`,
`/entry/data_products`) and the `hzdr_sources.json` catalog, both built from this
envelope by the reconciler.

### 1.2 Field-by-field rationale

| Field | Type | Rationale |
| --- | --- | --- |
| `schema_version` | `"hzdr-event-v1"` | Drift detection: a schema bump fails CI in every producer until copies re-sync. Pattern-validated so a typo is rejected at parse time. |
| `event_id` | str (required) | Stable, deterministic, producer-assigned. Enables idempotent replay: if the same event arrives twice with the same `event_id`, the consumer deduplicates and acks without writing twice. Must not be a random UUID that changes on retry. |
| `experiment_id` | str | Canonical campaign identifier, derived from the operator's MediaWiki campaign page choice in LabFrog. Cross-repo join key. Format: `Title_Words_MM.YYYY` (underscores = MediaWiki page title convention). |
| `shot_id` | str | Producer-local shot identifier, combined with `experiment_id` for the join key. Not the authoritative shot number. |
| `shot_number` | `int \| None` | TANGO's authoritative counter; null when not yet propagated. Explicitly nullable because blocking a producer on an unavailable authoritative number is worse than recording null and letting the reconciler sort it out. See §Shot Number Authority in `integration-roadmap.md`. |
| `source` | str | Human-readable producer name (`"DAQ-File-Watchdog"`, `"DRACO-Trigger"`, `"LaserData"`). Used in the UI and for grouping. |
| `kind` | str | Producer-defined event sub-type (`"draco.trigger"`, `"watchdog.file"`, `"camera_raw"`). |
| `timestamp` | str (UTC ISO-8601) | Required to be timezone-aware UTC at the transport layer; naive LabFrog times are interpreted in the campaign timezone during reconciliation. |
| `transport` | str | `kafka`, `asapo`, `zmq+kafka`, or `flow-monitor`. Informs the consumer which `payload_ref` fields are most meaningful. |
| `payload_ref` | `HZDRPayloadRef` | **The canonical traceability object.** Core traceability (Kafka topic/partition/offset, file URI, Mongo `_id`) belongs here, not in `metadata`. `extra="allow"` so producers can attach producer-specific refs at the same level without nesting. |
| `values` | `JsonValue \| None` | Small inline scalars/objects/arrays only (≤4096 leaf items, ≤64 KiB JSON). Oversized payloads are a producer bug; they should store data behind `payload_ref.uri`. |
| `metadata` | `dict[str, JsonValue]` | Free-form extra fields. Consumers that need a flat storage row serialize the whole object as one JSON column; the model does not flatten it. |

### 1.3 Hard constraints and why

**Closed top level (`extra="forbid"`):**
Any producer field that does not appear in this table is rejected during normalization.
The single documented exception is `trigger_role`, which the shotcounter emits at the
top level for historical reasons; the normalizer folds it into `metadata.trigger.role`
before validation. New producer-specific fields always go into `metadata`.

**`shot_number` is nullable by design:**
The alternative — blocking a trigger event until an authoritative shot number is
available — would stall the pipeline when the TANGO device is unavailable or the
cross-system clock hasn't propagated. Null is the correct value, not an error.
The reconciler matches primarily on identity (`kafka_event_id`, transport position) and
only falls back to `shot_number` when that is the best available hint.

**`values` size bounds:**
`check_values_size()` is enforced at staging time (not model-construction time) so
error messages name the offending file and point at `payload_ref`. An oversized
`values` payload fails loudly at the builder rather than silently bloating the NeXus file.

**`payload_ref` is always required (empty object is fine):**
The file contract has always required the key; a missing key signals a malformed event,
while an empty `{}` is valid when a producer genuinely has no traceability information
yet (e.g. a locally generated flow-monitor emulator event).

### 1.4 `experiment_id` and its MediaWiki origin

The `experiment_id` field is sourced from the operator's **MediaWiki campaign page
choice** inside LabFrog. When an operator creates or selects a campaign in LabFrog,
they pick (or create) a MediaWiki page for that campaign; LabFrog stores the page
title and derives `experiment_id` from it by normalizing to underscores and the
`Name_MM.YYYY` convention. The SQLite/NeXus export pipeline then plumbs this value
through every export row, so by the time an event reaches DAMNIT, `experiment_id`
is already the canonical, human-readable, wiki-linked campaign identifier.

This design means:
- There is always a wiki page for every campaign that DAMNIT ingests (the operator
  had to pick or create one in LabFrog).
- The wiki page is the human-facing record of what the campaign was about, what was
  measured, who participated, and any notes the operator recorded during the run.
- The DAMNIT `GET /metadata/hzdr/sources/{source_key}/wiki` endpoint (see §2) turns
  that identifier back into a direct link to the wiki page plus live API metadata.

### 1.5 Schema evolution routes

**Option A — Additive fields in `metadata` (no schema bump):**
The most common path. New producer-side information goes in `metadata.my_new_field`,
or behind `payload_ref.my_new_ref`. No schema version change, no cross-repo
coordination overhead.

**Option B — New required field or constraint change (schema bump to `hzdr-event-v2`):**
If a new field must be present in every event (e.g. a `sample_id` join key) or an
existing constraint must tighten, the version string changes. Every producer and
the vendored fixture copies must update together; CI in each repo catches drift.
The old `v1` normalizer remains active until all producers have migrated.

**Option C — SciCat `scicat_pid` plumbing:**
`HZDRPayloadRef` already has a `scicat_pid` field. Once a campaign's NeXus file is
registered in SciCat, the builder can back-populate this field in the catalog so
DAMNIT can provide direct SciCat dataset links. No schema change needed.

**Option D — NeXus ontology alignment (see §3.4):**
Longer-term path: annotate `metadata` fields with controlled vocabulary terms from
the NeXus ontology or HELPMI glossary (e.g. `NXlaser`, `NXtarget`). This does not
require changing the transport envelope; it is a build-time annotation step in the
NeXus writer.

---

## 2. MediaWiki Integration

### 2.1 What it does

Every HZDR source (campaign) has a corresponding MediaWiki page that was the origin
of its `experiment_id`. The MediaWiki integration in DAMNIT provides:

1. **A stable, clickable URL** to that page for every campaign displayed in the UI.
2. **Live metadata** (page existence, last-modified date, categories) fetched from the
   MediaWiki Action API on demand.

This is a read-only, one-way link. DAMNIT does not write to the wiki and does not
require MediaWiki credentials. The wiki is treated as a reference source, not a
synchronized store.

### 2.2 How `experiment_id` maps to a wiki page

MediaWiki uses underscores and spaces interchangeably in page titles. The
`experiment_id` format (`Solenoid_Beamline_Tests_01.2025`) is already valid as a
MediaWiki URL component:

```
page title:  Solenoid_Beamline_Tests_01.2025
page URL:    {wiki_base_url}/index.php/Solenoid_Beamline_Tests_01.2025
API query:   {wiki_base_url}/api.php?action=query&prop=info&titles=Solenoid_Beamline_Tests_01.2025&format=json
```

A `metadata.wiki_page_url` field on the source overrides the derived URL if the
operator has set a more specific link (e.g. a section anchor or a different wiki).

### 2.3 Configuration

Set `DW_API_HZDR_WIKI__BASE_URL` to the root of the MediaWiki installation:

```bash
DW_API_HZDR_WIKI__BASE_URL=https://wiki.hzdr.de
DW_API_HZDR_WIKI__FETCH_TIMEOUT=5.0   # optional, default 5.0 s
```

Without `BASE_URL`, the endpoint returns `configured: false` and no URL — useful in
local-only or offline environments where the wiki is not reachable.

### 2.4 API endpoint

```
GET /metadata/hzdr/sources/{source_key}/wiki
GET /metadata/hzdr/sources/{source_key}/wiki?fetch=true
```

Response (`HZDRWikiInfo`):

| Field | Type | Description |
| --- | --- | --- |
| `source_key` | str | The source this wiki link belongs to |
| `experiment_id` | str \| null | The campaign identifier used to derive the page title |
| `page_title` | str \| null | MediaWiki page title |
| `page_url` | str \| null | Full URL to the wiki page; null when `BASE_URL` is not configured |
| `configured` | bool | Whether `DW_API_HZDR_WIKI__BASE_URL` is set |
| `exists` | bool \| null | Whether the page exists on the wiki (only when `fetch=true`) |
| `last_modified` | str \| null | ISO-8601 last-modified time from the wiki (only when `fetch=true`) |
| `page_id` | int \| null | MediaWiki numeric page ID (only when `fetch=true`) |
| `categories` | list[str] | Categories the page belongs to (only when `fetch=true`) |

The `fetch=true` variant makes a live HTTP call to the MediaWiki Action API with
`DW_API_HZDR_WIKI__FETCH_TIMEOUT` as the timeout. If the wiki is unreachable, the
fields that require a live call are returned as null rather than raising an error —
the URL link is still usable.

### 2.5 Extending the integration

**Fetching section content:** The MediaWiki API supports `prop=extracts&exintro=true`
to fetch the introductory section of a page as HTML or plain text. Useful for
displaying a campaign abstract in the DAMNIT UI without the operator having to
re-enter it.

**Writing back run metadata:** MediaWiki supports authenticated edits via the
Action API (`action=edit`). A future extension could let DAMNIT append a
structured summary table (shot count, matched fraction, data volume) to the wiki
page at the end of a campaign build. Requires a bot account and is deliberately
not implemented here — the wiki is the operator's record, not DAMNIT's output.

**Per-shot wiki links:** If the wiki has a sub-page per shot or per day
(`Solenoid_Beamline_Tests_01.2025/Day_1/Shot_042`), the shot detail endpoint could
derive those links from the shot key. Not implemented; pattern would be
`{base_url}/index.php/{experiment_id}/{shot_key}`.

---

## 3. DAPHNE4NFDI and HELPMI Alignment

### 3.1 DAPHNE4NFDI

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

### 3.2 HELPMI

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

### 3.3 Current field mapping

The table below maps the fields DAPHNE4NFDI and HELPMI define to the corresponding
locations in the current HZDR/DAMNIT schema.

**Experiment / Beamtime / Proposal level** (maps to `HZDRSource`):

| Standard field | Location in DAMNIT | Notes |
| --- | --- | --- |
| Proposal / beamtime ID | `HZDRSource.metadata["experiment_id"]` | Derived from MediaWiki page title in LabFrog |
| Campaign title | `HZDRSource.title` | Human-readable name |
| Primary Investigator | `HZDRSource.metadata["pi"]` (free-form) | Not yet captured |
| Facility / beamline | `HZDRSource.metadata["facility"]` (free-form) | Not yet structured |
| Start / end date | `HZDRShot.fired_at` range; not at source level | Could add `metadata["campaign_start"]` |
| Wiki / logbook link | `GET /metadata/hzdr/sources/{key}/wiki` | **New endpoint** (this PR) |

**Measurement / Shot level** (maps to `HZDRShot`):

| Standard field | Location in DAMNIT | Notes |
| --- | --- | --- |
| Shot / scan number | `HZDRShot.shot_number` | TANGO authoritative; nullable |
| Timestamp | `HZDRShot.fired_at` | UTC ISO-8601 |
| Shot key | `HZDRShot.shot_key` | `exp_id:YYYYMMDD:NNNNNN` — stable cross-system ID |
| Match status | `HZDRShot.match_status` | `matched`, `labfrog-only`, etc. |
| Source events | `HZDRShot.events` | List of `HZDRSourceEvent`, each with `payload_ref` |
| Data products / files | `HZDRShot.data_products` | `HZDRDataProduct` with `path`, `dataset_name`, preview |
| HDF5 path | `HZDRShot.hdf5_path` | Path to the shot's HDF5 dataset in the NeXus file |

**Laser parameters** (maps to `HZDREventV1.metadata` or future NeXus groups):

| HELPMI / DAPHNE4NFDI field | Current location | Gap |
| --- | --- | --- |
| Laser energy (J) | `shot.metadata["laser_energy_j"]` (free-form emulator) | Emulator only; no structured producer field |
| Pulse width (fs) | `shot.metadata["pulse_width_fs"]` | Emulator only |
| Beam position (mm) | `shot.metadata["beam_position_x_mm/y_mm"]` | Emulator only |
| Target description | — | Not captured; HELPMI `TargetClasses` defines this |
| Detector / diagnostic | `HZDRDataProduct.source`, `.kind` | Partial; no structured NXdetector equivalent |
| Chamber pressure | `shot.metadata["chamber_pressure_mbar"]` | Emulator only; HELPMI `vacuum_sensor` class defines this |

**NeXus bridge groups** (maps to canonical NeXus output):

| NeXus path | Standard class | Notes |
| --- | --- | --- |
| `/entry/shots` | `NXentry` (custom) | DAMNIT's canonical shot table |
| `/entry/source_events` | — | DAMNIT-specific; no direct NeXus equivalent |
| `/entry/data_products` | `NXdata` (partial) | Could be annotated with `NXdetector` |
| `/entry/laserdata` | `NXlog` or `NXbeam` | Laser parameter time series |
| `/entry/watchdog` | — | File-arrival events; no NeXus class |

### 3.4 Potential alignment routes

These are ordered from lowest to highest effort. None block the pilot or the go-live
gate — they are post-pilot quality improvements.

#### Route 1: Structured `metadata` keys with HELPMI glossary terms (low effort)

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

#### Route 2: `NXlaser` and `NXtarget` groups in the NeXus bridge (medium effort)

The HELPMI `NeXus-for-HELPMI/definitions` fork extends NeXus with laser-plasma specific
base classes. Adding `/entry/laser` (`NXlaser`) and `/entry/target` (`NXtarget`) groups
to the NeXus bridge in `hzdr_nexus.py` would make the canonical NeXus file directly
readable by HELPMI-aware tools. This requires:

1. Choosing which producer events carry the relevant fields (LaserData, shotcounter).
2. Adding a `write_nexus_laser_group()` call in `write_nexus_bridge()`.
3. No change to the transport envelope; the data is already in `metadata`/`values`.

#### Route 3: SciCat registration (medium effort, infrastructure dependency)

`HZDRPayloadRef.scicat_pid` is already in the schema. Once HZDR runs a SciCat instance
(or uses the shared HMC/HZB instance), the builder can register each campaign NeXus
file as a SciCat Dataset and back-populate `scicat_pid` in the catalog. The DAMNIT
API can then surface direct SciCat links alongside the wiki link. No transport schema
change needed; `payload_ref.scicat_pid` is already reserved for this purpose.

#### Route 4: NeXus Ontology annotation for federated search (higher effort)

The `nexusformat/NeXusOntology` (OWL, maintained by the FAIRmat and ExPaNDS projects)
provides machine-readable URIs for NeXus field names. Annotating the canonical NeXus
file's attributes with ontology URIs (`@type`, `@vocab` in JSON-LD terms, or HDF5
attributes pointing at the OWL term) would make the file discoverable in federated
ontology searches (e.g. the PaN portal). This is the highest-effort option and is
currently aspirational — HELPMI is still developing the laser-plasma-specific extensions.

#### Route 5: openPMD interoperability (for simulation comparisons)

HELPMI has extended openPMD to accept NeXus-like arbitrary hierarchies. For HZDR's
DRACO experiments, this would enable linking the experimental NeXus file to PIC
simulation output in openPMD format, making comparison plots in the same analysis
pipeline straightforward. The transport envelope is unchanged; this is a NeXus
writer and analysis tooling concern.

---

## 4. Summary: What is done vs. what is next

| Item | Status | Section |
| --- | --- | --- |
| `hzdr-event-v1` schema with vendored drift guard | ✅ committed | §1 |
| `experiment_id` sourced from MediaWiki campaign in LabFrog | ✅ committed | §1.4 |
| `GET /metadata/hzdr/sources/{key}/wiki` endpoint | ✅ this PR | §2.4 |
| `DW_API_HZDR_WIKI__BASE_URL` configuration | ✅ this PR | §2.3 |
| Tests for wiki link and optional API fetch | ✅ this PR | §2.4 |
| HELPMI DDC glossary term mapping in `metadata` keys | ⬜ post-pilot | §3.4, Route 1 |
| `NXlaser` / `NXtarget` groups in NeXus bridge | ⬜ post-pilot | §3.4, Route 2 |
| SciCat registration + `scicat_pid` back-population | ⬜ infrastructure dependency | §3.4, Route 3 |
| NeXus Ontology annotation for federated search | ⬜ aspirational | §3.4, Route 4 |
| openPMD interoperability (simulation links) | ⬜ aspirational | §3.4, Route 5 |

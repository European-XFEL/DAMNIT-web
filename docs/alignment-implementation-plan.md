# Standards Alignment — Implementation Plan

Updated: 2026-07-02

The execution plan for enacting the alignment described in
[standards-alignment.md](standards-alignment.md). That document is the *what* (the
field cross-walk and gap analysis); this one is the *how and when* — phased, ordered,
with the files touched, tests, and exit criteria for each phase.

Status legend: 🟢 ready now (no external dependency) · 🟡 needs a human decision or a
sibling-repo (LabFrog/producer) change · 🔴 needs live infrastructure (SciCat, broker,
ontology service).

Guiding principle (from `CLAUDE.md` decision ladder): **the transport envelope does not
change.** Every phase below adds structure inside `metadata`/`values` or in the NeXus
writer — no `hzdr-event-v2` bump, no cross-repo fixture re-sync, until a phase genuinely
requires a new required field.

---

## Phase 0 — Lock the `metadata` namespace convention 🟢

**SIGNED OFF 2026-07-02.** The namespace decision is final: bare keys
(no unit suffix) + the metadata key registry as the source of truth for
canonical units, extended family-wide to `metadata.laser.*` and
`metadata.vacuum.*` (not just `metadata.target.*`). See
[target-ontology.md §5](target-ontology.md#5-units-convention),
[standards-alignment.md §3.3/§3.5](standards-alignment.md#33-laser-parameters),
and the registry in [CLAUDE.md](../CLAUDE.md). No further naming decision is
needed — the one remaining Phase 0 item is the code item below (test), now
unblocked by this sign-off.

**Why first:** every later phase writes into `metadata.laser.*`, `metadata.target.*`,
`metadata.vacuum.*`, `metadata.diagnostic.*`, `metadata.run.*`. The names must be fixed
once, up front, so producers and the NeXus writer agree and nothing has to be renamed
twice.

**Do:**
1. ✅ Promote the recommended-key columns in [standards-alignment.md §3.3–3.6](standards-alignment.md#33-laser-parameters)
   to a single authoritative key table (a `metadata` key registry) and add it to the
   root `CLAUDE.md` "Event schema contract" section so producers treat it as binding.
   Done — see the "Metadata key registry" subsection of `CLAUDE.md`.
2. ✅ **Remaining Phase 0 code item, now unblocked — done 2026-07-02:** added
   `METADATA_KEY_REGISTRY`, `LEGACY_KEY_MAP`, and a non-failing `lint_metadata_keys()`
   linter to `hzdr_event.py` that *warns* (via `hzdr_nexus._normalize_event`, on every
   event that flows through normalization) when a producer uses a legacy suffixed key
   (`pulse_energy_j`) instead of the namespaced bare one (`metadata.laser.pulse_energy`).
   Warn-only — does not reject, since the envelope stays open inside `metadata`. The
   `properties` extras sub-object is exempt (docs/target-ontology.md §4).

**Files:** `CLAUDE.md`, `api/src/damnit_api/metadata/hzdr_event.py`, a new
`api/tests/test_metadata_keys.py`.

**Exit:** key registry committed; linter warns on legacy keys; no producer change yet.

**Effort:** Low. **Decision needed:** ~~confirm the namespace names are final (this is
the one human sign-off that gates everything downstream)~~ — done, signed off 2026-07-02.

## Phase 1 — Namespaced laser metadata + low-effort missing fields 🟡

**Scope:** the "Low effort" laser/environment rows in the
[gap summary §3.10](standards-alignment.md#310-gap-summary): central wavelength,
repetition rate, polarization, pre-shot vacuum pressure, laser system name; plus moving
the existing flat emulator keys into the `metadata.laser.*` / `metadata.vacuum.*`
namespace.

**Do:**
1. ✅ **Done 2026-07-02:** updated the flow-monitor emulator
   (`_build_flow_monitor_metadata` and `enrich_latest_emulated_shot` in
   `api/src/damnit_api/metadata/routers.py`) and the standalone
   `api/scripts/hzdr-package-emulator.py` / `api/scripts/generate-hzdr-example.py`
   generators to emit `metadata.laser.*` / `metadata.vacuum.*` namespaced bare keys
   (`pulse_energy`, `pulse_duration`, `beam_pos_x`/`beam_pos_y`, `chamber_pressure`) and
   a `metadata.target` object (bare `temperature` nested under it) instead of the legacy
   flat/suffixed keys. Newly-added constant fields (wavelength, rep rate, polarization,
   laser system) are still open — not part of this pass.
2. ⬜ Update the LaserData / shotcounter producers (sibling repos) to emit the same
   namespaced keys. Fixed-per-system values (wavelength, rep rate, polarization) can come
   from producer config rather than per-shot data.
3. ✅ **Done 2026-07-02:** characterization tests
   (`test_flow_monitor_emulator_emits_namespaced_bare_keys`,
   `test_flow_monitor_emulator_enrich_action_keeps_namespaced_keys` in
   `api/tests/test_hzdr_sources.py`) assert the emulator emits the namespaced keys, that
   `hzdr_sources.json` round-trips them, and that `lint_metadata_keys()` is silent on the
   emulator's output.

**Files:** `api/src/damnit_api/metadata/routers.py`, sibling producer configs,
`api/tests/` (new emulator-metadata test).

**Exit:** a freshly emulated campaign shows `metadata.laser.*` and `metadata.vacuum.*`
populated; legacy-key linter from Phase 0 is silent on emulator output.

**Effort:** Low (DAMNIT side) / Low–Medium (each producer). 🟡 because it touches sibling
producer repos.

## Phase 2 — Target / sample metadata from LabFrog 🟢/🟡

**Scope:** the "Medium effort" target rows: material, thickness, type, gas species/pressure
([§3.4](standards-alignment.md#34-target--sample)). Verified 2026-07-02: LabFrog
shot records currently store the selected target value for every shot, manual `OTHER`
target details (`material`, `thickness`, `notes`), and same-target series fields such
as `target_series_sample`. The sibling `labfrog-sqlite-tools` export already carries
those captured fields in `shots`/`shot_summary`. DAMNIT now reads the exported target
columns into `HZDRShot.metadata.target.*`, converting known LabFrog thickness units to
canonical nanometres for the bare-key metadata convention.

The binding key schema remains [target-ontology.md](target-ontology.md) — bare numeric
keys with NeXus `@units`, `provenance` (`wiki`/`manual`), `wiki_ref`, and an open
`properties` bag for curated fields that vary between wiki target records.

**Done:**
1. ✅ LabFrog → SQLite/NeXus export carries captured target fields into the per-shot row.
2. ✅ DAMNIT reconciler maps exported target columns into `HZDRShot.metadata.target.*`.
3. ✅ Tests cover a LabFrog target row surfacing as `metadata.target.material` and
   `metadata.target.thickness` in the reconciled catalog shape.
4. ✅ DAMNIT API/UI surfaces curated target wiki links: `HZDRShot.target_wiki_ref` /
   `target_wiki_page` are derived from `metadata.target`, and the shot table/detail panes
   render a direct wiki link when present.

**Remaining:** LabFrog does not yet persist target `type`, gas species/pressure,
`wiki_ref`, or arbitrary curated wiki target properties on each shot. Add those at the
LabFrog capture/wiki-enrichment boundary before DAMNIT can expose them.

**Files:** sibling `labfrog-sqlite-tools` export, `api/src/damnit_api/metadata/hzdr_nexus.py`
(reconciler merge), `api/tests/test_hzdr_nexus.py`.

**Exit:** target material/thickness visible per shot in the API and catalog for captured
LabFrog manual target records; richer wiki/gas fields tracked as a follow-up.

**Effort:** Base Phase 2 is green for captured LabFrog fields; extended wiki/gas/type
capture remains medium.

## Phase 3 — NeXus structural groups (`NXsource`, `NXsample`, `NXdetector`) 🟢

**Scope:** the NeXus-structure rows from
[§3.7](standards-alignment.md#37-nexus-bridge-group-class-mapping): add the missing
`/entry/instrument/laser` (`NXsource`), `/entry/sample` (`NXsample`), and per-product
`NXdetector` sub-groups; set `entry/start_time`. This is the highest-value, fully
local step — it makes the canonical file readable by standard NeXus/HELPMI tooling using
data the earlier phases already captured.

**Do:**
1. ✅ **Done 2026-07-02:** added `write_nexus_laser_group()` (`/entry/instrument/laser`
   as `NXsource`, nested `beam` as `NXbeam`) reading from `metadata.laser.*`; writes
   `type`, `probe`, `name`, `pulse_energy`, `frequency`, `incident_energy`,
   `pulse_duration`, `incident_wavelength`, `incident_polarization`, beam position,
   waist/extent, and contrast when present.
2. ✅ **Done 2026-07-02:** added `write_nexus_sample()` (NXsample: `name`,
   `chemical_formula`, `thickness`, `diameter`, `temperature`, `gas_pressure`,
   `substrate_material`, `description`, plus `damnit_provenance`/`target_ref`/
   `gas_species`/`prop_*` group attrs) reading from `metadata.target.*` in
   `api/src/damnit_api/metadata/hzdr_nexus.py`, wired into `write_nexus_bridge()` (called
   for every campaign build via `hzdr-hdf5-builder.py`). Tolerates the legacy string
   form of `metadata.target` via `_normalize_target_metadata`. Tests in
   `api/tests/test_hzdr_nexus_sample.py`.
3. ⬜ In `_write_data_products`, write a per-product `NXdetector` sub-group with
   `detector_type`/`type` derived from the product `kind`; add the missing kinds
   (Thomson parabola, FROG) to the kind→class map.
4. Set `entry/start_time` from the first shot's `fired_at`.
5. ✅ **Done 2026-07-02 for the laser bridge:** existing `hzdr_nexus` bridge test now asserts
   `/entry/instrument/laser`, nested `beam`, `NX_class`, and `@units`; keep extending it
   for the future `NXdetector` product groups.

**Files:** `api/src/damnit_api/metadata/hzdr_nexus.py`, `api/tests/` (NeXus writer tests).

**Exit:** `pytest -k hzdr` green; a built campaign NeXus file validates the new groups;
`cnxvalidate`/`punx` (if available) reports the laser/sample/detector groups.

**Effort:** Low–Medium. 🟢 — entirely local; data already in `metadata` after Phases 1–2.
Depends on Phases 1–2 for the *content* but can be built (with empty-tolerant writers)
independently.

## Phase 4 — SciCat registration via the existing HZDR plugin 🟡

**Scope:** [§3.9](standards-alignment.md#39-scicat-field-mapping) and
[Route 3](standards-alignment.md#route-3-scicat-registration-lower-effort--existing-plugin).
`HZDRPayloadRef.scicat_pid` is already reserved.

**This is smaller than a from-scratch adapter.** HZDR already maintains a SciCat plugin —
`codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/scicat_plugin` — so
DAMNIT does **not** write its own SciCat client. The work is: build the metadata payload
from the campaign catalog, hand it to the plugin, and store the returned PID.

**Interface, verified against the plugin source (not assumed).** The plugin is an
**HTTP service / embeddable Flask blueprint** (`bp_scicat`) that reuses the upstream
`SciCatProject/scicat-ingestor` worker codepaths, **registering filesystem path
references and metadata only — never file contents** (the target SciCat forbids binary
upload). So the integration boundary is a `POST`, not a Python `register()` import — which
also avoids the Flask-vs-FastAPI in-process mismatch (DAMNIT's API is FastAPI). The fit:
`POST /scicat/from-json` with `{filepath, title, description, dataset_type, owner_group,
access_groups, owner, source_folder, meta}` → `{ok, pid, source_folder, file_name}`; or
`POST /scicat/push` with a file manifest, which additionally returns a deterministic
`version_hash` (from `versioning.make_manifest`/`manifest_hash`) for cheap
re-registration detection on rebuild. Ownership/contact fields default from the plugin's
own env (`DEFAULT_OWNER_GROUP`, `DEFAULT_ACCESS_GROUPS`, `CONTACT_EMAIL_DEFAULT`,
`PRINCIPAL_INVESTIGATOR_DEFAULT`) and can be overridden per request. See
[integration-roadmap.md §SciCat Registration](integration-roadmap.md#scicat-registration)
for the endpoint table.

**Do:**
1. Configure the plugin URL in DAMNIT settings (`DW_API_*`); keep the SciCat URL/token in
   the plugin's own env, never in DAMNIT API code (secrets boundary, `CLAUDE.md`). No
   Python dependency on the private GitLab repo is required — DAMNIT calls it over HTTP.
2. Add a builder post-step that assembles the `RawDataset` fields per the §3.9 mapping
   (`proposalId`=`experiment_id`, `instrumentId`, `scientificMetadata`=shot metadata dict,
   `sourceFolder`=`damnit_path`) and `POST`s the campaign NeXus file path to the plugin
   (`/scicat/from-json` for the simple case, `/scicat/push` if you want the `version_hash`).
3. Back-populate the returned `pid` as `scicat_pid` in `hzdr_sources.json`; surface a SciCat
   link in the API alongside the wiki link (mirror the MediaWiki endpoint pattern).
4. Gated integration test (like the broker tests) that runs only when a SciCat instance URL
   + credentials are configured; a unit test with the plugin HTTP call mocked runs always.

**Files:** builder script (`api/scripts/hzdr-hdf5-builder.py` post-step or a new
registration module), `api/src/damnit_api/metadata/hzdr_sources.py`, `routers.py`,
`api/tests/` (one mocked, one gated), dependency manifest.

**Exit:** a registered campaign shows a working SciCat dataset link; `scicat_pid` persisted;
mocked test green in CI, gated test green against a real instance.

**Effort:** Low–Medium (the plugin removes the SciCat-client work). 🟡 — needs the field
mapping confirmed and the private plugin available; a live instance is only needed for the
*gated* test, not for building the integration.

## Phase 5 — HZDR-owned ontology annotation & openPMD interoperability 🟡/🔴

**Scope:** [Routes 4-5](standards-alignment.md#route-4-nexus-ontology-annotation-for-federated-search-higher-effort).
NeXus Ontology URIs on file attributes for federated search; openPMD linking for
simulation comparison.

**Decision update 2026-07-02:** HELPMI is finished and will not publish the hoped-for
laser-plasma NeXus base classes. There is no longer an upstream item to wait for. Treat
the final HELPMI DDC names as a cross-walk, use standard NeXus classes where they exist,
and define the missing HZDR semantic layer locally. For targets, that means an HZDR-owned
`NXhzdr_target` NXDL/profile rather than waiting for or squatting on an official `NXtarget`
name.

**Do:**
1. Define a small HZDR semantic map for the metadata key registry: `metadata.*` key ->
   NeXus path/dataset -> HELPMI DDC term -> NeXus Ontology URI when one exists ->
   HZDR-local URI/identifier when no upstream term exists. Include a local target class
   definition, tentatively `NXhzdr_target`, with `NXsample` as its compatibility mapping.
   Keep this map versioned with the docs first; move it into NXDL/code only when the
   NeXus writer starts consuming it.
2. Add optional NeXus annotations from that map in `hzdr_nexus.py` without changing the
   event envelope. The low-risk first pass keeps `/entry/sample` as `NX_class="NXsample"`
   for standard-tool compatibility and adds HZDR attrs such as `damnit_nx_class="NXhzdr_target"`
   / `damnit_nxdl_version` until our custom NXDL is bundled with validation. Once the local
   NXDL package is in place, we can decide whether to set `NX_class="NXhzdr_target"` directly
   for HZDR-profile files. Cover the signed-off registry namespaces (`laser`, `target`,
   `vacuum`, `run`, `diagnostic`) and skip unknown extras in `metadata.target.properties`.
3. For openPMD, start with **linking/manifest interoperability**, not a wholesale
   conversion of the campaign NeXus file. Capture references from an experimental shot
   or data product to a PIC/openPMD series (path/URI, iteration/window, code name,
   checksum/version when available) so comparison tools can join experimental NeXus and
   simulation output explicitly.
4. Tests: static coverage test for the semantic map, NeXus writer test asserting the
   annotation attrs on a fixture file, and a manifest-link unit test. No live ontology
   service is required; a gated/live test only becomes relevant if a site service later
   consumes the annotations.

**Exit:** HZDR can publish a documented semantic profile without waiting on HELPMI; the
repo contains a local target-class definition/profile (`NXhzdr_target`) with an `NXsample`
compatibility mapping; a built campaign NeXus file carries ontology/semantic annotations
for covered metadata; an openPMD simulation reference can be linked to a shot or data
product for comparison.

**Effort:** Medium-High. 🟡 for the local semantic-map and annotation work; 🔴 only
for full openPMD comparison tooling or any future live ontology/search-service integration.

---

## Recommended order

1. **Phase 0 — namespace convention** 🟢. One decision, unblocks everything. Do first.
2. **Phase 1 — namespaced laser + low-effort fields** 🟡. Immediate FAIR-ness gain;
   small producer changes.
3. **Phase 3 — NeXus structural groups** 🟢. Highest-value local step; can start in
   parallel with Phase 1 using empty-tolerant writers, finishes once Phase 1/2 fill the data.
4. **Phase 2 — target/sample from LabFrog** 🟢/🟡. Base export/reconciler path is done for captured manual target fields; richer wiki/gas/type capture remains.
5. **Phase 4 — SciCat registration** 🟡. Wire up the existing HZDR SciCat plugin
   (no custom client); gated test when a live instance is up.
6. **Phase 5 — ontology / openPMD** 🟡/🔴. HELPMI is finished; define the HZDR semantic profile ourselves. Start with a local key->NeXus->ontology map, an HZDR `NXhzdr_target` profile, and openPMD links; defer full comparison tooling until there is a concrete analysis user.

None of these block the integration go-live gate (see
[remaining-work-plan.md](remaining-work-plan.md)); they are FAIR-data quality improvements
layered on top of the working pipeline. Phases 0, 1, and 3 are the realistic near-term
batch — all local or producer-config, no new infrastructure.

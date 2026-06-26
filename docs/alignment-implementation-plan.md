# Standards Alignment — Implementation Plan

Updated: 2026-06-26

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

**Why first:** every later phase writes into `metadata.laser.*`, `metadata.target.*`,
`metadata.vacuum.*`, `metadata.diagnostic.*`, `metadata.run.*`. The names must be fixed
once, up front, so producers and the NeXus writer agree and nothing has to be renamed
twice.

**Do:**
1. Promote the recommended-key columns in [standards-alignment.md §3.3–3.6](standards-alignment.md#33-laser-parameters)
   to a single authoritative key table (a `metadata` key registry) and add it to the
   root `CLAUDE.md` "Event schema contract" section so producers treat it as binding.
2. Add a non-failing `metadata` key linter to `hzdr_event.py` (or a test) that *warns*
   when a producer uses a legacy flat key (`laser_energy_j`) instead of the namespaced
   one (`metadata.laser.pulse_energy_j`). Warn-only — does not reject, since the envelope
   stays open inside `metadata`.

**Files:** `CLAUDE.md`, `api/src/damnit_api/metadata/hzdr_event.py`, a new
`api/tests/test_metadata_keys.py`.

**Exit:** key registry committed; linter warns on legacy keys; no producer change yet.

**Effort:** Low. **Decision needed:** confirm the namespace names are final (this is the
one human sign-off that gates everything downstream).

## Phase 1 — Namespaced laser metadata + low-effort missing fields 🟡

**Scope:** the "Low effort" laser/environment rows in the
[gap summary §3.10](standards-alignment.md#310-gap-summary): central wavelength,
repetition rate, polarization, pre-shot vacuum pressure, laser system name; plus moving
the existing flat emulator keys into the `metadata.laser.*` / `metadata.vacuum.*`
namespace.

**Do:**
1. Update the flow-monitor emulator (`_build_flow_monitor_metadata` in
   `api/src/damnit_api/metadata/routers.py`) to emit the namespaced keys and the
   newly-added constant fields (wavelength, rep rate, polarization, laser system).
2. Update the LaserData / shotcounter producers (sibling repos) to emit the same
   namespaced keys. Fixed-per-system values (wavelength, rep rate, polarization) can come
   from producer config rather than per-shot data.
3. Characterization test first: assert the emulator emits the namespaced keys and that
   `hzdr_sources.json` round-trips them.

**Files:** `api/src/damnit_api/metadata/routers.py`, sibling producer configs,
`api/tests/` (new emulator-metadata test).

**Exit:** a freshly emulated campaign shows `metadata.laser.*` and `metadata.vacuum.*`
populated; legacy-key linter from Phase 0 is silent on emulator output.

**Effort:** Low (DAMNIT side) / Low–Medium (each producer). 🟡 because it touches sibling
producer repos.

## Phase 2 — Target / sample metadata from LabFrog 🟡

**Scope:** the "Medium effort" target rows: material, thickness, type, gas species/pressure
([§3.4](standards-alignment.md#34-target--sample)). These live in the LabFrog shot record
and are not currently exported.

**Do:**
1. Extend the LabFrog → SQLite/NeXus export (sibling `labfrog-sqlite-tools`) to carry the
   target fields into the per-shot export row.
2. Plumb them through the reconciler into `HZDRShot.metadata.target.*` (no envelope change —
   they arrive in the trigger event's `metadata` or are joined from the LabFrog record).
3. Test: a shot with a LabFrog target record surfaces `metadata.target.material` etc. in
   the catalog and shot-detail API.

**Files:** sibling `labfrog-sqlite-tools` export, `api/src/damnit_api/metadata/services.py`
(reconciler merge), `api/tests/`.

**Exit:** target material/thickness visible per shot in the API and catalog.

**Effort:** Medium. 🟡 — depends on LabFrog export change and on what target fields LabFrog
actually records.

## Phase 3 — NeXus structural groups (`NXsource`, `NXsample`, `NXdetector`) 🟢

**Scope:** the NeXus-structure rows from
[§3.7](standards-alignment.md#37-nexus-bridge-group-class-mapping): add the missing
`/entry/instrument/laser` (`NXsource`), `/entry/sample` (`NXsample`), and per-product
`NXdetector` sub-groups; set `entry/start_time`. This is the highest-value, fully
local step — it makes the canonical file readable by standard NeXus/HELPMI tooling using
data the earlier phases already captured.

**Do:**
1. Add `write_nexus_instrument_laser()` (NXsource: `type="Laser"`, `probe="optical laser"`,
   `name`, `pulse_energy`, `frequency`) reading from `metadata.laser.*`.
2. Add `write_nexus_sample()` (NXsample: `name`, `chemical_formula`, `thickness`,
   `temperature`) reading from `metadata.target.*`.
3. In `_write_data_products`, write a per-product `NXdetector` sub-group with
   `detector_type`/`type` derived from the product `kind`; add the missing kinds
   (Thomson parabola, FROG) to the kind→class map.
4. Set `entry/start_time` from the first shot's `fired_at`.
5. Characterization test on a built NeXus file: assert the new groups, `NX_class`
   attributes, and `@units` are present (extend the existing `hzdr_nexus` test suite).

**Files:** `api/src/damnit_api/metadata/hzdr_nexus.py`, `api/tests/` (NeXus writer tests).

**Exit:** `pytest -k hzdr` green; a built campaign NeXus file validates the new groups;
`cnxvalidate`/`punx` (if available) reports the laser/sample/detector groups.

**Effort:** Low–Medium. 🟢 — entirely local; data already in `metadata` after Phases 1–2.
Depends on Phases 1–2 for the *content* but can be built (with empty-tolerant writers)
independently.

## Phase 4 — SciCat registration + `scicat_pid` back-population 🔴

**Scope:** [§3.9](standards-alignment.md#39-scicat-field-mapping) and
[Route 3](standards-alignment.md#route-3-scicat-registration-medium-effort-infrastructure-dependency).
`HZDRPayloadRef.scicat_pid` is already reserved.

**Do:**
1. Add a builder post-step that registers the campaign NeXus file as a SciCat `RawDataset`,
   mapping `proposalId`/`sampleId`/`instrumentId`/`scientificMetadata` per the §3.9 table.
2. Back-populate `scicat_pid` in `hzdr_sources.json`; surface a SciCat link in the API
   alongside the wiki link (mirror the MediaWiki endpoint pattern).
3. Gated integration test (like the broker tests) that runs only when a SciCat instance
   URL is configured.

**Files:** builder script (`api/scripts/hzdr-hdf5-builder.py` post-step or a new
registration module), `api/src/damnit_api/metadata/hzdr_sources.py`, `routers.py`,
`api/tests/` (gated).

**Exit:** a registered campaign shows a working SciCat dataset link; `scicat_pid` persisted.

**Effort:** Medium. 🔴 — blocked on access to a SciCat instance (HZDR-run or shared HMC/HZB).
Build the adapter now behind config; run the gated test when an instance is reachable.

## Phase 5 — Ontology annotation & openPMD interoperability 🔴 (aspirational)

**Scope:** [Routes 4–5](standards-alignment.md#route-4-nexus-ontology-annotation-for-federated-search-higher-effort).
NeXus Ontology URIs on file attributes for federated search; openPMD linking for
simulation comparison. Both wait on HELPMI's laser-plasma extensions stabilizing.

**Do (when upstream is ready):** annotate NeXus attributes with NeXusOntology OWL URIs;
add an openPMD export/link path for PIC-simulation comparison. Track upstream HELPMI
`NeXus-for-HELPMI/definitions` releases; revisit when `NXlaser`/`NXtarget` are published.

**Effort:** High. 🔴 — external dependency on HELPMI/FAIRmat deliverables. No action now
beyond watching the upstream repos.

---

## Recommended order

1. **Phase 0 — namespace convention** 🟢. One decision, unblocks everything. Do first.
2. **Phase 1 — namespaced laser + low-effort fields** 🟡. Immediate FAIR-ness gain;
   small producer changes.
3. **Phase 3 — NeXus structural groups** 🟢. Highest-value local step; can start in
   parallel with Phase 1 using empty-tolerant writers, finishes once Phase 1/2 fill the data.
4. **Phase 2 — target/sample from LabFrog** 🟡. Paced by the LabFrog export change.
5. **Phase 4 — SciCat registration** 🔴. Adapter now, gated test when an instance is up.
6. **Phase 5 — ontology / openPMD** 🔴. Watch upstream HELPMI; revisit post-pilot.

None of these block the integration go-live gate (see
[remaining-work-plan.md](remaining-work-plan.md)); they are FAIR-data quality improvements
layered on top of the working pipeline. Phases 0, 1, and 3 are the realistic near-term
batch — all local or producer-config, no new infrastructure.

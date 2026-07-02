# `NXhzdr_target` Profile — v0.1

Updated: 2026-07-02

The first versioned definition of the HZDR-local `NXhzdr_target` profile: the
semantic map from `metadata.target.*` to the `/entry/sample` NeXus group, and
the compatibility-attribute contract the writer stamps until a real NXDL
ships. This is a profile *document*, not an NXDL — see §6 for what's still
open.

Related docs: [target-ontology.md §2/§5/§8](target-ontology.md#2-the-schema)
(binding key registry and NeXus mapping this profile is derived from),
[standards-alignment.md §3.4](standards-alignment.md#34-target--sample)
(HELPMI cross-walk) and
[Route 2](standards-alignment.md#route-2-nxsourcenxbeam-and-nxsample-groups-in-the-nexus-bridge-ready)
/ [Route 4](standards-alignment.md#route-4-nexus-ontology-annotation-for-federated-search-higher-effort),
[alignment-implementation-plan.md Phase 5](alignment-implementation-plan.md#phase-5--hzdr-owned-ontology-annotation--openpmd-interoperability-).

## 1. Purpose and naming rationale

HELPMI (the HZDR-led Helmholtz Laser-Plasma Metadata Initiative) finished on
2026-07-02 without publishing an official `NXtarget` NeXus base class. Rather
than wait indefinitely or squat on the unqualified `NXtarget` name — which
looks official and could collide with a future upstream class — HZDR defines
its own local profile: **`NXhzdr_target`**.

**Compatibility-first strategy:** generated files keep `NX_class="NXsample"`
on `/entry/sample` so any standard NeXus/HELPMI tool can still read them. The
HZDR profile is layered on top as attributes, not as a replacement class:
`damnit_nx_class="NXhzdr_target"` and `damnit_nxdl_version` (this document's
version). Once a real `NXhzdr_target` NXDL is written and bundled with a
validator, HZDR can decide whether profile files should set
`NX_class="NXhzdr_target"` directly (§6).

## 2. Semantic map: `metadata.target.*` → `/entry/sample`

| `metadata.target` key | NeXus path (under `/entry/sample`) | Canonical unit | HELPMI DDC term (§3.4) | Upstream NeXus field? |
| --- | --- | --- | --- | --- |
| `name` | `name` (dataset) | — (string) | — | Standard `NXsample.name` |
| `material` | `chemical_formula` (dataset) | — (string) | Material | Standard `NXsample.chemical_formula` |
| `thickness` | `thickness` (dataset), `@units` | nm | Thickness | Standard `NXsample.thickness` |
| `temperature` | `temperature` (dataset), `@units` | °C (`C`) | Sample temperature | Standard `NXsample.temperature` |
| `diameter` | `diameter` (dataset), `@units` | mm | Diameter | **Profile extension** — no standard `NXsample` field |
| `gas_pressure` | `gas_pressure` (dataset), `@units` | bar | Gas pressure (gas jet) | **Profile extension** — no standard `NXsample` field |
| `substrate_material` | `substrate_material` (dataset) | — (string) | Substrate material | **Profile extension** — no standard `NXsample` field |
| `notes` | `description` (dataset) | — (string) | — | Standard `NXsample.description` |
| `provenance` | `@damnit_provenance` (group attr) | — (string enum: `wiki`/`manual`) | — | **Profile extension** (HZDR attr, not NeXus-standard) |
| `wiki_ref` | `@target_ref` (group attr) | — (string, URL/id) | — | **Profile extension** (HZDR attr) |
| `gas_species` | `@gas_species` (group attr) | — (string) | Gas species (gas jet) | **Profile extension** (HZDR attr) |
| `properties.*` | `@prop_<key>` (group attr, one per key) | as given (open bag, no registry unit) | — | **Profile extension** (HZDR attr) |

`name`, `material`, `thickness`, `temperature` are **standard NXsample**
fields — a plain NeXus reader gets useful data with no knowledge of this
profile. `diameter`, `gas_pressure`, `substrate_material` are **profile
extensions**: still written as plain datasets (so generic NeXus tooling can
still read the value), but there is no upstream `NXsample` field they map to
— they only have meaning under the `NXhzdr_target` semantic layer. `type` is
recorded in `metadata.target.type` (§3, target-ontology.md) but is not yet
written into `/entry/sample`; see §6.

Fields absent or `null` in `metadata.target` are skipped entirely — never
written as empty/null datasets or attributes (see `write_nexus_sample()` in
`api/src/damnit_api/metadata/hzdr_nexus.py`).

## 3. Profile attributes spec

Stamped on the `/entry/sample` group by `write_nexus_sample()`:

| Attribute | Value | Required | Notes |
| --- | --- | --- | --- |
| `NX_class` | `"NXsample"` | always | Compatibility class; never changes to `NXhzdr_target` until §6 is resolved |
| `damnit_nx_class` | `"NXhzdr_target"` | always | Marks the group as following this profile |
| `damnit_nxdl_version` | `HZDR_TARGET_PROFILE_VERSION` (currently `"0.1"`) | always | Must match this document's version (§4) |
| `damnit_provenance` | `"wiki"` \| `"manual"` | if `provenance` present | Curated vs. hand-entered target |
| `target_ref` | string (URL or stable id) | if `wiki_ref` present | Link back to the MediaWiki target record |
| `gas_species` | string (e.g. `"Ar"`, `"N2"`, `"He"`) | if `gas_species` present | Gas-jet / cluster species |
| `prop_*` | one attr per `properties` key, value as given | if `properties` present | Open extras bag (target-ontology.md §4); not unit-registry-backed |

`HZDR_TARGET_PROFILE_VERSION` is the module-level constant in
`api/src/damnit_api/metadata/hzdr_nexus.py` (next to `write_nexus_sample()`);
its value must always equal this document's version number.

## 4. Versioning rule

Bump `damnit_nxdl_version` / `HZDR_TARGET_PROFILE_VERSION` on **any** change to
the semantic map in §2 or the attribute spec in §3 — a field added/removed/
retyped, a unit changed, or an attribute renamed. The writer constant and this
document's version must always agree; a mismatch means one of them was
updated without the other. Non-semantic edits to this document (wording,
typo fixes) do not require a bump.

Current version: **0.1** (first drafted version, 2026-07-02).

## 5. Known deviations

- **`/entry/instrument/laser/beam` nests `NXbeam` inside `NXsource`.**
  `write_nexus_laser_group()` writes `/entry/instrument/laser` as `NXsource`
  and then a `beam` sub-group as `NXbeam` *underneath* it. Upstream NeXus
  convention more commonly places `NXbeam` as a sibling under `NXinstrument`,
  or attaches it under `NXsample` (the beam incident on the sample). HZDR's
  nesting groups the beam with its originating source instead, which reads
  naturally for a single-laser beamline but is not the most common upstream
  pattern. **Accepted as a deviation for now** — revisit if/when this profile
  is formalized into an NXDL and cross-checked against a validator that
  enforces placement.

No other deviations are tracked in v0.1.

## 6. Future work

- **NXDL formalization.** Write an actual `NXhzdr_target` NXDL file (XML,
  following the standard NeXus definitions schema) encoding §2/§3 as formal
  field/attribute definitions, and bundle it with a validator (`cnxvalidate`/
  `punx` or equivalent) so generated files can be checked against it directly
  instead of only against this prose document.
- **`NX_class="NXhzdr_target"` decision.** Once the NXDL is bundled with
  validation tooling, decide whether HZDR-profile files should set
  `NX_class="NXhzdr_target"` directly on `/entry/sample` (dropping, or
  keeping alongside, the `NX_class="NXsample"` compatibility value). Tracked
  as [alignment-implementation-plan.md Phase 5](alignment-implementation-plan.md#phase-5--hzdr-owned-ontology-annotation--openpmd-interoperability-).
- **`type` field.** `metadata.target.type` (target-ontology.md §3) is not yet
  written into `/entry/sample`; add a mapping (dataset or attribute) in a
  later profile version if downstream consumers need it in the NeXus file
  itself rather than only in the source `metadata` JSON.
- **NeXus Ontology URIs.** Route 4 (standards-alignment.md) calls for
  annotating covered fields with `nexusformat/NeXusOntology` URIs where they
  exist; §2's "Upstream NeXus field?" column is the starting point for that
  pass.

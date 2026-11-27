# `NXhzdr_target` Profile — v0.11

Updated: 2026-11-27

The versioned definition of the HZDR-local `NXhzdr_target` profile: the
semantic map from `metadata.target.*` to the `/entry/sample` NeXus group, and
the compatibility-attribute contract the writer stamps. Since v0.2 the profile
is also encoded as a real NXDL application definition
(`hzdr/nxdl/NXhzdr_target.nxdl.xml`), declared by the bridge file via
`/entry/definition`, so generated files can be certified with standard NXDL
tooling (`nds validate <file> --pynxtools --definitions hzdr/nxdl`). Since
v0.6 the application definition covers the **whole canonical entry** — the
laser (`NXsource`/`NXbeam`), vacuum (`NXenvironment`), and diagnostic
(`NXdetector`) groups plus `start_time`/`end_time` — whose semantic maps live
in the companion document
[nexus-semantic-maps.md](nexus-semantic-maps.md); this document remains the
normative reference for the target/sample map and the shared versioning rule.
See §6 for what's still open.

Related docs: [target-ontology.md §2/§5/§8](target-ontology.md#2-the-schema)
(binding key registry and NeXus mapping this profile is derived from),
[standards-alignment.md §3.4](standards-alignment.md#34-target--sample)
(HELPMI cross-walk) and
[Route 2](standards-alignment.md#route-2-nxsourcenxbeam-and-nxsample-groups-in-the-nexus-bridge-ready)
/ [Route 4](standards-alignment.md#route-4-nexus-ontology-annotation-for-federated-search-higher-effort),
[alignment-implementation-plan.md Phase 5](plans/alignment-implementation-plan.md#phase-5--hzdr-owned-ontology-annotation--openpmd-interoperability-).

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
version). Since v0.2 a real `NXhzdr_target` NXDL ships alongside this document
and the file declares it via `/entry/definition`. **Decision closed
2026-07-18 (v0.6):** `NX_class` stays `"NXsample"` permanently — see §6.

**Standards status — read this before citing the definition.**
`NXhzdr_target` is a **local, facility-defined NeXus application definition
owned by HZDR**. It is *not* part of the NeXus standard: it has not been
submitted to, reviewed by, or accepted by the NeXus International Advisory
Committee, and no such submission is scheduled. `category="application"` in
the NXDL is the NXDL schema's own type keyword; it carries no upstream
endorsement. Treat it exactly as you would any other site-local definition —
files certified against it are certified against *this* document at the stated
version, not against a community standard. Should it ever be accepted
upstream, that acceptance will be recorded here and the name and versioning
rule (§4) revisited at that point. The `damnit_*` attribute prefix, the
`prop_KEY` extras bag, and the HZDR enum values exist precisely so nothing in
a generated file can be mistaken for standard NeXus vocabulary.

## 1.1 Literature and standards basis

The profile is intentionally conservative: it uses official NeXus terms where
they exist, marks HZDR-only semantics explicitly, and keeps the generated file
readable by generic NeXus/HDF5 tooling.

| Design decision | Source basis | Consequence for `NXhzdr_target` |
| --- | --- | --- |
| Use `NXsample` as the compatibility class | The NeXus `NXsample` base class is the standard place for sample information and already defines `name`, `chemical_formula`, `temperature`, `description`, `type`, `thickness`, `physical_form`, sample environment, and incident beam links ([NeXus `NXsample`](https://manual.nexusformat.org/classes/base_classes/NXsample.html)). | `/entry/sample` keeps `NX_class="NXsample"` and maps the overlapping target fields onto standard `NXsample` datasets first. |
| Keep HZDR-specific fields visibly local | The NXDL manual says NeXus class definitions are the standard glossary; extra items may be inserted, but they are not part of the standard unless defined by an NXDL/application definition ([NeXus NXDL](https://manual.nexusformat.org/nxdl.html)). | HZDR extensions use `damnit_*`, `target_ref`, `gas_species`, and `prop_*` attributes under a named local profile instead of pretending they are upstream NeXus fields. |
| Write a prose profile before claiming a formal class | NXDL files are machine-readable definitions that can be validated against XML Schema and used to validate data files ([NeXus NXDL](https://manual.nexusformat.org/nxdl.html)). | v0.1 was a profile document only. v0.2 ships the NXDL (`hzdr/nxdl/NXhzdr_target.nxdl.xml`) with pynxtools-based validation; the `NX_class="NXhzdr_target"` swap stayed a separate decision until v0.6 closed it (keep `NXsample`, §6). |
| Avoid the bare name `NXtarget` | Official NeXus class lists define the standard namespace ([base classes](https://manual.nexusformat.org/classes/base_classes/index.html), [application definitions](https://manual.nexusformat.org/classes/applications/index.html)). As of the v2026.01 manual used for this review, `NXsample` exists and no official `NXtarget` base class is documented there. | The local class/profile name is prefixed as `NXhzdr_target` to avoid implying official NIAC status or colliding with a future upstream class. |
| Prefer standard units metadata over unit suffixes in keys | NXDL standardizes common terms including engineering units, and fields carry unit categories such as `NX_LENGTH`, `NX_TEMPERATURE`, and `NX_PRESSURE` ([NeXus NXDL](https://manual.nexusformat.org/nxdl.html), [`NXsample`](https://manual.nexusformat.org/classes/base_classes/NXsample.html)). | Stored metadata keys stay bare (`thickness`, `temperature`, `gas_pressure`); the NeXus writer stamps `@units` at write time. |
| Keep laser and target as adjacent but separate concepts | NeXus already models the radiation source and beam via `NXsource` and `NXbeam`, including laser/source type, frequency, wavelength, pulse energy, beam extent, incident wavelength, and polarization ([`NXsource`](https://manual.nexusformat.org/classes/base_classes/NXsource.html), [`NXbeam`](https://manual.nexusformat.org/classes/base_classes/NXbeam.html)). | `NXhzdr_target` only covers target/sample semantics; laser semantics stay in `/entry/instrument/laser` as `NXsource` + `NXbeam`. |
| Keep bridge collections out of the target profile | `NXcollection` is explicitly unvalidated and intended for arbitrary grouped terms ([`NXcollection`](https://manual.nexusformat.org/classes/base_classes/NXcollection.html)). | The canonical shot/event tables can remain `NXcollection`, but target fields that need durable semantics are promoted into `/entry/sample`. |
| Plan ontology annotation as a later pass | The NeXus Ontology creates machine-readable identifiers for NeXus classes and fields and is designed for annotation/tagging and mappings to other vocabularies ([nexusformat/NeXusOntology](https://github.com/nexusformat/NeXusOntology)). | v0.1 records which fields are standard NeXus fields; URI annotation is deferred until the NXDL/ontology pass. |

Broader RDM alignment supports the same shape. DAPHNE4NFDI emphasizes linked
metadata capture, data catalogues, and reuse workflows for photon/neutron
large-facility data ([DAPHNE4NFDI](https://www.daphne4nfdi.de/)); SciCat positions
itself as a scientific metadata catalogue for findability and sharing
([SciCat](https://www.scicatproject.org/)); and the FAIR principles emphasize
machine-actionable metadata for findability, interoperability, and reuse
([Wilkinson et al. 2016](https://www.nature.com/articles/sdata201618)). The
Plasma-MDS schema is not a laser-plasma target standard, but it supports the same
decomposition into plasma source, medium/target, diagnostics, and resources
([Franke et al. 2020](https://www.nature.com/articles/s41597-020-00771-0)).

## 2. Semantic map: `metadata.target.*` → `/entry/sample`

| `metadata.target` key | NeXus path (under `/entry/sample`) | Canonical unit | HELPMI DDC term (§3.4) | Upstream NeXus field? |
| --- | --- | --- | --- | --- |
| `name` | `name` (dataset) | — (string) | — | Standard `NXsample.name` |
| `type` | `type` (dataset) | — (string enum, target-ontology.md §3) | Target type | Standard `NXsample.type` **field name**; HZDR enum values (`foil`/`gas_jet`/`cluster`/`liquid`/`structured`/`other`), not the upstream sample/can/buffer vocabulary |
| `type` | `target_type` (dataset) | — (same enum) | Target type | **Profile extension** (since v0.11): the same value under the name the DAPHNE4NFDI HZDR site definition `NXlaser_pump_probe_hzdr_draco` uses, so `type` can return to its NeXus meaning in v1.0 |
| `material` | `material` (dataset) | — (string) | Material | **Profile extension** — free text; no standard `NXsample` field |
| `material` (only when it parses as a formula) | `chemical_formula` (dataset) | — (string) | Material | Standard `NXsample.chemical_formula` |
| `thickness` | `thickness` (dataset), `@units` | nm | Thickness | Standard `NXsample.thickness` |
| `temperature` | `temperature` (dataset), `@units` | °C (`degC`) | Sample temperature | Standard `NXsample.temperature` |
| `diameter` | `diameter` (dataset), `@units` | mm | Diameter | **Profile extension** — no standard `NXsample` field |
| `gas_pressure` | `gas_pressure` (dataset), `@units` | bar | Gas pressure (gas jet) | **Profile extension** — no standard `NXsample` field |
| `substrate_material` | `substrate_material` (dataset) | — (string) | Substrate material | **Profile extension** — no standard `NXsample` field |
| `notes` | `description` (dataset) | — (string) | — | Standard `NXsample.description` |
| `provenance` | `@damnit_provenance` (group attr) | — (string enum: `wiki`/`manual`) | — | **Profile extension** (HZDR attr, not NeXus-standard) |
| `wiki_ref` | `@target_ref` (group attr) | — (string, URL/id) | — | **Profile extension** (HZDR attr) |
| `gas_species` | `@gas_species` (group attr) | — (string) | Gas species (gas jet) | **Profile extension** (HZDR attr) |
| `properties.*` | `@prop_<key>` (group attr, one per key) | as given (open bag, no registry unit) | — | **Profile extension** (HZDR attr) |

`name`, `thickness`, `temperature` are **standard NXsample**
fields — a plain NeXus reader gets useful data with no knowledge of this
profile. `material`, `diameter`, `gas_pressure`, `substrate_material` are
**profile extensions**: still written as plain datasets (so generic NeXus
tooling can still read the value), but there is no upstream `NXsample` field
they map to — they only have meaning under the `NXhzdr_target` semantic layer.

Since v0.8, `/entry/sample` is explicitly the first-target campaign
snapshot. Every canonical row also stores its complete sorted
`metadata.target` object in the shot-aligned
`/entry/shots/target_metadata_json` column (`NXcollection`). This preserves
nonuniform target campaigns losslessly without inventing multiple campaign-level
`NXsample` groups; consumers join by the existing row/`shot_key` alignment.

Since v0.4, `material` routes to the free-text `material` extension dataset
instead of `chemical_formula`. Real target-inventory values are mostly **not**
CIF-convention formulas — the curated wiki records carry polymer trade names
("Formvar", "CH formvar"), multi-layer lists ("Si, Cu", "Au + CH (PU)") and
gas mixtures for LWFA gas targets — and `NXsample.chemical_formula` is
specified as a CIF/Hill-notation formula, so writing those values there would
mislabel them for any consumer that trusts the field name. The writer still
derives `chemical_formula` **additionally** when the material value parses as
a plain element-symbol formula (`_is_chemical_formula()` in
`hzdr_nexus.py` — e.g. `Au`, `Cu`, `Si3N4`, `CH`), which covers the pure-foil
inventory; anything that does not parse is written only as `material`.

Since v0.5, `type` — the ontology's required classification
(target-ontology.md §3) — is written as the `type` dataset. The **field name**
is standard `NXsample.type`, but the **value vocabulary** is the HZDR
laser-target enumeration rather than upstream NXsample's
sample/can/buffer list; the NXDL fixes the six accepted values, so a producer
sending an out-of-vocabulary type fails certification (the reconciler's wiki
mapping always lands on the enum, keeping the original wiki text in
`prop_wiki_type`).

Fields absent or `null` in `metadata.target` are skipped entirely — never
written as empty/null datasets or attributes (see `write_nexus_sample()` in
`api/src/damnit_api/metadata/hzdr_nexus.py`).

## 3. Profile attributes spec

Stamped on the `/entry/sample` group by `write_nexus_sample()`:

| Attribute | Value | Required | Notes |
| --- | --- | --- | --- |
| `NX_class` | `"NXsample"` | always | Compatibility class — permanent (decision closed 2026-07-18, §6) |
| `damnit_nx_class` | `"NXhzdr_target"` | always | Marks the group as following this profile |
| `damnit_nxdl_version` | `HZDR_TARGET_PROFILE_VERSION` (currently `"0.11"`) | always | Must match this document's version and the NXDL enumeration (§4) |
| `damnit_provenance` | `"wiki"` \| `"manual"` | if `provenance` present | Curated vs. hand-entered target |
| `target_ref` | string (URL or stable id) | if `wiki_ref` present | Link back to the MediaWiki target record |
| `gas_species` | string (e.g. `"Ar"`, `"N2"`, `"He"`) | if `gas_species` present | Gas-jet / cluster species |
| `prop_*` | one attr per `properties` key, value as given | if `properties` present | Open extras bag (target-ontology.md §4); not unit-registry-backed |

`HZDR_TARGET_PROFILE_VERSION` is the module-level constant in
`api/src/damnit_api/metadata/hzdr_nexus.py` (next to `write_nexus_sample()`);
its value must always equal this document's version number.

Since v0.2, `write_nexus_bridge()` additionally writes the entry-level dataset
`/entry/definition = "NXhzdr_target"` (always). It declares the application
definition encoded in `hzdr/nxdl/NXhzdr_target.nxdl.xml`, which is what NXDL
validators (pynxtools) certify the file against; the NXDL fixes the accepted
`damnit_nxdl_version` value via an enumeration, so a version drift between
writer and NXDL fails certification.

## 4. Versioning rule

Bump `damnit_nxdl_version` / `HZDR_TARGET_PROFILE_VERSION` on **any** change to
the semantic map in §2 or the attribute spec in §3 — a field added/removed/
retyped, a unit changed, or an attribute renamed. The writer constant, this
document's version, and the `damnit_nxdl_version` enumeration in
`hzdr/nxdl/NXhzdr_target.nxdl.xml` must always agree (all three, bumped
together); a mismatch means one of them was updated without the others. The
meta-repo alignment checker's `ontology` group verifies all three, plus the
fourth transcription in nexus-design-studio (`profiles/nxhzdr_target.yaml` —
rows, units, version, and its `source_ref` pin to this document's last commit)
and every registered current-version mention across the docs; its `run --fix`
mode rewrites the mechanical mirrors after a bump. Non-semantic
edits to this document (wording, typo fixes) do not require a bump.

Current version: **0.11** (aligned with the DAPHNE4NFDI laser pump–probe
schema, 2026-11-27).

History:

- **0.11** (2026-11-27): aligned with the DAPHNE4NFDI laser pump–probe
  schema (`NXlaser_pump_probe` and the HZDR site definition
  `NXlaser_pump_probe_hzdr_draco`, now beside this definition in
  `hzdr/nxdl/` with the base class `NXsynchronization`) without breaking any
  v0.10 path. **Part A, always:** the schema's names beside the v0.10 fields:
  `beam/spot_size` (both waists, `@definition = "1/e^2 intensity radius"`),
  `beam/polarization_label`, `beam/temporal_contrast` (with the new key
  `laser.contrast_time`) and `sample/target_type` (§2). **Part B, only for a
  campaign with `probe.delay`:** a second root entry, `/pump_probe`, certified
  against the site definition (or the core when a site-only item is missing);
  shots without an authority number go to `events_unidentified`, never
  dropped (ruling R-2026-11-27a). Twelve registry keys were added for it
  (ruling R-2026-11-27b). The draft placed the record as an `NXsubentry` of
  `/entry`; it is a root entry because pynxtools checks a subentry against
  the parent's definition. Proposal:
  [plans/nxhzdr-target-v0.11-draft.md](plans/nxhzdr-target-v0.11-draft.md);
  decisions: [plans/plan-nxhzdr-target-v0.11-implementation.md](plans/plan-nxhzdr-target-v0.11-implementation.md);
  laser and entry maps: [nexus-semantic-maps.md §2.2 and §6](nexus-semantic-maps.md).

- **0.10** (2026-07-27): the four laser fields no producer sends —
  `laser.system`, `laser.wavelength`, `laser.repetition_rate`,
  `laser.polarization` — may now be filled from the deployment's fixed
  laser-system configuration (`DW_API_HZDR_LASER__*`). A filled dataset
  carries the new marker attribute `damnit_source="config"`, declared in the
  application definition on `name`, `frequency`, `incident_wavelength`, and
  `incident_polarization`, so a campaign constant is distinguishable from a
  measured value. Producer values always win; an unconfigured deployment
  writes the same file as v0.9. The accepted `incident_polarization`
  vocabulary is documented (not enumerated — an off-vocabulary producer label
  is warned about, never a certification failure). See
  [nexus-semantic-maps.md §2.4](nexus-semantic-maps.md#24-fixed-laser-system-constants-damnit_sourceconfig-since-v010).
- **0.9** (2026-07-23): replaces the semantically ambiguous laser beam-waist
  datasets `extent_x` and `extent_y` with explicit
  `beam_waist_x_1e2_radius` and `beam_waist_y_1e2_radius` fields. Values remain
  in canonical `um` and represent focal-spot radii at 1/e² intensity.
- **0.8** (2026-07-19): every canonical shot now retains its complete
  `metadata.target` block as JSON in the shot-aligned
  `/entry/shots/target_metadata_json` bridge column. `/entry/sample` remains
  the first-target campaign snapshot for standard `NXsample` consumers; a
  warning identifies nonuniform campaigns. The additive shot-table column
  also bumps the bridge layout to `hzdr-canonical-shot-v2`.
- **0.7** (2026-07-19): the first non-null synthetic golden-domain run exposed
  strict pynxtools warnings hidden by sparse fixtures. The laser probe constant
  is now the standard `NXsource.probe` enum value `"visible light"`;
  per-diagnostic `damnit_source` and `coordinates` attributes are declared
  in the application definition; and the undocumented custom `NXdata`
  description attribute was removed. Target, vacuum, diagnostic data paths and
  canonical units are otherwise unchanged.
- **0.6** (2026-07-18): the application definition now covers the whole
  canonical entry, not just `/entry/sample`: optional
  `/entry/instrument/laser` (`NXsource` + nested `beam` `NXbeam` +
  `shot_series` `NXdata`), `/entry/sample/environment` (`NXenvironment`),
  per-diagnostic and per-product-kind `NXdetector` groups, and the new
  standard `NXentry` fields `start_time`/`end_time` (earliest/latest shot
  `fired_at`, refreshed on rebuild under a `damnit_source="shots"` marker).
  Semantic maps for the non-target namespaces are documented in the new
  companion [nexus-semantic-maps.md](nexus-semantic-maps.md). The `NX_class`
  swap decision (§6) is closed: the compatibility value `"NXsample"` is
  permanent. The `diagnostic.*` registry namespace gained binding key/unit
  entries (`METADATA_KEY_REGISTRY`) and a linter warning for unregistered
  diagnostic keys. `/entry/sample` group semantics (§2/§3) are unchanged
  except the version value itself.
- **0.5** (2026-07-17): `target.type` (target-ontology.md §3, the ontology's
  only *required* classification key) is now written to `/entry/sample/type`.
  Standard `NXsample.type` field name with HZDR enum values
  (`foil`/`gas_jet`/`cluster`/`liquid`/`structured`/`other`); the NXDL
  enumerates them, so certification catches out-of-vocabulary producers.
- **0.4** (2026-07-15): `target.material` now routes to the free-text
  profile-extension dataset `material` instead of `chemical_formula`, because
  real inventory values are mostly trade names ("Formvar"), layer lists
  ("Si, Cu") or gas mixtures rather than CIF formulas. `chemical_formula`
  (standard NXsample) is written **in addition** only when the value parses
  as a plain element-symbol formula (writer check `_is_chemical_formula()`).
- **0.3** (2026-07-13): canonical unit string for `target.temperature`
  changed `"C"` → `"degC"` (UDUNITS/pint-parseable; `"C"` reads as coulomb),
  letting the NXDL keep the standard `NX_TEMPERATURE` units category.
- **0.2** (2026-07-13): `/entry/definition = "NXhzdr_target"` stamped by
  `write_nexus_bridge()`; profile encoded as the NXDL application definition
  `hzdr/nxdl/NXhzdr_target.nxdl.xml`. §2/§3 sample-group semantics unchanged.
- **0.1** (2026-07-02): first drafted version.

## 5. Known deviations

- **`/entry/instrument/laser/beam` nests `NXbeam` inside `NXsource`.**
  `write_nexus_laser_group()` writes `/entry/instrument/laser` as `NXsource`
  and then a `beam` sub-group as `NXbeam` *underneath* it. Upstream NeXus
  convention more commonly places `NXbeam` as a sibling under `NXinstrument`,
  or attaches it under `NXsample` (the beam incident on the sample). HZDR's
  nesting groups the beam with its originating source instead, which reads
  naturally for a single-laser beamline but is not the most common upstream
  pattern. **Accepted and encoded since v0.6** — the NXDL's scope now covers
  the instrument groups and deliberately models `beam` as a nested `NXbeam`
  inside the laser `NXsource`, so the deviation is a documented, certified
  part of the profile rather than an unmodelled gap. Moving the beam group
  would be a semantic-map change requiring a version bump.

The former beam-waist label mismatch is resolved in v0.9. Facility-signed
`laser.beam_waist_x` and `laser.beam_waist_y` values are written as explicit
`beam_waist_x_1e2_radius` and `beam_waist_y_1e2_radius` datasets; generic
`NXbeam.extent` semantics are not used.

No other deviations are tracked in v0.11.

## 6. Future work

- ✅ **NXDL formalization — done in v0.2 (2026-07-13).**
  `hzdr/nxdl/NXhzdr_target.nxdl.xml` encodes §2/§3 as an application
  definition (NXentry + optional `sample: NXsample`; all sample fields
  optional because the writer skips absent keys; `damnit_nx_class` /
  `damnit_nxdl_version` required with enumerated values). Validation is
  bundled via nexus-design-studio:
  `nds validate <file.nxs> --pynxtools --definitions hzdr/nxdl` overlays this
  directory onto pynxtools' NeXus definitions and certifies each entry against
  the `/entry/definition` it declares. The open `prop_*` attribute bag is
  modelled as the partial-name attribute `prop_KEY` (type
  `NX_CHAR_OR_NUMBER`). Since v0.3 the registry's canonical temperature unit
  string is `"degC"` (not `"C"`, which unit-aware validators parse as
  coulomb), so `temperature` carries the standard `NX_TEMPERATURE` units
  category.
- ✅ **`NX_class="NXhzdr_target"` decision — closed in v0.6 (2026-07-18):
  keep `NX_class="NXsample"` permanently.** Rationale: the profile identity
  is already carried twice, machine-readably — `/entry/definition`
  (certified by the NXDL) and the `damnit_nx_class` group attribute — so
  swapping or double-stamping `NX_class` would add no validation power;
  it *would* break any generic NeXus/HELPMI consumer that dispatches on
  `NX_class == "NXsample"`, which is exactly the compatibility this profile
  promises (§1). HDF5 attributes hold one value, so "both classes" is not
  expressible without inventing a list convention no standard reader
  understands. Revisit only if NIAC ever standardizes a target class, which
  would be a new profile major version anyway.
- ✅ **`type` field — done in v0.5 (2026-07-17).** `metadata.target.type`
  (target-ontology.md §3) is written as the `/entry/sample/type` dataset;
  the NXDL enumerates the six ontology values.
- ✅ **NXDL scope beyond the sample group — done in v0.6 (2026-07-18).**
  The application definition now models the laser `NXsource`/`NXbeam`/
  `NXdata` groups, the vacuum `NXenvironment` group, the diagnostic /
  data-product `NXdetector` groups, and `start_time`/`end_time`; semantic
  maps in [nexus-semantic-maps.md](nexus-semantic-maps.md).
- **NeXus Ontology URIs.** Route 4 (standards-alignment.md) calls for
  annotating covered fields with `nexusformat/NeXusOntology` URIs where they
  exist; §2's "Upstream NeXus field?" column (and its counterpart columns in
  nexus-semantic-maps.md) is the starting point for that pass. Deliberately
  deferred until a federated-search consumer (e.g. the PaN portal) exists.

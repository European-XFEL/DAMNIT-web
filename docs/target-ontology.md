# Target / Sample Ontology (`metadata.target.*`)

Updated: 2026-06-26

The authoritative definition of the **target (sample) sub-schema** that DAMNIT
captures per shot, how MediaWiki-curated targets and hand-entered ("OTHER")
targets share one namespace, how units are encoded, and how the fields map onto
NeXus `NXsample` / HELPMI `TargetClasses`.

This document is the *fine-grained* companion to the target rows in
[standards-alignment.md §3.4](standards-alignment.md#34-target--sample) and is the
binding key registry for [alignment-implementation-plan.md Phase 2](alignment-implementation-plan.md#phase-2--target--sample-metadata-from-labfrog).
All target fields live inside the free-form `metadata` object of the
[`hzdr-event-v1`](event-schema.md) envelope — **no transport-schema change and no
`hzdr-event-v2` bump** is required to adopt this ontology.

---

## 1. Where targets come from

In LabFrog the operator picks a target for a campaign/shot in one of two ways,
and the ontology records which:

1. **Selected from the MediaWiki target catalog** (`provenance = "wiki"`). The wiki
   page is the curated record, so the target carries *more than a name* — at least
   `material` and `thickness`, and for some entries additional structured detail
   (geometry, substrate, supplier/batch, gas parameters). DAMNIT keeps a link back
   to the wiki page so the curated record stays reachable.
2. **Entered by hand via the "OTHER" form** (`provenance = "manual"`). The operator
   fills `name`, `material`, `thickness`, and `notes` (and may add any other typed
   field). There is no wiki page behind it; `wiki_page`/`wiki_ref` stay null.

Both paths write the **same** `metadata.target` object. "OTHER" is not a separate
schema — it is simply `provenance = "manual"`.

## 2. The schema

`metadata.target` is a JSON object. Known keys are typed below; **unknown curated
keys are not dropped** — they go in `properties` (§4) so a richer wiki record
round-trips losslessly and can be promoted to a typed key later.

### 2.1 Core (present on essentially every target)

| Key | Type | Required | Meaning | NeXus / HELPMI |
| --- | --- | --- | --- | --- |
| `type` | str enum | yes | Target class — see §3 | `NXsample.type` / HELPMI `TargetClasses` |
| `name` | str | yes | Display / catalog label (the wiki selection, or the OTHER name) | `NXsample.name` |
| `provenance` | str enum | yes | `wiki` \| `manual` — curated vs hand-entered | `NXsample` `@damnit_provenance` |
| `material` | str \| null | no | Chemical formula or material name (`"Au"`, `"CH2"`, `"mylar"`) | `NXsample.chemical_formula` |
| `thickness` | number \| null | no | Foil/film thickness — **bare number, unit in §5** | `NXsample.thickness` |
| `notes` | str \| null | no | Free operator text | `NXsample.description` / `NXnote` |
| `wiki_page` | str \| null | no | MediaWiki page title the target was selected from; null for `manual` | — |
| `wiki_ref` | str \| null | no | Resolved URL or stable id of the wiki target record; null for `manual` | `NXsample` `@target_ref` |

### 2.2 Extended physical (present when the wiki record or operator provides them)

| Key | Type | Meaning | NeXus / HELPMI |
| --- | --- | --- | --- |
| `diameter` | number \| null | Target diameter / lateral extent | — |
| `substrate_material` | str \| null | Backing/substrate (structured targets) | `NXsample.substrate_material` |
| `temperature` | number \| null | Sample temperature at shot time | `NXsample.temperature` |
| `gas_species` | str \| null | Gas-jet / cluster species (`"Ar"`, `"N2"`, `"He"`) | — |
| `gas_pressure` | number \| null | Gas backing pressure | `NXsample.gas_pressure` |

All numeric values are **bare** (no unit suffix in the key); their canonical units
are fixed in §5 and stamped as NeXus `@units` only at write time.

## 3. `type` enumeration

| Value | Use | Relevant extended fields |
| --- | --- | --- |
| `foil` | Solid foil / film | `material`, `thickness`, `diameter`, `substrate_material` |
| `gas_jet` | Gas jet | `gas_species`, `gas_pressure` |
| `cluster` | Cluster source | `gas_species`, `gas_pressure` |
| `liquid` | Liquid jet / sheet | `material`, `thickness` |
| `structured` | Micro-structured / patterned | `material`, `thickness`, `substrate_material`, `properties.geometry` |
| `other` | None of the above | any; describe in `notes` / `properties` |

`type` selects which extended fields are meaningful; fields that don't apply stay
absent or `null` rather than spawning a separate per-type schema.

## 4. The `properties` extension bag

Because curated wiki records vary ("most have material and thickness; others have
more details"), any structured attribute that does **not** have a typed key above
goes into an open sub-object:

```jsonc
metadata.target.properties = {
  "supplier": "Goodfellow",
  "batch": "AU-2024-117",
  "areal_density_mg_cm2": 9.65,
  "geometry": "grating, 200 nm pitch"
}
```

Rules:
- `properties` is free-form (string→JSON value). It is the *only* place new
  un-modeled fields are allowed, keeping the typed namespace clean.
- A value that recurs across campaigns should be **promoted** to a typed key in §2
  (and removed from `properties`) in a later revision of this doc.
- Unit-bearing values in `properties` keep the `_unit` suffix in their key (e.g.
  `areal_density_mg_cm2`) since there is no typed `@units` mapping for them yet.

## 5. Units convention

**Decision:** numeric target fields are stored as **bare numbers**; the unit is
*not* encoded in the key name. The canonical unit below is what producers must
write the value in, and the NeXus writer stamps it as the standard `@units`
attribute (matching how `hzdr_nexus.py` already attaches `units` to data products).

| Field | Canonical unit (value as written) | NeXus `@units` | Note |
| --- | --- | --- | --- |
| `thickness` | nm | `nm` | `NX_LENGTH` |
| `diameter` | mm | `mm` | |
| `temperature` | °C | `C` | NeXus `NXsample.temperature` is K; the writer may also emit a K-converted dataset with `@units="K"` |
| `gas_pressure` | bar | `bar` | |

This supersedes the unit-suffixed names (`thickness_nm`, `diameter_mm`, …) shown in
[standards-alignment.md §3.4](standards-alignment.md#34-target--sample); that table
is kept for the HELPMI cross-walk but the *stored* key is the bare name here.

## 6. Examples

**Wiki-selected foil** (curated, extra detail in `properties`):

```jsonc
"metadata": {
  "target": {
    "type": "foil",
    "name": "Au 5 µm #A12",
    "provenance": "wiki",
    "wiki_page": "Target_Au_5um_A12",
    "wiki_ref": "https://wiki.hzdr.de/index.php/Target_Au_5um_A12",
    "material": "Au",
    "thickness": 5000.0,
    "diameter": 3.0,
    "properties": { "supplier": "Goodfellow", "batch": "AU-2024-117" }
  }
}
```

**"OTHER" hand-entered target** (manual, the four form fields):

```jsonc
"metadata": {
  "target": {
    "type": "other",
    "name": "test wedge",
    "provenance": "manual",
    "material": "Al",
    "thickness": 250.0,
    "notes": "stepped wedge, ad-hoc mount"
  }
}
```

## 7. Migration from the legacy flat `target` string

The emulator and early exports set `metadata.target` to a plain string
(`"target-1"`). Readers must tolerate both shapes:

- **String** `metadata.target = "X"` → normalize to
  `{ "name": "X", "type": "other", "provenance": "manual" }`.
- **Object** → validate against §2.

The normalizer in `hzdr_event.py` should perform this widening so downstream
consumers (catalog, NeXus writer, UI) only ever see the object form. This is a
read-side widening, not a transport-schema change.

## 8. NeXus mapping (`/entry/sample`, `NXsample`)

When `write_nexus_sample()` is added (alignment plan Phase 3) it reads
`metadata.target.*` and writes:

| `metadata.target` key | `NXsample` field | Attribute |
| --- | --- | --- |
| `name` | `name` | |
| `material` | `chemical_formula` | |
| `thickness` | `thickness` | `@units="nm"` |
| `diameter` | `diameter` | `@units="mm"` |
| `temperature` | `temperature` | `@units` per §5 |
| `gas_pressure` | `gas_pressure` | `@units="bar"` |
| `substrate_material` | `substrate_material` | |
| `notes` | `description` | |
| `provenance` | — | `@damnit_provenance` |
| `wiki_ref` | — | `@target_ref` |
| `properties.*` | — | written as group attributes, prefixed `prop_` |

The group gets `NX_class="NXsample"` (or HELPMI `NXtarget` once that base class is
published — see [standards-alignment.md Route 2](standards-alignment.md#route-2-nxlaser-and-nxtarget-groups-in-the-nexus-bridge-medium-effort)).

---

## Status

| Item | Status |
| --- | --- |
| Target ontology (`metadata.target.*`) defined — core + extended + `properties` | ✅ this doc |
| Units = bare key + NeXus `@units` | ✅ decided |
| Provenance (`wiki`/`manual`) + `wiki_ref` first-class | ✅ decided |
| Legacy string→object normalizer in `hzdr_event.py` | ⬜ Phase 2 |
| LabFrog export carries target fields | ⬜ Phase 2 (sibling repo) |
| `write_nexus_sample()` (`NXsample`) reads `metadata.target.*` | ⬜ Phase 3 |
| Target→wiki link surfaced in API/UI | ⬜ optional |

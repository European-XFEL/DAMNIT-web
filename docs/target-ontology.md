# Target / Sample Ontology (`metadata.target.*`)

Updated: 2026-07-03

The authoritative definition of the **target (sample) sub-schema** that DAMNIT
captures per shot, how MediaWiki-curated targets and hand-entered ("OTHER")
targets share one namespace, how units are encoded, and how the fields map onto
NeXus `NXsample`, the HZDR-local `NXhzdr_target` profile, and HELPMI `TargetClasses`.

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
   page is the curated record, so the target carries *more than a name*. On the
   real FWK wiki the catalog is the Cargo table `IonenTargetOrigin` (see §2.3):
   `material` is reliably available (from the structured `element` column), but
   **thickness is usually free text** embedded in the name/description
   ("0.4 µm Al foil") at the TargetOrigin level, not a structured field — expect
   `thickness` to often stay null for wiki targets, with the human-readable value
   preserved in `name`/`notes`/`properties`. Some entries carry additional
   structured detail (status, provider, amount, documentation). DAMNIT keeps a
   link back to the wiki page so the curated record stays reachable.
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

### 2.3 Mapping the wiki target catalog (`IonenTargetOrigin`)

The FWK wiki's target catalog is the Cargo table `IonenTargetOrigin`
(columns: `name`, `description`, `documentation`, `status`, `element`, `type`,
`provider`, `responsible`, `pages`, `amount`; target pages live in the `Ionen:`
and `HIBEF:` namespaces). Wiki-provenance targets map onto this ontology as:

| Wiki column | Ontology key | Note |
| --- | --- | --- |
| `name` | `name` | often embeds thickness as free text ("0.4 µm Al foil") |
| `element` | `material` | the reliable structured material source |
| `type` | `type` | vocabulary mismatch — see below |
| `description` | `notes` | free text |
| page title | `wiki_page` | e.g. `Ionen:1,1%Formvar062022` — contains `%`/commas; URLs must be percent-encoded (see [mediawiki-integration.md](mediawiki-integration.md) §2) |
| page URL | `wiki_ref` | supplied by the producer, passed through verbatim downstream |
| `provider` | `properties.supplier` | |
| `status` | `properties.status` | e.g. `available` / `dumped` |
| `amount` | `properties.amount` | free text ("ca. 20 pieces") |

The wiki `type` vocabulary (foil/wire/wafer/solution/…) does not match the §3
enum one-to-one. Mapping guidance — don't over-engineer, map the obvious ones
and fall back to `other` with the original value kept in `properties.wiki_type`:
`foil` → `foil`; `wafer` → `foil` (or `structured` if patterned);
`solution` → `liquid` (jet/sheet use) or `other`; `wire` → `other`;
anything unrecognized → `other`.

The exported LabFrog SQLite columns carrying these extras are
`target_wiki_page`, `target_wiki_ref`, `target_status`, `target_provider`,
`target_amount` (labfrog-sqlite-tools schema v9); DAMNIT's reconciler folds
them into `metadata.target.*` per this table. LabFrog does not yet persist
them per shot record — until it does, wiki-provenance targets arrive with
name/material/thickness/notes only.

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

**Decided 2026-07-02:** the bare-key + out-of-band-unit convention is now
family-wide, not just `metadata.target.*` — it also applies to
`metadata.laser.*` and `metadata.vacuum.*`, superseding suffixed keys like
`pulse_energy_j`. The canonical unit per key is fixed in the metadata key
registry (see [CLAUDE.md](../CLAUDE.md)); the NeXus writer stamps it as
`@units` as above, and the SQLite export carries it in the existing `units`
table (already part of the labfrog-sqlite-tools schema) rather than in the
column name. The `properties` extras bag (§4) keeps the `_unit`-suffix
convention since its keys have no registry entry.

## 6. Examples

**Wiki-selected foil** (curated, extra detail in `properties`):

```jsonc
"metadata": {
  "target": {
    "type": "foil",
    "name": "Au 5 µm #A12",
    "provenance": "wiki",
    "wiki_page": "Ionen:1,1%Formvar062022",
    "wiki_ref": "https://athene.fz-rossendorf.de/fwk/index.php?title=Ionen:1%2C1%25Formvar062022",
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

## 8. NeXus mapping (`/entry/sample`, `NXsample` + `NXhzdr_target`)

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

The low-risk compatibility group keeps `NX_class="NXsample"` so standard NeXus tooling
can still read the file. HELPMI is finished (2026-07-02) and will publish no official
`NXtarget`, so HZDR can define its own local target class/profile instead of waiting:
`NXhzdr_target`.

Do **not** use the unqualified `NXtarget` name locally; it looks official and could
conflict with a future upstream NeXus class. **Done 2026-07-02:** the v0.1 profile
document, [docs/nxhzdr-target-profile.md](nxhzdr-target-profile.md), defines the
semantic map and compatibility-attribute contract, and `write_nexus_sample()` stamps
`damnit_nx_class="NXhzdr_target"` and `damnit_nxdl_version` (module constant
`HZDR_TARGET_PROFILE_VERSION` in `hzdr_nexus.py`, currently `"0.1"`) on `/entry/sample`
while leaving `NX_class="NXsample"`. NXDL formalization is still open — once a local
NXDL is bundled with a validator, we can decide whether HZDR-profile files should set
`NX_class="NXhzdr_target"` directly (see nxhzdr-target-profile.md §6).
HELPMI DDC names remain the documentation cross-walk; see
[standards-alignment.md Route 2](standards-alignment.md#route-2-nxsource-nxbeam-and-nxsample-groups-in-the-nexus-bridge-ready).

---

## Status

| Item | Status |
| --- | --- |
| Target ontology (`metadata.target.*`) defined — core + extended + `properties` | ✅ this doc |
| Units = bare key + NeXus `@units` | ✅ decided |
| Provenance (`wiki`/`manual`) + `wiki_ref` first-class | ✅ decided |
| Legacy string→object normalizer (`_normalize_target_metadata`, called from `hzdr_nexus._normalize_event`) | ✅ done 2026-07-02 |
| LabFrog export carries captured target fields | ✅ done 2026-07-02 |
| DAMNIT reconciler maps exported LabFrog target columns to `metadata.target.*` | ✅ done 2026-07-02 |
| `write_nexus_sample()` (`NXsample`) reads `metadata.target.*` | ✅ done 2026-07-02 |
| HZDR-local `NXhzdr_target` profile / NXDL drafted | 🟡 v0.1 doc + compatibility attrs done 2026-07-02 ([nxhzdr-target-profile.md](nxhzdr-target-profile.md)); NXDL formalization still open — Phase 5 |
| Target→wiki link surfaced in API/UI (`target_wiki_ref` / `target_wiki_page`, table + shot detail links) | ✅ done 2026-07-02 |
| Wiki catalog (`IonenTargetOrigin`) → ontology mapping documented (§2.3); SQLite v9 extras columns mapped by the reconciler | ✅ implemented locally 2026-07-03 |
| LabFrog persists wiki extras (`wiki_page`/`wiki_ref`/status/provider/amount) per shot | ⬜ open (labfrog) |

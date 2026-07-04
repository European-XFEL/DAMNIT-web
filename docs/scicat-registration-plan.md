# SciCat registration plan

**Status:** 🟡 planned · **Roadmap item:** "Register the canonical campaign NeXus
file in SciCat and back-populate `payload_ref.scicat_pid`" · **Effort:** Low–Medium ·
Companion to [integration-roadmap.md §SciCat Registration](integration-roadmap.md#scicat-registration)
and [standards-alignment.md §3.9](standards-alignment.md).

## Problem

`scicat_pid` exists only as a *reserved* passthrough field
(`metadata/hzdr_event.py:97`, read into the NeXus bridge at
`metadata/hzdr_nexus.py:1908`). No code registers anything in SciCat. The
`scicat_plugin` HTTP sink already exists and is live; the schema hook is reserved.
What is missing is the DAMNIT-side POST that turns each built campaign NeXus file
into a citable SciCat dataset and stores the returned PID — the FAIR "one dataset
per campaign" record that is the payoff of the whole pipeline.

The integration boundary is an **HTTP POST**, not an import: the plugin is Flask,
DAMNIT is FastAPI. Registering is path-and-metadata only — SciCat forbids binary
upload — which is exactly what a per-campaign NeXus file needs.

## Design

A **builder post-step**, off the go-live critical path, that runs only when a
SciCat plugin URL is configured. It degrades to a no-op when unconfigured, so
existing builds are unaffected.

1. **`HZDRScicatSettings` (`DW_API_HZDR_SCICAT__*`)** — `enabled`, `plugin_url`,
   `endpoint` (`from-json` for the simple path, `push` for rebuild-aware
   versioning), `instrument_id`, `owner_group`/`access_groups` overrides,
   `timeout`, `dataset_type`. **No SciCat URL or token in DAMNIT** — those stay in
   the plugin's own env, per the `CLAUDE.md` secrets boundary. DAMNIT only knows
   the plugin's HTTP address.
2. **`metadata/scicat.py`** — a small `register_campaign_nexus(nexus_path,
   experiment_id, source_key, scientific_metadata, settings)` helper that assembles
   the §3.9 `RawDataset` fields (`proposalId`=`experiment_id`, `instrumentId`,
   `scientificMetadata`=the campaign metadata dict, `sourceFolder`=`damnit_path`)
   and `POST`s `{filepath, meta, …}` to `<plugin_url>/scicat/from-json`
   (or `/scicat/push`). Returns `{pid, version_hash?}` or `None` on failure —
   registration failure must **never** fail the build.
3. **Builder wiring** — after `write_sources_catalog` in
   `hzdr-hdf5-builder.py`, call the helper when enabled, then persist the returned
   `pid` (and `version_hash` for `/scicat/push`) into the source catalog so it
   flows back as `payload_ref.scicat_pid`. When using `/scicat/push`, store
   `version_hash` and skip re-registration on a byte-identical rebuild.
4. **API surface** — expose a SciCat dataset link alongside the existing wiki link
   (mirror the `GET /metadata/hzdr/sources/{key}/wiki` endpoint pattern), so the
   frontend can render "View in SciCat" next to "View wiki page".

## Configuration (`DW_API_HZDR_SCICAT__*`)

| Setting | Default | Purpose |
| --- | --- | --- |
| `ENABLED` | `false` | Master switch |
| `PLUGIN_URL` | — (required when enabled) | Base URL of the `scicat_plugin` service |
| `ENDPOINT` | `from-json` | `from-json` (simple) or `push` (version-hash aware) |
| `INSTRUMENT_ID` | `""` | SciCat `instrumentId` |
| `OWNER_GROUP` / `ACCESS_GROUPS` | — | optional overrides; plugin env supplies defaults |
| `DATASET_TYPE` | `raw` | SciCat dataset type |
| `TIMEOUT` | `10.0` | POST timeout seconds |

## Deliverables

- `HZDRScicatSettings` + `Settings.hzdr_scicat` wiring, documented in
  `.env.production.example`.
- `metadata/scicat.py` registration helper (never raises into the build).
- Builder post-step + catalog persistence of `scicat_pid` / `version_hash`.
- API endpoint + frontend link surfacing the SciCat dataset.
- Tests: a unit test with the plugin HTTP call mocked (always runs); a gated
  integration test that runs only when a plugin URL + token are configured,
  mirroring the broker-test gating.

## Sequencing

Independent of, and lower priority than, the auto builder-trigger. It slots in
cleanly *after* the trigger lands, because the natural place to register is the
same builder post-publish point the trigger already invokes — so an auto-triggered
build can register with SciCat automatically once both are in place.

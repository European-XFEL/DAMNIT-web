# MediaWiki Campaign Link Integration

Updated: 2026-07-03

The read-only MediaWiki link built into every campaign source: how `experiment_id`
maps to a wiki page, how to configure it, the API endpoint, and how to extend it.

Related docs: [event schema](event-schema.md) (where `experiment_id` comes from),
[target-ontology.md](target-ontology.md) §2/§4 (wiki target catalog mapping).

---

## 1. What it does

Every HZDR source (campaign) has a corresponding MediaWiki page that was the origin
of its `experiment_id`. The MediaWiki integration in DAMNIT provides:

1. **A stable, clickable URL** to that page for every campaign displayed in the UI.
2. **Live metadata** (page existence, last-modified date, categories) fetched from the
   MediaWiki Action API on demand.

This is a read-only, one-way link. DAMNIT does not write to the wiki and does not
require MediaWiki credentials. The wiki is treated as a reference source, not a
synchronized store.

## 2. How `experiment_id` maps to a wiki page

The department wiki (FWK wiki, base URL `https://athene.fz-rossendorf.de/fwk`)
keeps campaign/beamtime pages in the **`FWKT:` namespace** (category
`FWKTBeamtime`). The `experiment_id` carried in events is the *bare* slug
(`Solenoid_Beamline_Tests_01.2025`), so it is **not** the full page title —
`FWKT:Solenoid_Beamline_Tests_01.2025` is. Set `DW_API_HZDR_WIKI__NAMESPACE`
to have DAMNIT prepend the namespace; identifiers that already contain a
namespace prefix (a `:`) are used as-is. If a source provides
`metadata.wiki_page_title`, DAMNIT treats it as the full MediaWiki title and does
not prepend `DW_API_HZDR_WIKI__NAMESPACE`.

The derived URL uses the **query form** and percent-encodes the title (the
namespace colon is kept readable — MediaWiki accepts it raw):

```
experiment_id:  Solenoid_Beamline_Tests_01.2025
page title:     FWKT:Solenoid_Beamline_Tests_01.2025      (namespace = FWKT)
page URL:       {wiki_base_url}/index.php?title=FWKT:Solenoid_Beamline_Tests_01.2025
API query:      {wiki_base_url}/api.php?action=query&prop=info&titles=FWKT:Solenoid_Beamline_Tests_01.2025&format=json
```

The query form is used (rather than the path form `/index.php/{title}`) because
real page titles in the target namespaces contain `%`, commas and dots (e.g.
`Ionen:0.4%Formvar092022`, `Ionen:1,1%Formvar062022`) — naive path
concatenation produces broken links, and the canonical URLs on the FWK wiki are
query-form anyway. The `fetch=true` API probe passes the (namespaced) title as
an httpx query parameter, which handles the encoding itself — the title is not
pre-encoded there to avoid double-encoding.

A `metadata.wiki_page_url` field on the source overrides the derived URL if the
operator has set a more specific link (e.g. a section anchor or a different wiki).
The override is used verbatim — no namespace or encoding is applied to it. Pair it
with `metadata.wiki_page_title` when the API probe should use a full saved title
that differs from the derived `experiment_id` title.

## 3. Configuration

Set `DW_API_HZDR_WIKI__BASE_URL` to the root of the MediaWiki installation and
`DW_API_HZDR_WIKI__NAMESPACE` to the campaign-page namespace:

```bash
DW_API_HZDR_WIKI__BASE_URL=https://athene.fz-rossendorf.de/fwk
DW_API_HZDR_WIKI__NAMESPACE=FWKT      # optional; prepended to bare experiment_ids
DW_API_HZDR_WIKI__FETCH_TIMEOUT=5.0   # optional, default 5.0 s
# Optional for fetch=true against login-required wikis; keep real values in .env/instance config only.
DW_API_HZDR_WIKI__COOKIE_HEADER=""         # e.g. copied browser Cookie header
DW_API_HZDR_WIKI__AUTHORIZATION_HEADER=""  # e.g. Bearer/proxy token if available
```

Without `BASE_URL`, the endpoint returns `configured: false` and no URL — useful in
local-only or offline environments where the wiki is not reachable.

**Login-required wikis:** the FWK wiki requires a logged-in browser session even
for reads. `fetch=true` stays anonymous by default and may fail (or report the
page as missing) against such a wiki; this degrades gracefully - the live fields
stay null and the link is still returned. To enable an authenticated read-only
probe, set either `DW_API_HZDR_WIKI__COOKIE_HEADER` (full copied browser `Cookie`
header) or `DW_API_HZDR_WIKI__AUTHORIZATION_HEADER` (for a proxy/bot token scheme)
in the API `.env` or instance config. These values are secrets and are only sent
as outbound headers to `{base_url}/api.php`; they are not returned by the API.

**Pilot prerequisite:** for the `Pilot_Verification_07.2026` campaign an operator
must create the `FWKT:Pilot_Verification_07.2026` page on the FWK wiki *before*
the pilot, or the derived link will 404 (and `fetch=true` will report
`exists: false`).

## 4. API endpoint

```
GET /metadata/hzdr/sources/{source_key}/wiki
GET /metadata/hzdr/sources/{source_key}/wiki?fetch=true
```

Response (`HZDRWikiInfo`):

| Field | Type | Description |
| --- | --- | --- |
| `source_key` | str | The source this wiki link belongs to |
| `experiment_id` | str \| null | The campaign identifier used to derive the page title |
| `page_title` | str \| null | MediaWiki page title (`metadata.wiki_page_title`, or namespaced when `NAMESPACE` is set) |
| `page_url` | str \| null | Full URL to the wiki page; null when `BASE_URL` is not configured |
| `configured` | bool | Whether `DW_API_HZDR_WIKI__BASE_URL` is set |
| `exists` | bool \| null | Whether the page exists on the wiki (only when `fetch=true`) |
| `last_modified` | str \| null | ISO-8601 last-modified time from the wiki (only when `fetch=true`) |
| `page_id` | int \| null | MediaWiki numeric page ID (only when `fetch=true`) |
| `categories` | list[str] | Categories the page belongs to (only when `fetch=true`) |

The `fetch=true` variant makes a live HTTP call to the MediaWiki Action API with
`DW_API_HZDR_WIKI__FETCH_TIMEOUT` as the timeout. If the wiki is unreachable (or
rejects unauthenticated reads), the fields that require a live call are returned
as null rather than raising an error — the URL link is still usable.

Implementation: `get_hzdr_source_wiki` in `api/src/damnit_api/metadata/routers.py`;
settings in `HZDRWikiSettings` (`api/src/damnit_api/shared/settings.py`); tests in
`api/tests/test_hzdr_wiki.py`.

## 5. What the real wiki provides

The FWK wiki is a MediaWiki with SemanticMediaWiki, **Cargo** and Page Forms.
Beamtime pages are templated (fields: Identifier, Topic, PI, Team, DateStart,
DateEnd, Accessmode, Shortdescription, Chamber, Laser, Color) and queryable via
`action=cargoquery`. The target catalog lives in the Cargo table
**`IonenTargetOrigin`** (columns: `name`, `description`, `documentation` [File],
`status`, `element`, `type`, `provider`, `responsible` [List of Page], `pages`
[List of Page], `amount`), with the page hierarchy IonenTargetOrigin →
IonenTarget → IonenTargetCarrierType → IonenTargetHolder → IonenTargetAssembly.
Target pages live in the `Ionen:` and `HIBEF:` namespaces. For structured reads
(campaign fields, target catalog rows), `action=cargoquery` is the better future
path than `prop=extracts` scraping — see the status table.

**Per-shot target wiki links** (`target_wiki_ref`/`target_wiki_page` on
`HZDRShot`) are *pass-throughs* from producer metadata (`metadata.target.wiki_ref`
/ `.wiki_page`): neither the API nor the frontend builds those URLs by string
concatenation, so the producer (LabFrog) is responsible for supplying a valid,
correctly encoded URL in `wiki_ref`. See
[target-ontology.md](target-ontology.md) §2.

## 6. Extending the integration

**Structured reads via Cargo:** `action=cargoquery` against the beamtime table or
`IonenTargetOrigin` returns typed fields (PI, dates, target status/provider/…)
instead of parsed page text. Optional, post-pilot.

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
(`FWKT:Solenoid_Beamline_Tests_01.2025/Day_1/Shot_042`), the shot detail endpoint
could derive those links from the shot key. Not implemented; pattern would be
`{base_url}/index.php?title={page_title}/{shot_key}` (encoded).

---

## Status

| Item | Status |
| --- | --- |
| `GET /metadata/hzdr/sources/{key}/wiki` endpoint | ✅ implemented and committed |
| `DW_API_HZDR_WIKI__BASE_URL` configuration | ✅ implemented and committed |
| `DW_API_HZDR_WIKI__NAMESPACE` / `metadata.wiki_page_title` + query-form, percent-encoded URLs | ✅ implemented and committed |
| Tests for wiki link, optional API fetch, and configured auth headers | ✅ implemented and committed |
| Operator: create `FWKT:Pilot_Verification_07.2026` page before the pilot | ⬜ operator action (see fwkt-webapps hzdr/docs/operations/outstanding-work.md) |
| `action=cargoquery` structured reads (beamtime fields, IonenTargetOrigin) | ⬜ optional, post-pilot |
| `prop=extracts` campaign abstract in UI | ⬜ optional |
| Authenticated write-back of run summary | ⬜ not planned (wiki is operator's record) |
| Per-shot / per-day wiki sub-page links | ⬜ optional |

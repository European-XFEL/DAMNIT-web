# MediaWiki Campaign Link Integration

Updated: 2026-06-26

The read-only MediaWiki link built into every campaign source: how `experiment_id`
maps to a wiki page, how to configure it, the API endpoint, and how to extend it.

Related docs: [event schema](event-schema.md) (where `experiment_id` comes from).

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

## 3. Configuration

Set `DW_API_HZDR_WIKI__BASE_URL` to the root of the MediaWiki installation:

```bash
DW_API_HZDR_WIKI__BASE_URL=https://wiki.hzdr.de
DW_API_HZDR_WIKI__FETCH_TIMEOUT=5.0   # optional, default 5.0 s
```

Without `BASE_URL`, the endpoint returns `configured: false` and no URL — useful in
local-only or offline environments where the wiki is not reachable.

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

Implementation: `get_hzdr_source_wiki` in `api/src/damnit_api/metadata/routers.py`;
settings in `HZDRWikiSettings` (`api/src/damnit_api/shared/settings.py`); tests in
`api/tests/test_hzdr_wiki.py`.

## 5. Extending the integration

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

## Status

| Item | Status |
| --- | --- |
| `GET /metadata/hzdr/sources/{key}/wiki` endpoint | ✅ committed |
| `DW_API_HZDR_WIKI__BASE_URL` configuration | ✅ committed |
| Tests for wiki link and optional API fetch | ✅ committed |
| `prop=extracts` campaign abstract in UI | ⬜ optional |
| Authenticated write-back of run summary | ⬜ not planned (wiki is operator's record) |
| Per-shot / per-day wiki sub-page links | ⬜ optional |

# UI critique and optimization plan (space + usability)

Branch: `claude/ui-critique-optimization-qs2bof`
Scope: `frontend/apps/app/src/` — HZDR pages and components only. Keep changes
minimal and behavior-preserving (see CLAUDE.md conventions). Mantine v7 idioms.

This document is self-contained: each work package (WP) lists the files, the
concrete changes, and acceptance criteria, so any agent can pick one up
independently. Execute WPs in order — WP2 and WP3 touch the same files.

## Critique summary

Findings from reading `app.tsx`, `AppHeader.tsx`, `ShotPage.tsx`,
`ShotTable.tsx`, `SourceHome.tsx`, `LinkRecordsPage.tsx`, `FlowMonitorPage.tsx`,
`ContextBuilderPage.tsx`, `DocsPage.tsx`, `previews.tsx`.

### Navigation
1. **Full page reloads on every nav click.** `AppHeader` and many in-page
   buttons use `<Button component="a" href="...">`, bypassing react-router.
   Every navigation reloads the whole SPA (all state, all fetches). Should use
   client-side navigation (`react-router` `Link` / `useNavigate`).
2. **No active-route indication** in the header — users can't tell which page
   they're on.
3. **Docs page is unreachable from the header** (`/docs` only linked from the
   home cards); Context builder is only reachable from deep inside ShotPage.

### ShotPage (`/source/:source_key`) — the main working screen
4. **Fixed table height `h={520}`** wastes space on tall screens and is too
   tall on small ones. Should size to viewport (e.g. `calc(100vh - <chrome>)`).
5. **Sidebar `Grid.Col span={{ base: 12, xl: 2 }}`** — at xl the right panel
   (Selected cell, Shot sets, Shot detail — dense forms) gets ~2/12 of the
   width: forms wrap badly, JSON blocks unreadable. Below xl it drops under a
   520 px-tall table, requiring long scrolls. A 9/3 or 8/4 split at `lg` is
   more usable.
6. **View state is ephemeral.** Filter, sort, hidden columns, selected shot are
   plain `useState` — lost on any navigation/reload (aggravated by finding 1).
   Persist per-source in `localStorage` (small patch; the server-side
   `/metadata/hzdr/views` API exists but is a larger integration).
7. **Header card overhead**: the source header card (title + badge + blurb +
   `Code` path + source Select) spends ~140 px before any data. Can compress to
   one row.
8. **Duplicated column definitions**: `filterColumnOptions` /
   `tableColumnOptions` and the six hand-written `SortableHeader`/`Table.Td`
   blocks repeat widths and labels — one column-spec array should drive
   headers, cells, filter options, visibility, and `tableMinWidth`.
9. **No loading/error feedback**: all `fetch`es lack `.catch`/loading state; a
   failing API leaves a silently empty table.

### LinkRecordsPage
10. **Three static "1. Search / 2. Link / 3. Review" explainer cards** consume
    a full row before the actual controls; collapse to a compact one-line
    stepper or dimmed text.
11. **Raw JSON dump** (`<Code block>` of the whole draft) dominates the page,
    unbounded height; actions ("Search", "Build review package") sit *below*
    it, so they drift off-screen as the draft grows. Show a compact summary
    (counts, sources, campaign), put the JSON in a collapsed
    `DetailsSection`/ScrollArea, and move buttons above.

### SourceHome / DocsPage
12. SourceHome polls every 5 s but shows no fetch-failure state (only
    `console.error`).
13. DocsPage repeats the three-card explainer pattern (acceptable there — it is
    a docs page — leave unless trivial).

### Cross-cutting
14. `DetailsSection` uses a native `<details>` with no chevron affordance
    beyond the marker and no consistent spacing; fine to keep, but unify usage.
15. Repeated inline `radius={4} p="md"` cards everywhere — acceptable; don't
    churn.

## Work packages

### WP1 — Client-side navigation + header usability
**Files:** `frontend/apps/app/src/hzdr/components/AppHeader.tsx`, plus in-page
nav buttons in `ShotPage.tsx`, `SourceHome.tsx`, `DocsPage.tsx`,
`ShotTable.tsx` (Context "Build column" button), `LinkRecordsPage.tsx`.

- Replace `component="a" href` with react-router navigation for **internal**
  routes only (`Link` from `react-router` via `component={Link} to=...`;
  external links like wiki refs and `/api-docs` stay `<a>`).
- In `AppHeader`, add an active state: compare `useLocation().pathname` and
  set `variant="light"` (active) vs `variant="subtle"` (inactive) on each nav
  button.
- Add a "Docs" nav button (IconBook) to `AppHeader`.
- Do not change routes or the shared `@damnit-frontend/ui` package.

**Acceptance:** navigating between header pages does not reload the document
(no full refresh); current section visually indicated; `pnpm --filter
@damnit-frontend/app run lint:eslint` and `test` pass.

### WP2 — ShotPage space optimization
**Files:** `frontend/apps/app/src/hzdr/pages/ShotPage.tsx`,
`frontend/apps/app/src/hzdr/components/ShotTable.tsx` (only if needed).

- Introduce a single `SHOT_TABLE_COLUMNS` spec array
  (`{ value, label, width }`) that derives `filterColumnOptions`,
  `tableColumnOptions`, `tableMinWidth`, header rendering, and the checkbox
  group — removing the duplicated literals. Context columns keep their
  dynamic append. **Behavior-preserving refactor**; keep widths identical
  (note the existing 110 vs 146 target-width inconsistency at lines ~539/690 —
  unify to 146 and mention it in the commit message).
- Table height: replace `ScrollArea h={520}` with a viewport-relative height,
  e.g. `style={{ height: 'calc(100vh - 340px)', minHeight: 320 }}` on the
  ScrollArea (or `mah`/`h` with the same calc). Verify no double scrollbars.
- Grid split: change `span={{ base: 12, xl: 10 }}` / `{{ base: 12, xl: 2 }}`
  to `{{ base: 12, lg: 9 }}` / `{{ base: 12, lg: 3 }}` so the side panel is
  usable and appears beside the table from `lg` up.
- Compress the source header card: title + badge + source Select on one row
  (`Group justify="space-between"`), path `Code` and blurb on a second line;
  target ≤ ~90 px tall.
- Persist per-source view state in `localStorage` under key
  `hzdr:shot-table-view:<source_key>`: `{ filterColumn, filterOperator,
  filterValue, sortState, hiddenTableColumns }`. Load on mount (guard against
  malformed JSON), save on change (a small `useEffect`). Selected shot stays
  ephemeral.
- Add characterization tests first where cheap: extend
  `components/__tests__/ShotTable.test.tsx` or add
  `pages/__tests__/ShotPage.test.tsx` covering column option derivation and
  the localStorage round-trip helper (extract pure helpers into
  `utils/table-view.ts` to keep them testable).

**Acceptance:** identical visible columns/labels/widths by default; view
settings survive a reload; `lint:eslint`, `lint:tsc`, `test` pass; no new
hook-dependency warnings (fix properly, don't suppress).

### WP3 — Loading & error feedback
**Files:** `ShotPage.tsx`, `SourceHome.tsx`, `LinkRecordsPage.tsx` (fetch
paths), optionally a tiny shared helper in `hzdr/utils/api.ts`.

- Extend `requireJson` usage (already in `utils/api.ts`) to the bare fetches in
  `ShotPage.tsx` (`loadShotPageData`, shot-detail effect) with `.catch` setting
  an error string state.
- ShotPage: add `loading` state for the shots list → show a Mantine
  `Skeleton`/`Loader` row inside the table area; on error show an `Alert`
  (Mantine) with retry button instead of an empty table. Keep it minimal — one
  `dataState: 'loading' | 'ready' | 'error'` per page, not per request.
- SourceHome: surface polling failure as a small dimmed inline `Alert`
  ("Could not reach the API — retrying") that clears on next success; keep
  `console.error`.
- Empty-state text when a source has zero shots ("No shots yet for this
  source.") in the table body.

**Acceptance:** with the API stopped, each page shows a readable error instead
of blank content; lint + tests pass.

### WP4 — LinkRecordsPage layout economy
**Files:** `frontend/apps/app/src/hzdr/pages/LinkRecordsPage.tsx`.

- Replace the three explainer cards with a single compact line (e.g. dimmed
  `Text`: "1 Search → 2 Link → 3 Review" with one sentence), or a Mantine
  `Stepper` with `size="xs"` if it stays one row tall.
- Link-draft card: move the "Search visible records" / "Build review package"
  buttons and the `searchStatus` line **above** the JSON; render a compact
  summary line (records count, searched sources, campaign title) and put the
  full JSON inside a `DetailsSection` (import from `../components/ShotTable`)
  wrapped in `ScrollArea.Autosize mah={320}`.
- No logic changes to `buildLinkRecordsDraft`/`buildLinkRecordsReviewPackage`;
  `utils/__tests__/link-records.test.ts` must keep passing.

**Acceptance:** search/build controls visible without scrolling on a 1080p
viewport with a large draft; lint + tests pass.

### WP5 — Verification pass (coordinator)
- `cd frontend && pnpm install` (if needed), then per app:
  `pnpm --filter @damnit-frontend/app run lint:eslint`, `lint:tsc`, `test`.
- `pnpm run lint` at repo root if configured.
- Visual smoke via `pnpm run dev:app` where possible.
- Squash-review the diff for accidental behavior changes; push.

## Commit conventions
One commit per WP, message prefix `ui:` (e.g. `ui: client-side nav + active
state in AppHeader (WP1)`). Push to
`claude/ui-critique-optimization-qs2bof` after each WP so partial progress
survives session loss.

## Status

Update this list as WPs land (check the box, note the commit hash).

- [x] Plan written and pushed
- [ ] WP1 — navigation
- [ ] WP2 — ShotPage space
- [ ] WP3 — loading/error feedback
- [ ] WP4 — LinkRecords layout
- [ ] WP5 — verification

# UI and API backlog (from the 2026-11-21 handoff)

Working list for the web UI and the API routes it polls. Items are done a
couple at a time, each batch committed and pushed. Tick an item when it is
merged on the branch, with its commit.

Rule from the maintainer: clean up around the shot table, never redesign it.

## From the handoff

- [x] **Home summary route.** `GET /metadata/hzdr/source-summaries?since=`
  returns counts only; Home polls it instead of every shot of every campaign.
- [x] **"Add as column" for shot containers** (`<YYYYMMDD>_<NNNNNN>/...`): a
  context-variable input for "this shot's container" (API) plus a
  `{container}` template in `utils/hdf5.ts` (`hdf5PerShotTemplateName`).
  Before containers go live. Done: `meta#shot_container` in
  `contextfile/routers.py` (`shot_container_link`), the `{container}`
  template, and a templated column skips a shot without the dataset.
- [x] **Phone-width CI check:** an e2e at 390 px that fails on horizontal
  scroll. Done: `frontend/e2e/tests/app/hzdr/phone-width.spec.ts` (Home,
  Flow monitor, Review matches, Docs, the shot table), HZDR routes mocked
  in `frontend/e2e/support/hzdr.ts`; runs in CI's existing e2e job.
- [x] **Saved views as chips.** Named views (filter, sort, columns) on the
  existing `GET/POST/DELETE .../sources/{key}/views`, as chips above the
  quick filters; hidden where the API keeps no views (Mongo).
- [x] **CSV export.** "Download CSV" beside Add columns: the rows the table
  shows, in its order, visible columns, `shot_key` first; text that would
  start a spreadsheet formula gets a leading apostrophe.
- [x] **Trends for context columns and a second value.** Numeric context
  columns are trend values too; **Compare with** draws a second value over
  the same shots on its own right-hand axis (dashed, teal).
- [x] **Highlight new shots.** A quick-filter chip, "New since your last
  visit N": shots fired after the newest one this browser showed on the
  last visit to the campaign (one number per campaign in localStorage).
  The table itself is unchanged; the page does not poll for shots.
- [ ] Reset or delete branch `claude/dazzling-noether-br3edr` on GitHub
  (needs the maintainer: a force-push or delete).
- [x] shotcounter MR !1: stays open and parked (maintainer, 2026-11-21);
  not closed.

## Found along the way

- [x] Review matches (`utils/review.ts`) still loads the full sources list
  to pick the busiest campaign; it could open on the summaries and fetch
  only the chosen campaign. Done: it reads the summaries (which gained
  `experiment_id`) and no longer fetches every campaign's review to count.

- [x] The shot page's campaign strip says "No shots yet." whenever no shot
  names a data source (`summarizeShotDataSources`), even with shots in the
  table; it should say that no data source is known yet.

## Suggestions (agreed 2026-11-21)

- [x] **Flow monitor and ShotPage off the full list.** Flow monitor polls
  `GET /metadata/hzdr/sources` to count shots; ShotPage fetches it only for
  the campaign switcher. Both can read the summaries. Done; the summary
  gained `latest_shot_number` for Flow monitor's next shot.
- [x] **Cache the catalog in the API, modestly.** Every request parses
  `hzdr_sources.json` again. Keep the *one* most recent parse per file,
  reused while the file's size, mtime and inode stay the same; no per-request
  or per-campaign copies, no unbounded maps. Mongo is not cached.
  Done: `hzdr_sources.load_sources_file`; a file changed in the last 2 s is
  always re-read (timestamps can be too coarse to see a quick rewrite).
- [x] **Pause polling in a hidden tab, back off on failures.** Home and Flow
  monitor poll every 5 s even in the background and keep retrying at 5 s
  when the API is down. Done: `usePolling` in `hooks.ts` (Home, Flow
  monitor's sources and its live health/activity poll), doubling the wait
  on a failure up to 60 s.
- [x] **"Waiting" agrees with Review matches.** Home counts every
  `unassigned` shot; Review matches leaves out shots with a pending
  experiment ruling. The summary route subtracts them.
- [x] **Unparseable shot times are visible.** A `fired_at` the API cannot
  parse is skipped silently; count it in the summary. Done:
  `unreadable_times`, a grey badge on the Home row.
- [x] **Version endpoint.** Expose the API version and git commit, so the
  frontend can warn when it is deployed without its matching API. Done:
  `GET /config/version` (commit read once at start-up), the build's
  `VITE_DAMNIT_COMMIT`, a header badge from `sm` up.
- [x] **End-to-end smoke test of Home** against the local acceptance stack,
  next to the phone-width check. Done, mocked rather than against the
  acceptance stack (CI has no API): `tests/app/hzdr/home.spec.ts` checks
  Home reads the summary route and never the full list.

## Notes for the next session

- **e2e here:** the e2e package pins Playwright 1.64, the container's
  Chromium is 1.63's (`/opt/pw-browsers/chromium`). Run locally through a
  throwaway config next to `playwright.config.ts` that spreads it and sets
  `use.launchOptions.executablePath` to that path; do not commit it. Four
  upstream table specs (`resize-past-last-column`, `scrollbar-drag`) fail
  that way on `main` too; CI's own browser is the reference.
- **HZDR e2e mocks** (`frontend/e2e/support/hzdr.ts`) match `/metadata/` and
  `/config/` at the URL root only: the dev server serves modules such as
  `.../data/metadata/metadata.slice.ts`, which a looser pattern breaks.
- **Browser pass on the real stack:** import
  `hzdr/scripts/capture-screenshots.py`, set `OUT_DIR` and `RECEIPT_PATH` to
  a scratch folder, replace `SHOTS` with `Shot(..., prepare)` hooks, and call
  `capture()` (Node 24 on `PATH`, `HZDR_CHROMIUM_EXECUTABLE`). Record
  requests with `page.on("request")` and a reload: the resource-timing
  buffer fills with Vite modules.
- **Mantine Chip** inputs are visually hidden: in Playwright click the label
  text, not `get_by_role("checkbox")`.
- **Catalog cache:** `load_sources_file` returns shared models. Copy before
  changing one (`model_copy`); never modify in place.

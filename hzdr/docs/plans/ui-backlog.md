# UI and API backlog (from the 2026-11-21 handoff)

Working list for the web UI and the API routes it polls. Items are done a
couple at a time, each batch committed and pushed. Tick an item when it is
merged on the branch, with its commit.

Rule from the maintainer: clean up around the shot table, never redesign it.

## From the handoff

- [x] **Home summary route.** `GET /metadata/hzdr/source-summaries?since=`
  returns counts only; Home polls it instead of every shot of every campaign.
- [ ] **"Add as column" for shot containers** (`<YYYYMMDD>_<NNNNNN>/...`): a
  context-variable input for "this shot's container" (API) plus a
  `{container}` template in `utils/hdf5.ts` (`hdf5PerShotTemplateName`).
  Before containers go live.
- [ ] **Phone-width CI check:** an e2e at 390 px that fails on horizontal
  scroll.
- [ ] Trends for context columns and a second value; highlight new shots;
  saved views as chips; CSV export.
- [ ] Reset or delete branch `claude/dazzling-noether-br3edr` on GitHub
  (needs the maintainer: a force-push or delete).
- [ ] shotcounter MR !1: today's handoff says close it, the 2026-11-12 combo
  handoff says "parked". Maintainer to decide.

## Suggestions (agreed 2026-11-21)

- [ ] **Flow monitor and ShotPage off the full list.** Flow monitor polls
  `GET /metadata/hzdr/sources` to count shots; ShotPage fetches it only for
  the campaign switcher. Both can read the summaries.
- [ ] **Cache the catalog in the API, modestly.** Every request parses
  `hzdr_sources.json` again. Keep the *one* most recent parse per file,
  reused while the file's size, mtime and inode stay the same; no per-request
  or per-campaign copies, no unbounded maps. Mongo is not cached.
- [ ] **Pause polling in a hidden tab, back off on failures.** Home and Flow
  monitor poll every 5 s even in the background and keep retrying at 5 s
  when the API is down.
- [ ] **"Waiting" agrees with Review matches.** Home counts every
  `unassigned` shot; Review matches leaves out shots with a pending
  experiment ruling. The summary route subtracts them.
- [ ] **Unparseable shot times are visible.** A `fired_at` the API cannot
  parse is skipped silently; count it in the summary.
- [ ] **Version endpoint.** Expose the API version and git commit, so the
  frontend can warn when it is deployed without its matching API.
- [ ] **End-to-end smoke test of Home** against the local acceptance stack,
  next to the phone-width check.

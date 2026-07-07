See CLAUDE.md

## Cross-repo testing notes

- Before changing sibling repos, check each sibling's `git status --short` and
  treat existing dirty files as user-owned.
- For the current HZDR coverage gaps, `hzdr/docs/status/testing.md` maps "Needs attention"
  to `asapo-for-hzdr-damnit` and the DAQ File Watchdog/laserdata side in
  `planet-watchdog`.
- In `asapo-for-hzdr-damnit`, target tests at the local broker HTTP API and CLI
  flow: publish, claim, ack, consume, reset, LaserData JSONL staging, and replay
  deduplication.
- In `planet-watchdog`, target the GUI panels/controls bucket with headless
  tests around helper/state methods instead of opening Tk windows.
- Sibling repos sit outside this repo's normal writable root, so use scoped
  approval for edits or test runs that must write there.

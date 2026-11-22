# Deploy notes (fwkt-webapps)

What to do on the server for each change that needs a step there, newest
first. The full checklist with background is
[next-on-server.md](next-on-server.md); this page is the short version to
follow at the keyboard. Run everything as `tippey`; use sudo only for
`systemctl`.

## DAMNIT PR #57 and #58 (2026-11-22)

Deploy them together, once both are merged on `main`. damnit-api becomes
**0.3.2**, and every new API field is additive.

### 1. Settings first, in `~/DAMNIT-web-hzdr/api/.env`

Set these before the deploy, so that the rebuild in step 2 uses them:

```bash
# shot-aligner's decisions as DAMNIT's evidence (rulings R-2026-11-22a/b):
DW_API_HZDR_BUILDER__ALIGNER_INDEX_DIR=/home/tippey/shot-aligner/shot_aligner/index

# Leave this off (the default): on real shot days it mispairs watchdog files.
# DW_API_HZDR_BUILDER__TIME_MATCH_ONE_TO_ONE=false

# Once the test-fire kinds are known (Review matches > Unmatched):
# DW_API_HZDR_BUILDER__NEVER_SHOT_KINDS=["draco.test_fire"]
```

Check that these are already set:
`DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE=Europe/Berlin` and
`DW_API_HZDR_BUILDER__CAMPAIGN_SCHEDULE`.

### 2. Deploy

```bash
bash ~/DAMNIT-web-hzdr/hzdr/scripts/next-on-server.sh            # look only: changes nothing
bash ~/DAMNIT-web-hzdr/hzdr/scripts/next-on-server.sh --apply
```

`--apply` does all of this:
- pulls;
- syncs and restarts every unit that runs older code than its checkout;
- rebuilds the frontend if `frontend/` changed, setting
  `VITE_DAMNIT_COMMIT` so the header warns if the API and frontend commits
  ever differ;
- rebuilds the campaigns;
- runs the checks (the `labfrog` step).

### 3. A setting changed later?

A restart builds nothing, so after any later change to `api/.env`:

```bash
sudo systemctl restart damnit-api
cd ~/DAMNIT-web-hzdr/api && uv run --no-sync python scripts/hzdr-rebuild.py
```

A new day index or decision in shot-aligner's index folder needs neither: it
triggers a rebuild by itself.

### 4. Make sure the reviewed days have an index

A reviewed day counts only once shot-aligner has written its
`<date>.index.json`. The `labfrog` step of `next-on-server.sh` lists the
reviewed dates that have no index yet. To build one, open the date in
shot-aligner, or run:

```bash
cd ~/shot-aligner
uv run --no-sync --no-default-groups shot_aligner/scripts/align.py \
    --site fwkt-webapps index <date> --if-changed
```

### 5. Check

- **Score one day.** `attached_wrong` must be 0:
  ```bash
  cd ~/DAMNIT-web-hzdr/api
  uv run --no-sync python scripts/hzdr-evaluate-time-rule.py \
      ~/shot-aligner/shot_aligner/index/<date>.index.json --rule aligner --tolerance 120
  ```
- **In the browser** ([next-on-server.md](next-on-server.md) item 6):
  - the shot page shows new shots without a reload;
  - Review matches says "Why it waits" for every waiting event;
  - files a reviewer confirmed in shot-aligner show the match "Confirmed in
    shot-aligner by a reviewer";
  - "Confirm clear time cases" lists triggers only, never files.
- **The `labfrog` step** of `next-on-server.sh` reports:
  - the campaign schedule;
  - whether the one-to-one rule is off;
  - the shot-aligner index folder.

### 6. If something is wrong

- **Remove `ALIGNER_INDEX_DIR`** from `api/.env`, restart and rebuild. Files
  the bridge attached return to review. Nothing was stored as a decision, so
  nothing needs undoing.
- **A bad pairing** comes from shot-aligner. Fix it there (reject or redo
  the link), and DAMNIT follows at the next build.

### 7. GitLab, after the deploy

- Merge hzdr-combo !117, which records rulings R-2026-11-21 and R-2026-11-22.
- Merge fwkt-webapps !106 (the DAMNIT project page).

### Not part of this deploy

- **Shot containers** (`CONTAINERS_ENABLED`): only once you decide to turn
  them on, and campaign output phase 6 first ([next-on-server.md](next-on-server.md) item 7).
- **This year's campaigns** (backfill from shot-aligner): waits on two
  decisions, where this year's shot records come from and which campaigns
  go first. That plan comes next.

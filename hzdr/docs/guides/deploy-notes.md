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

The **first** build after this deploy rewrites every campaign once, because
the code that writes them changed. That is expected.

**Quiet builds** ([plan-quiet-builds.md](../plans/plan-quiet-builds.md)): a
campaign whose result has not changed is no longer rewritten on the share.
The build log says `Canonical NeXus (<campaign>): unchanged, not rewritten`.
A new event for today's campaign therefore no longer rewrites Vanlife or any
other old campaign. `hzdr-rebuild.py --force` rewrites them all anyway.

### 3. A setting changed later?

A restart builds nothing, so after any later change to `api/.env`:

```bash
sudo systemctl restart damnit-api
cd ~/DAMNIT-web-hzdr/api && uv run --no-sync python scripts/hzdr-rebuild.py
```

A new day index or decision in shot-aligner's index folder needs neither: it
triggers a rebuild by itself.

### 4. Make sure the reviewed days have an index

A day counts only once shot-aligner has written its `<date>.index.json`.
A confirmation made after that counts too, without rewriting the index, as
long as the event still has the Count it was confirmed against. That is
shot-aligner's own rule: it uses the decision's `matched_count` to see whether
the pairing has moved since. The `labfrog` step of `next-on-server.sh` lists the
reviewed dates that have no index yet. To write one, use the date's
**Write index JSON** task in shot-aligner (opening a date does not write it),
or run:

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

### 7. Vanlife from shot-aligner (the first campaign of this year)

DAMNIT builds a campaign LabFrog has no records of from shot-aligner's day
indexes. The Shotsheet rows become the shots and the acquisitions become the
files. The bridge then attaches what a reviewer confirmed. See
[plan-campaign-backfill.md](../plans/plan-campaign-backfill.md).

1. **In `api/.env`,** with `ALIGNER_INDEX_DIR` from step 1. In multi-campaign
   mode a listed campaign is built even without an export or a spool:
   ```bash
   DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS={"Vanlife_12.2025": ["2025_12_01", "2025_12_02", "2025_12_03", "2025_12_05"]}
   ```
   Restart `damnit-api` if it was running already.
2. **See where it stands.** This changes nothing:
   ```bash
   cd ~/DAMNIT-web-hzdr/api
   uv run --no-sync python scripts/hzdr-campaign-backfill.py
   ```
   It prints one line per date:
   - the age of the index, or `MISSING`;
   - reviewed, as links confirmed out of links;
   - Shotsheet rows, and whether DAMNIT's stored copy is current;
   - the shots, files attached and files waiting in DAMNIT's catalog.

   Then it names the next step.
3. **Run the steps:**
   ```bash
   uv run --no-sync python scripts/hzdr-campaign-backfill.py --apply \
       --aligner-build /home/tippey/mnt/bigdata/HPLexp/Ions/nexus/<Vanlife build>
   ```
   `<Vanlife build>` is shot-aligner's container folder for that campaign
   (`ls /home/tippey/mnt/bigdata/HPLexp/Ions/nexus`). Leave the flag out to
   skip the compare.
   It runs, in order, and stops at the first failure, naming it:
   - shot-aligner's `align.py index` for each date that has no index;
   - the rebuild (`hzdr-rebuild.py`);
   - the container worker, and one more build to link its containers;
   - the compare against shot-aligner's containers (only with
     `--aligner-build`);
   - the report again.

4. **Check in the browser:** open Vanlife, select a 12-03 shot, and preview
   a camera frame from its container (the side panel lists
   `<stem>/...` datasets). The frames are there only after the worker ran
   with the raw files, which is step 3.
5. **Package it** (plan-campaign-package). This writes `PACKAGE.json`,
   `README.md` and NDS's verdict beside the master, and copies nothing:
   ```bash
   uv run --no-sync python scripts/hzdr-package-campaign.py \
       --master /home/tippey/mnt/bigdata/HPLexp/nexus/Vanlife_12.2025/Vanlife_12.2025.nxs \
       --validate-python <nds>/.venv/bin/python --checksums
   ```
   - The validation comes from `VALIDATION_PYTHON` in `api/.env`, or from
     `--validate-python`. Without either the package says *not validated*.
   - `--checksums` reads every file once and writes `SHA256SUMS`.
   - `--tar <path>.tar` also writes one archive.
   - `hzdr-campaign-backfill.py --apply --package` does the plain version
     (no checksums, no archive) after its other steps.

   To hand the campaign out, copy the campaign folder, or give the `.tar`.
   Open the master with `silx view`, and one container with h5web or myhdf5.
6. **Review in shot-aligner what the report says still waits.** Only 12-03
   is confirmed so far. A confirmed day attaches at the next build, which a
   new decision triggers by itself. Run the report again to see it.

The exit status is 0 when all is well, 1 when a date has no index or a step
failed, and 2 when the settings are missing.

**To take it out:** remove `ALIGNER_CAMPAIGNS` and rebuild. The shots and
files were made at build time from the indexes, so nothing else is stored.
The campaign's old NeXus file stays until it is removed by hand. Never
delete anything else under the output root, which is shared with
shot-aligner.

### 8. GitLab, after the deploy

- Merge hzdr-combo !117, which records rulings R-2026-11-21 and
  R-2026-11-22a to h.
- Merge fwkt-webapps !106 (the DAMNIT project page).

### Not part of this deploy

- **Shot containers: keep `CONTAINERS_ENABLED` off.** With it on, the
  container worker checks every raw file on bigdata before and after every
  build, for every campaign. For this year's campaigns the console script
  runs the worker only when you ask (`--apply`). Turning it on later is the
  go-live checklist ([next-on-server.md](next-on-server.md) item 7, phase 6
  first).
- **More of this year's campaigns:** each is one more entry in
  `ALIGNER_CAMPAIGNS`, once its days are indexed and reviewed in
  shot-aligner.

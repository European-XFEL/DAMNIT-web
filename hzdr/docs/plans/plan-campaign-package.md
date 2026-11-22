# Plan: a campaign packaged on bigdata, ready to hand out

Branch `claude/peaceful-babbage-p1jot4` (PR #58). Same format: rulings
first, a box ticked in the commit that does the work.

## Rulings (maintainer, 2026-11-22)

- **R-2026-11-22i: packaging.** A way to export ready NeXus files from
  DAMNIT. "It doesn't have to be in the browser, but at least on bigdata or
  similar", and renderable in a browser the way shot-aligner's are: h5web
  or myhdf5 for one container, silx for the master.
- **R-2026-11-22h still holds:** little reading across drives. A package
  must not copy gigabytes or read every file unless asked.

## Decisions

- **P1: the campaign folder is the package; nothing is copied by default.**
  `<OUTPUT_ROOT>/<campaign>/` already holds the master and `shots/`, with
  relative links, so copying that folder is a complete export.
  `api/scripts/hzdr-package-campaign.py --master <campaign>.nxs` makes the
  folder self-describing by writing three small files beside the master:
  - **`PACKAGE.json`**, the manifest:
    - the campaign, built at, damnit-api version and commit, bridge profile;
    - every file with its size and mtime: the master and each container it
      links;
    - links that do not resolve (a package with one is refused);
    - the validation result;
    - sha256 only with `--checksums`.
  - **`README.md`**, how to open it:
    - silx for the master; h5web or myhdf5 for one container (they read
      one file whole and do not follow links);
    - what `/entry/shots` and the containers hold;
    - where the data came from (LabFrog, Shotsheet, shot-aligner), from the
      master's `experiment_id_source` counts;
    - the validation outcome.
  - **`SHA256SUMS`**, only with `--checksums`, in `sha256sum -c` format.
- **P2: validation through NDS, when it is there.** With `--validate-python
  <nds>/.venv/bin/python` (default: `DW_API_HZDR_BUILDER__VALIDATION_PYTHON`
  from `api/.env`), the script runs `hzdr-nexus-validate.py --master` and puts
  its result in `PACKAGE.json` and `README.md`. If the gate fails (exit 1),
  the package is written marked **not valid**, and the script exits 1. If the
  gate cannot run (exit 2, or no NDS Python), the package says *not
  validated*.
- **P3: one archive on request.** `--tar <path>` writes
  `<campaign>.tar` (uncompressed: HDF5 is compressed already). It holds the
  master, `shots/*.nxs` for the linked containers, and the three files, under
  `<campaign>/`, so unpacked it opens the same. This is the one option that
  reads and writes every byte.
- **P4: the console script offers it.** `hzdr-campaign-backfill.py --apply
  --package` packages each campaign after its steps (no checksums, no tar).
- **P5: nothing private.** The manifest holds paths relative to the
  campaign folder, sizes and hashes; no settings, hosts or users.

## Checklist

- [x] Plan written first (this file)
- [x] **P1 to P3:**
  - `hzdr-package-campaign.py`;
  - tests: the manifest and README on a built fixture campaign; a dangling
    link refused; `--checksums` (`sha256sum -c` format); `--tar` (unpacked,
    the master's links resolve and h5py follows them); the validation
    outcomes (passed, failed, not run) with the gate replaced by a stub.
- [x] **P4:** `--package` in the console script; a test.
- [x] **Run for real here** on Vanlife 12-03: build, containers, package
      with `--checksums --tar`, then open the unpacked master with h5py
      through its links.
- [x] **Docs:**
  - `deploy-notes.md` step 7 (package Vanlife, and check a container
    preview in the shot panel);
  - `operations.md`, `CLAUDE.md`, `hzdr/CHANGELOG.md`, the docs index.
- [x] **Gates:** ruff, pyright (193), pytest, acceptance.
- [x] **GitLab notes, PR description.**

## Results

- **Run for real here:** Vanlife 12-03, built and with its containers
  written by the console script, then
  `hzdr-package-campaign.py --checksums --tar`:
  - the package: 150 shots, 150 containers, 12.9 MB (the containers hold no
    frames here, because the raw files are on bigdata);
  - unpacked, `sha256sum -c SHA256SUMS` passes, and h5py follows the
    master's link into a container;
  - `hzdr-campaign-backfill.py --apply --package` packages after its steps
    and exits 0.

  NDS is not installed here, so the verdict was "not validated". The three
  outcomes are tested with the gate replaced by a stub.
- **Tests:** 6 in `test_hzdr_package_campaign.py`:
  - the manifest and README;
  - a dangling link refused;
  - checksums and the tar unpacked and followed;
  - valid, not valid and not validated.

  Also 1 more in `test_hzdr_campaign_backfill.py` (`--package` as step 5).
- **Gates:**
  - ruff is clean;
  - pyright is at 193;
  - pytest: 1,141 passed, 33 skipped;
  - local acceptance is all OK, and `--real-topology` passed.

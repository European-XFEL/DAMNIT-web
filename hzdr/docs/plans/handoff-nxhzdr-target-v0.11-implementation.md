# Handoff: implementing NXhzdr_target v0.11

**Done 2026-11-27** on branch `feat/nxhzdr-target-v0.11`: see [plan-nxhzdr-target-v0.11-implementation.md](plan-nxhzdr-target-v0.11-implementation.md). The record became a root entry, `/pump_probe` (D0). The cross-repo list below is still open.

Written 2026-11-27 for the next session. **Start here**, then read the plan,
[nxhzdr-target-v0.11-draft.md](nxhzdr-target-v0.11-draft.md) (DAMNIT PR #62;
both rulings made). Nothing of the implementation is written yet: the session
that wrote this stopped after reading the schema.

## Where things stand

- **Rulings (maintainer, 2026-11-27):**
  - **R-2026-11-27a:** shots without an authority number go to
    `pump_probe/events_unidentified`, never dropped. `events` holds only the
    shots the shot authority numbered.
  - **R-2026-11-27b:** the 12 proposed keys are accepted for now.
- **Draft definition:** `hzdr/docs/plans/drafts/NXhzdr_target-v0.11-draft.nxdl.xml`.
  - It validates against `nxdl.xsd` (nexusformat/definitions `3b20fbc`;
    fetch `nxdl.xsd` and `nxdlTypes.xsd` from raw.githubusercontent.com, which
    this cloud environment can reach, and validate with lxml).
  - It only adds to v0.10: the one changed line is the version enumeration.
- **The schema** is on hzdr-combo `main` (merged in !149),
  `combo/planning/papers/daphne-laser/schema/`:
  - `NXlaser_pump_probe.nxdl.xml` (the core application definition);
  - `NXsynchronization.nxdl.xml` (a base class, so all its fields are optional
    on their own);
  - `sites/NXlaser_pump_probe_hzdr_draco.nxdl.xml` (HZDR's site definition,
    which extends the core);
  - `check_schema.py` and `examples.py` (checks and example files).
- **What stays as it is:** the bridge profile is `hzdr-canonical-shot-v8`, and
  the `/entry/shots` columns do not change.

## Do first

1. **Write the implementation plan before any code** (the convention of every
   plan in this folder: rulings, decisions, a checklist ticked in the commit that
   does the work), as `plan-nxhzdr-target-v0.11-implementation.md`. Start the
   branch from DAMNIT `main` once PR #62 is merged, else from
   `docs/nxhzdr-target-v0.11-draft`.
2. **Close the gaps below in the plan** before writing the subentry.

## Gaps the plan does not cover yet (found 2026-11-27)

What the core `NXlaser_pump_probe` **requires** (no `optional`/`recommended`),
against what the plan's section 3 says the subentry holds:

| Required by the core | In the plan? | Proposal |
| --- | --- | --- |
| `definition` | yes | `NXlaser_pump_probe_hzdr_draco` |
| `title`, `start_time` | **no** | soft links to `/entry/title`, `/entry/start_time` |
| `events/@axes` | **no** | `"shot_key"` (or `"identifier"`): check `examples.py` for the convention |
| `events/identifier` + `@issuer` | yes | the numbered shots only, as datasets (R-2026-11-27a) |
| `source_pump/name`, `type`, `associated_beam` | links only | links to `/entry/instrument/laser/{name,type}`; `associated_beam = "beam_pump"` |
| `source_probe/name`, `type`, `probe`, `associated_beam` | `probe.source`, `probe.type` | `probe` (the NXsource enumeration: `visible light` for the DRACO probe arm?) needs a value; `associated_beam = "beam_probe"` |
| `beam_pump/associated_source`, `incident_wavelength`, `pulse_energy`, `pulse_duration` | links | links to the laser beam fields; check that v0.10 always writes all three, else the subentry cannot be written |
| `beam_probe/associated_source`, `pulse_delay` | `probe.delay` | `associated_source = "source_probe"` |
| `beam_probe/pulse_delay/@reference_beam`, `@synchronization` | **no** | `"beam_pump"` and `"synchronization"`: constants |
| `synchronization/scheme`, `delay_mechanism` | `sync.scheme`, `sync.delay_mechanism` | as planned; if a campaign lacks them, decide: skip the subentry, or write `"unknown"` |
| `sample/name` | link to `/entry/sample` | the link covers it, if v0.10 always writes `sample/name` |

The HZDR site definition adds `events/identifier/@issuer = "HZDR DRACO shot
authority"`, `beam_pump/spot_size/@definition = "1/e^2 intensity radius"`, and
the `sample/target_type` enumeration: `foil`, `gas_jet`, `cluster`, `liquid`,
`structured`, `other`. Check that DAMNIT's target classes map onto it.

**A decision for the plan:** what to do when a campaign has `probe.delay` but
lacks another required item (a sync key, the probe type). Either write no
subentry and report why in the build log, or write it and let validation fail.
The first seems right, since v0.11 promises nothing breaks.

## Where the code is (DAMNIT `main` at `38c9697`)

| What | Where |
| --- | --- |
| Profile version constant | `hzdr_nexus.py`: `HZDR_TARGET_PROFILE_VERSION = "0.10"` (about line 2945) |
| Laser group, Part A's `spot_size`, `polarization_label`, `temporal_contrast` | `write_nexus_laser_group()` (about line 2828); v0.10 already writes `beam_waist_x_1e2_radius`, `incident_polarization`, `contrast_ratio` |
| Sample, Part A's `target_type` | `write_nexus_sample()` (about line 3206); target type from `_map_wiki_target_type` (about line 1016) |
| Where the subentry is called from | `write_nexus_bridge()` (about line 2383) |
| Key registry | `hzdr_event.py`: `METADATA_KEY_REGISTRY` (about line 204) and `METADATA_KEY_VALUES` (about line 339; `laser.amplification_state` gets `full`, `reduced`, `unamplified`) |
| Tests that pin the version | `api/tests/test_hzdr_nexus_sample.py`, `api/tests/test_hzdr_nexus.py` |

## The checklist the implementation needs (plan section 5, with the gaps)

- [ ] Plan written first
- [ ] **Part A** in the writer, with tests: v0.10 layout plus the four fields;
      `temporal_contrast` only with both `laser.contrast_ratio` and
      `laser.contrast_time`
- [ ] **Registry:**
  - the 12 keys with units in `METADATA_KEY_REGISTRY` (ps for
    `laser.contrast_time`, `probe.delay`, `probe.delay_set`, `sync.time_zero`;
    nm for `probe.wavelength`), the enum in `METADATA_KEY_VALUES`;
  - the CLAUDE.md registry table, with a dated paragraph;
  - regenerate the event fixtures (`api/scripts/regen_hzdr_event_fixtures.py`)
    if the schema export changes.
- [ ] **Part B:** `write_pump_probe_subentry()`:
  - links, the probe and sync datasets, the required constants above;
  - the `events` / `events_unidentified` split;
  - skipped with a logged reason when a required item is missing.
- [ ] **Definitions:**
  - copy the draft over `hzdr/nxdl/NXhzdr_target.nxdl.xml`;
  - add `NXlaser_pump_probe.nxdl.xml`, `NXsynchronization.nxdl.xml` and
    `NXlaser_pump_probe_hzdr_draco.nxdl.xml` to `hzdr/nxdl/`;
  - move the draft file out of `plans/drafts/`, or mark it superseded.
- [ ] **Version bump in all three places:**
  - `HZDR_TARGET_PROFILE_VERSION = "0.11"`;
  - `hzdr/docs/nxhzdr-target-profile.md` (§2 map and "Current version");
  - the NXDL enumeration.
- [ ] **Tests:**
  - every shot in exactly one of `events` and `events_unidentified`, with
    no `-1` identifier;
  - no subentry without `probe.delay`, and none when a required item is
    missing;
  - the subentry validates (`HZDR_NDS_PYTHON=<nds python> uv run pytest
    tests/test_hzdr_nexus_validate.py`, where NDS is installed);
  - the docs and alignment tests.
- [ ] **Gates:**
  - ruff;
  - pyright: take the baseline from `main` first;
  - pytest;
  - `hzdr-local-acceptance.py`, both modes.
- [ ] **CHANGELOG** entry; the deploy notes say a rebuild applies v0.11 (code
      changed, so quiet builds publish every campaign once).

## Cross-repo, after the DAMNIT PR (each its own MR)

- **nexus-design-studio:** `profiles/nxhzdr_target.yaml` (rows, units,
  version, `source_ref` pinned to the profile document's commit), and the
  laser profile rows for the new keys.
- **daq-watchdog** (formerly planet-watchdog) and the shotcounter: re-vendor
  `hzdr_event.py` and the event fixtures. `hzdr/scripts/sync-hzdr-event.ps1`
  checks or fixes the copies, and `test-all` stops on drift until they match.
- **hzdr-combo:**
  - `check_alignment.py run --groups ontology` (and `--fix` for the
    mirrors after the bump);
  - record the rulings R-2026-11-27a/b in `NEXT.md`;
  - the schema's own docs, if DAMNIT's subentry changes anything there.
- **An emulator case with a probe delay** (hzdr-combo emulation): optional, but
  the only end-to-end exercise until a laser-probe campaign records
  `probe.delay`.

## Working notes from this session

- **GitLab:** push with
  `git -c credential.helper='!f() { echo username=oauth2; echo "password=$GITLAB_TOKEN"; }; f' push`.
  The API is `https://codebase.helmholtz.cloud/api/v4` with the `PRIVATE-TOKEN`
  header.
- **GitHub:** from the cloud session, deleting a remote branch drops the
  connection. Delete merged branches from the PR page.
- **Frontend checks:** Node 24 is at `/opt/node24/bin`; use `pnpm run lint:tsc`
  (not `tsc -p apps/app`, which checks nothing).

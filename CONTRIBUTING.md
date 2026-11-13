# Contributing

## Development setup

See the [README](README.md) for how to set up and run the project.
`scripts/setup-dev.sh` installs the dependencies and the git hooks.

## How checks run

The git hooks give you fast feedback locally and run in stages:

- On commit: ruff (backend and `scripts/`), eslint and prettier
  (frontend). These lint and auto-format the files you changed. A
  character check also reads them; see below.
- On push: type checks (frontend tsc and Python pyright).
- In CI: every check runs again and gates the merge.

CI is the real gate. The local hooks just let you catch issues before you
push.

## Character check

`scripts/check-characters/check_characters.py` fails on characters that
stand in for plain ASCII (curly quotes, long dashes, the minus sign, the
ellipsis) and on invisible ones. Each hit prints as
`path:line:column U+XXXX (advice)`, where the advice is what to use
instead, `invisible`, or `not UTF-8` when the file was saved in another
encoding. To keep one of these characters on purpose, write it as an
escape, such as `'\u2014'` or `&mdash;`. To check every tracked file, run:

    uv run python scripts/check-characters/check_characters.py

To skip a whole file, such as a generated one that may hold any character,
mark it in `.gitattributes`:

    frontend/pnpm-lock.yaml -check-characters

To skip a folder, write `folder/**`, since `folder` or `folder/` alone
marks no file inside it.

## Bypassing hooks

The hooks are local convenience, not the gate. For a work-in-progress
commit you can skip them:

    git commit --no-verify

CI still runs every check, so nothing slips through.

## Test Coverage Map

Generated from a real pytest-cov run by
[`scripts/docs/refresh_coverage_map.py`](scripts/docs/refresh_coverage_map.py).
Nothing else writes these numbers, and no figure here is typed by hand. The same
block is transcribed onto this project's page in the `fwkt-webapps`
documentation hub, so a stale map here is a stale map there.

Scope is `damnit_api`. The frontend has its own suite and is not measured here.
This is also not [`hzdr/docs/status/testing.md`](hzdr/docs/status/testing.md),
which carries one row *per constellation repository* - that answers "how well
tested is the constellation", this answers "which parts of this API are tested".

<!-- test-coverage-map-start -->

Use this generated map as a quick sense of which parts of the API are well covered before
changing a reconciler, a router, or the NeXus builder. Percentages come from the latest
pytest-cov JSON run over `damnit_api`; the frontend is not measured here.

Overall `damnit_api` line coverage from that run: **87.00%**.

| Area | Coverage | Main tests | Watch next |
| --- | --- | --- | --- |
| HZDR metadata, NeXus and openPMD | <progress value="90" max="100">90%</progress> Strong | `api/tests/test_hzdr_nexus.py`, `api/tests/test_hzdr_nexus_sample.py`, `api/tests/test_hzdr_openpmd_preflight.py`, `api/tests/test_hzdr_event.py`, `api/tests/test_hzdr_sources.py`, `api/tests/test_hzdr_path_map.py`, `api/tests/test_hzdr_reference_fixture.py`, `api/tests/test_hzdr_labfrog_sqlite.py`, `api/tests/test_hzdr_producer_status.py`, `api/tests/test_hzdr_scicat.py`, `api/tests/test_hzdr_scicat_duplicates.py`, `api/tests/test_hzdr_scicat_publishing.py`, `api/tests/test_hzdr_semantic_golden_fixture.py`, `api/tests/test_metadata_keys.py`, `api/tests/test_hzdr_simulation_link.py`, `api/tests/test_hzdr_catalog_publisher.py`, `api/tests/test_hzdr_package_emulator.py`, `api/tests/test_hzdr_integration.py`, `api/tests/test_hzdr_campaign_resolution.py`, `api/tests/test_match_rank_docs.py` | Real SciCat and PID reconciliation, which the offline suite can only emulate |
| HZDR diagnostic packs and shot containers | <progress value="85" max="100">85%</progress> Strong | `api/tests/test_hzdr_compare.py`, `api/tests/test_hzdr_containers.py`, `api/tests/test_hzdr_mapping_rows.py`, `api/tests/test_hzdr_nexus_validate.py`, `api/tests/test_hzdr_packs.py`, `api/tests/test_hzdr_pack_readers.py`, `api/tests/test_hzdr_packs_sync.py` | The vendored files' cv2/nexusformat paths (shot-aligner's, unused here), frame formats the December campaign did not write, and the container worker against a real campaign on the bigdata mount |
| HZDR routers and services | <progress value="81" max="100">81%</progress> Good | `api/tests/test_hzdr_review.py`, `api/tests/test_hzdr_saved_views.py`, `api/tests/test_hzdr_wiki.py`, `api/tests/test_hzdr_screenshot_capture.py` | `services.py` at 16%: the long-running service wiring is exercised only on a deployment |
| Event ingestion (Kafka, ASAPO, spool) | <progress value="90" max="100">90%</progress> Strong | `api/tests/test_hzdr_asapo_externalization.py`, `api/tests/test_hzdr_broker_roundtrip.py`, `api/tests/test_hzdr_builder_trigger.py`, `api/tests/test_hzdr_consumer_bootstrap.py`, `api/tests/test_hzdr_rebuild.py`, `api/tests/test_hzdr_kafka_spool.py`, `api/tests/test_hzdr_multi_campaign.py`, `api/tests/test_hzdr_spool.py` | A live broker: everything here runs against an in-process or emulated one |
| GraphQL and data access | <progress value="91" max="100">91%</progress> Strong | `api/tests/test_data.py` | Subscription lifecycles under a real client, and the schema directives |
| Context file | <progress value="87" max="100">87%</progress> Strong | `api/tests/test_contextfile.py` | Variable evaluation against a real DAMNIT context file on disk |
| Authentication and directory | <progress value="65" max="100">65%</progress> Moderate | `api/tests/test_auth_modes.py` | A real LDAP bind and the OAuth routers, neither reachable from the offline suite |
| App core, database and settings | <progress value="87" max="100">87%</progress> Strong | `api/tests/test_db.py`, `api/tests/test_errors.py`, `api/tests/test_hzdr_config.py`, `api/tests/test_runtime_config.py`, `api/tests/test_hzdr_flow_activity.py`, `api/tests/test_logging_masks.py` | Application startup against a real database, and the ASGI entry point |
| MyMDC integration (vendored upstream) | <progress value="86" max="100">86%</progress> Strong | _no dedicated suite_ | Upstream European XFEL code this deployment does not use; revendor rather than test around it |

<!-- test-coverage-map-end -->

### Coverage commands

```sh
cd api
uv run --group test pytest -q --cov=damnit_api \
    --cov-report=json:../cover/coverage.json
cd ..
uv run --group test python scripts/docs/refresh_coverage_map.py
```

`cover/` is gitignored; only the rendered block above is committed. Add
`--check-only` to fail when the committed map no longer matches the latest run.

**Adding a module means adding it to an area.** `AREAS` in the refresh script is
the mapping from source file to row, and `api/tests/test_coverage_docs.py` fails
if a module or test module belongs to no area and is not listed in one of the
`UNMAPPED_*` sets.

"""Pin the wire shapes the frontend consumes for real data on proposal 6996.

Data comes from the committed fixture DAMNIT database
(`tests/mock/data/gpfs/.../p006996/usr/Shared/amore/runs.sqlite`, see
`make_runs_db.py`) and the recorded MyMdC cassette (`tests/mock/mymdc/`).

Payloads are pinned via syrupy with a small normalization pass first
to avoid precision issues (rounding floats), `tags[*]["variables"]` is sorted (the
underlying SQL has no `ORDER BY`, so row order isn't guaranteed), and the
absolute fixture path is replaced with a placeholder (it varies by checkout
location).

Regenerate with:

```bash
uv run pytest --snapshot-update tests/refactor/e2e/test_data_parity.py
```
"""

import pytest

pytestmark = [pytest.mark.vcr, pytest.mark.asyncio]

PROPOSAL = 6996


def _normalize(value):
    """Round floats and sort dict keys so the persisted snapshot is stable
    across runs regardless of float precision noise or dict iteration order.
    """
    if isinstance(value, float):
        return round(value, 9)
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    return value


def runs_query(proposal: int, *, per_page: int, names: list[str]) -> dict:
    names_arg = ", ".join(f'"{name}"' for name in names)
    return {
        "query": f"""
            query {{
              runs(database: {{proposal: "{proposal}"}}, per_page: {per_page}) {{
                cells(names: [{names_arg}]) {{
                  name value dtype error {{ message cls }}
                }}
              }}
            }}
        """
    }


def metadata_query(proposal: int) -> dict:
    return {
        "query": f"""
            query {{
              metadata(database: {{ proposal: "{proposal}" }}) {{
                runs {{ proposal run }}
                variables
                tags
                timestamp
              }}
            }}
        """
    }


GET_USER_PROPOSALS_QUERY = """
    query {
      get_user {
        proposals {
          number
          cycle
          instrument
          title
          principal_investigator
          proposal_read_only
          damnit_path
          damnit_paths_searched
          year_half
        }
      }
    }
"""


async def test_runs_query_wire_shapes_unchanged(logged_in_client, snapshot):
    names = [
        "proposal",
        "run",
        "start_time",
        "added_at",
        "n_pulses",
        "n_trains",
        "sample_type",
        "sample_x",
        "sample_y",
        "total_transmission",
        "xgm_intensity",
        "xpcs_g2_plot",
    ]
    response = await logged_in_client.post(
        "/graphql", json=runs_query(PROPOSAL, per_page=1, names=names)
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None
    runs = payload["data"]["runs"]
    assert len(runs) == 1

    by_name = {v["name"]: v for v in runs[0]["cells"]}
    assert set(by_name) == set(names)

    # Image variables serialize to a base64 PNG data URI, not raw bytes; pin
    # the prefix directly and replace the value in the snapshot so it isn't
    # pinning the exact rendered image bytes
    image = by_name["xpcs_g2_plot"]
    assert image["dtype"] == "image"
    assert image["error"] is None
    assert image["value"].startswith("data:image/png;base64,")
    by_name["xpcs_g2_plot"] = {**image, "value": "<png-data-uri>"}

    assert _normalize(by_name) == snapshot


async def test_metadata_query_wire_shape_unchanged(logged_in_client, snapshot):
    response = await logged_in_client.post("/graphql", json=metadata_query(PROPOSAL))

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None
    metadata = payload["data"]["metadata"]

    # tags[*]["variables"] has no ORDER BY upstream; sort for a stable snapshot
    metadata["tags"] = {
        name: {**tag, "variables": sorted(tag["variables"])}
        for name, tag in metadata["tags"].items()
    }

    assert _normalize(metadata) == snapshot


async def test_get_user_proposals_wire_shape_unchanged(logged_in_client, snapshot):
    """Only proposal 6996 has a resolvable DAMNIT path on disk.

    `_get_proposal_meta_many`'s default `only_with_damnit=True` drops the
    900xxx test proposals (recorded in the mymdc cassette, but with no
    `usr/Shared/amore` directory in the fixture tree), so the membership set
    of {6996, 900000, 900001, 900549} (`tests/mock/mymdc/identity_map.py`)
    narrows to a single result here.
    """
    response = await logged_in_client.post(
        "/graphql", json={"query": GET_USER_PROPOSALS_QUERY}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None
    proposals = payload["data"]["get_user"]["proposals"]
    assert len(proposals) == 1

    proposal = proposals[0]
    # damnit_path is an absolute path into the fixture tree, so it varies by
    # checkout location; pin the meaningful bit directly and replace it with
    # a placeholder before snapshotting the rest
    assert proposal["damnit_path"].endswith("usr/Shared/amore")
    assert proposal["damnit_paths_searched"] == [proposal["damnit_path"]]
    proposal = {
        **proposal,
        "damnit_path": "<fixture-path>/usr/Shared/amore",
        "damnit_paths_searched": ["<fixture-path>/usr/Shared/amore"],
    }

    assert proposal == snapshot

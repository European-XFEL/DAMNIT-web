"""Read the mock proposals that DAMNIT 0.4.0 wrote, through the app in local mode.

Each folder under `tests/mock/proposals/` is one mock proposal, built by
`build_proposals.py` there from the folder's own `context.py`. The queries reach
the real `runs.sqlite` and extracted data through the `runs` package.
"""

import pytest

from ..conftest import NO_RUNS_DIR

pytestmark = pytest.mark.asyncio

PROPOSAL = 999001

METADATA_QUERY = f"""
    query {{
      metadata(database: {{proposal: "{PROPOSAL}"}}) {{
        runs {{ proposal run }}
        variables
        tags
        groups
      }}
    }}
"""

RUNS_QUERY = f"""
    query {{
      runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 10) {{
        run
        cells {{
          name
          error {{ message cls }}
          summary {{ value dtype }}
        }}
      }}
    }}
"""


def extracted_data_query(variable):
    return f"""
        query {{
          extracted_data(
            database: {{proposal: "{PROPOSAL}"}}, run: 1, variable: "{variable}"
          )
        }}
    """


async def post_query(client, query):
    response = await client.post("/graphql", json={"query": query})

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None

    return payload["data"]


async def fetch_cells(client):
    """Fetch every run's cells, keyed by run number and then by variable name."""
    data = await post_query(client, RUNS_QUERY)

    return {
        run["run"]: {cell["name"]: cell for cell in run["cells"]}
        for run in data["runs"]
    }


async def test_run_numbers_keep_the_gap_from_3_to_5(local_client):
    data = await post_query(local_client, METADATA_QUERY)

    assert [run["run"] for run in data["metadata"]["runs"]] == [1, 2, 3, 5]


async def test_run_2_shows_all_three_failure_types_with_damnits_messages(
    local_client,
):
    cells = (await fetch_cells(local_client))[2]

    errors = {
        name: cells[name]["error"] for name in ("fit", "attenuator", "transmission")
    }
    assert errors == {
        "fit": {"cls": "ValueError", "message": "fit did not converge"},
        "attenuator": {
            "cls": "SourceNameError",
            "message": (
                "This data has no source named 'FXE_XAD_ATT/MDL/ATT'.\n"
                "See data.all_sources for available sources."
            ),
        },
        "transmission": {
            "cls": "Skip",
            "message": (
                "Skipped due to missing dependency:\n"
                "└ (attenuator) failed: SourceNameError: This data has no source"
                " named 'FXE_XAD_ATT/MDL/ATT'.\n"
                "   See data.all_sources for available sources."
            ),
        },
    }


async def test_only_run_2_has_failed_cells(local_client):
    cells = await fetch_cells(local_client)

    failed = {
        run: sorted(name for name, cell in run_cells.items() if cell["error"])
        for run, run_cells in cells.items()
    }
    assert failed == {1: [], 2: ["attenuator", "fit", "transmission"], 3: [], 5: []}


async def test_each_type_of_value_arrives_with_its_dtype(local_client):
    cells = (await fetch_cells(local_client))[1]

    dtypes = {name: cell["summary"]["dtype"] for name, cell in cells.items()}
    assert dtypes == {
        "proposal": "number",
        "run": "number",
        "start_time": "timestamp",
        "added_at": "timestamp",
        "n_trains": "number",
        "fit": "number",
        "attenuator": "number",
        "transmission": "number",
        "sample_x.position": "number",
        "sample_y.position": "number",
        "sample_name": "string",
        "beam_on": "number",
        "amplitude": "string",
        "trace": "array1d",
        "pulse_energy": "array1d",
        "detector_image": "image",
        "trace_matplotlib": "image",
        "trace_plotly": "number",
    }


async def test_a_boolean_arrives_as_the_integer_damnit_stored(local_client):
    cells = await fetch_cells(local_client)

    assert cells[1]["beam_on"]["summary"] == {"value": 1, "dtype": "number"}
    assert cells[3]["beam_on"]["summary"] == {"value": 0, "dtype": "number"}


async def test_a_complex_value_arrives_as_text(local_client):
    amplitude = (await fetch_cells(local_client))[1]["amplitude"]

    assert amplitude["summary"]["value"] == "0.346+0.822j"


async def test_groups_come_from_the_context_file(local_client):
    metadata = (await post_query(local_client, METADATA_QUERY))["metadata"]

    assert metadata["groups"] == {
        "sample_x": {"name": "sample_x", "title": "Sample X"},
        "sample_y": {"name": "sample_y", "title": "Sample Y"},
    }
    assert metadata["variables"]["sample_x.position"]["group"] == "sample_x"
    assert metadata["variables"]["sample_y.position"]["group"] == "sample_y"


async def test_tags_come_from_the_context_file(local_client):
    tags = (await post_query(local_client, METADATA_QUERY))["metadata"]["tags"]

    variables_by_tag = {name: sorted(tag["variables"]) for name, tag in tags.items()}
    assert variables_by_tag == {
        "Analysis": ["amplitude", "fit", "trace_matplotlib", "trace_plotly"],
        "Beam": ["attenuator", "beam_on", "transmission"],
        "Detector": ["detector_image"],
        "Run details": ["n_trains", "sample_name"],
        "Sample": ["sample_x.position", "sample_y.position"],
        "(Untagged)": [
            "added_at",
            "proposal",
            "pulse_energy",
            "run",
            "start_time",
            "trace",
        ],
    }


async def test_detector_image_extracted_data_is_16_rows_of_24(local_client):
    data = await post_query(local_client, extracted_data_query("detector_image"))

    image = data["extracted_data"]
    assert image["dtype"] == "array2d"
    assert image["dims"] == ["y", "x"]
    assert len(image["data"]) == 16
    assert {len(row) for row in image["data"]} == {24}


async def test_a_dataarray_keeps_its_dimension_and_train_ids_through_damnit(
    local_client,
):
    data = await post_query(local_client, extracted_data_query("pulse_energy"))

    array = data["extracted_data"]
    assert array["dims"] == ["trainId"]
    assert array["coords"]["trainId"] == list(range(1_001_000, 1_001_100))


async def test_a_plotly_figure_preview_comes_back_with_no_data(local_client):
    data = await post_query(local_client, extracted_data_query("trace_plotly"))

    preview = data["extracted_data"]
    assert preview["dtype"] == "none"
    assert preview["data"] is None


async def test_an_array_over_the_size_limit_comes_back_with_no_data(
    local_client, monkeypatch
):
    monkeypatch.setattr("damnit_api.runs.preview.PREVIEW_LIMIT_BYTES", 2000)

    image = await post_query(local_client, extracted_data_query("detector_image"))
    array = await post_query(local_client, extracted_data_query("pulse_energy"))

    assert image["extracted_data"]["dtype"] == "none"
    assert image["extracted_data"]["data"] is None
    assert array["extracted_data"]["dims"] == ["trainId"]


@pytest.mark.parametrize("damnit_dir", [NO_RUNS_DIR], ids=["no runs"])
async def test_a_proposal_with_no_runs_lists_its_variables_and_no_runs(local_client):
    metadata = (await post_query(local_client, METADATA_QUERY))["metadata"]
    runs = (await post_query(local_client, RUNS_QUERY))["runs"]

    assert metadata["runs"] == []
    assert runs == []
    assert set(metadata["variables"]) == {
        "proposal",
        "run",
        "start_time",
        "added_at",
        "n_trains",
        "sample_name",
        "trace",
        "sample_x.position",
    }

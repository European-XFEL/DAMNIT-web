"""Resolver tests for the runs/metadata/extracted_data queries.

Resolvers are exercised against a `CsvDamnitRepository` (see conftest), so no
SQLite fixtures are needed. The CSV fixtures define runs 348/349/350, but only
run 348 has variable rows, so `runs` returns just run 348 while `metadata`
lists every run.
"""

import pytest

from .const import PROPOSAL

FIXTURE_VARIABLES = {"n_trains", "run_length", "xgm_intensity", "etof_settings.ret0"}


@pytest.mark.asyncio
async def test_runs_returns_runs_with_variables(graphql_schema):
    query = f"""
        query {{
          runs(database: {{proposal: {PROPOSAL}}}, per_page: 10) {{
            variables {{ name value dtype }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]
    assert len(runs) == 1
    names = {v["name"] for v in runs[0]["variables"]}
    assert names >= FIXTURE_VARIABLES
    assert {"proposal", "run"} <= names


@pytest.mark.asyncio
async def test_runs_variable_shape(graphql_schema):
    query = f"""
        query {{
          runs(database: {{proposal: {PROPOSAL}}}, per_page: 10) {{
            variables {{ name value dtype }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    for variable in result.data["runs"][0]["variables"]:
        assert set(variable.keys()) == {"name", "value", "dtype"}


@pytest.mark.asyncio
async def test_runs_variable_name_filter(graphql_schema):
    query = f"""
        query {{
          runs(database: {{proposal: {PROPOSAL}}}, per_page: 10) {{
            variables(names: ["n_trains"]) {{ name }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    names = [v["name"] for v in result.data["runs"][0]["variables"]]
    assert names == ["n_trains"]


@pytest.mark.asyncio
async def test_metadata_lists_all_runs(graphql_schema):
    query = f"query {{ metadata(database: {{proposal: {PROPOSAL}}}) }}"
    result = await graphql_schema.execute(query)

    assert result.errors is None
    metadata = result.data["metadata"]
    assert set(metadata.keys()) == {"runs", "variables", "tags", "timestamp"}
    assert metadata["runs"] == [348, 349, 350]
    assert set(metadata["variables"].keys()) >= FIXTURE_VARIABLES
    assert "(Untagged)" in metadata["tags"]


@pytest.mark.asyncio
async def test_metadata_timestamp_is_milliseconds(graphql_schema):
    query = f"query {{ metadata(database: {{proposal: {PROPOSAL}}}) }}"
    result = await graphql_schema.execute(query)

    assert result.errors is None
    # Max fixture timestamp is 1000.0s; the resolver reports it in ms.
    assert result.data["metadata"]["timestamp"] == pytest.approx(1000.0 * 1000)


@pytest.mark.asyncio
async def test_extracted_data_csv_has_no_preview(graphql_schema):
    """The CSV backend has no binary preview data, so `get_extracted_data`
    returns None; the non-nullable `extracted_data: JSON!` field surfaces that
    as a null-field error rather than a value."""
    query = f"""
        query {{
          extracted_data(
            database: {{proposal: {PROPOSAL}}}, run: 348, variable: "n_trains"
          )
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is not None
    assert result.data is None


# -----------------------------------------------------------------------------
# ProposalNo scalar boundary: out-of-range proposals are rejected at coercion.


@pytest.mark.asyncio
async def test_runs_rejects_out_of_range_proposal(graphql_schema):
    query = """
        query { runs(database: {proposal: 1000000}) { variables { name } } }
    """
    result = await graphql_schema.execute(query)
    assert result.errors is not None


@pytest.mark.asyncio
async def test_runs_rejects_negative_proposal(graphql_schema):
    query = """
        query { runs(database: {proposal: -1}) { variables { name } } }
    """
    result = await graphql_schema.execute(query)
    assert result.errors is not None


# -----------------------------------------------------------------------------
# Permission boundaries.


@pytest.mark.asyncio
async def test_runs_forbidden_for_non_member(graphql_schema_authenticated_non_member):
    query = f"""
        query {{ runs(database: {{proposal: {PROPOSAL}}}) {{ variables {{ name }} }} }}
    """
    result = await graphql_schema_authenticated_non_member.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Access to this proposal is forbidden."


@pytest.mark.asyncio
async def test_runs_unauthorized(graphql_schema_no_auth):
    query = f"""
        query {{ runs(database: {{proposal: {PROPOSAL}}}) {{ variables {{ name }} }} }}
    """
    result = await graphql_schema_no_auth.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Authentication required."

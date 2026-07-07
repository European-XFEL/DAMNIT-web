"""Fixtures for the refactor-parity suite.

Where possible, the parity tests use the same mocked schema as `tests/graphql`, so
the fixtures are reused from that package's conftest rather than duplicated.
"""

from ..graphql.conftest import (  # noqa: F401
    bypass_proposal_permission,
    csv_fixture_dir,
    graphql_context,
    graphql_schema,
    graphql_schema_no_auth,
    mock_repositories,
    mocked_ensure_damnit_path,
    reset_caches,
)

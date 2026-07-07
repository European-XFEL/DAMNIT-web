"""Fixtures for the refactor-parity suite.

Where possible, the parity tests use the same mocked schema as `tests/graphql`, so
the fixtures are reused from that package's conftest rather than duplicated.
"""

from ..graphql.conftest import (  # noqa: F401
    bypass_proposal_permission,
    graphql_schema,
    graphql_schema_no_auth,
    mocked_ensure_damnit_path,
    mocked_metadata_all_tags,
    mocked_metadata_column,
    mocked_metadata_max,
    mocked_metadata_variable_tags,
    mocked_metadata_variables,
    reset_caches,
)

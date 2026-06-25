import pytest

from damnit_api.db import DatabaseSessionManager, async_table


@pytest.fixture(autouse=True)
def _clear_db_session_manager_registry():
    DatabaseSessionManager.registry.clear()  # pyright: ignore[reportAttributeAccessIssue]
    async_table.cache_clear()
    yield
    DatabaseSessionManager.registry.clear()  # pyright: ignore[reportAttributeAccessIssue]
    async_table.cache_clear()

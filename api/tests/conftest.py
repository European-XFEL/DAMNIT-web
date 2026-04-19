import pytest

from damnit_api.db import DatabaseSessionManager


@pytest.fixture(autouse=True)
def _clear_db_session_manager_registry():
    DatabaseSessionManager.registry.clear()
    yield
    DatabaseSessionManager.registry.clear()

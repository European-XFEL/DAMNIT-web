import pytest

from damnit_api.runs.sqlite import async_table
from damnit_api.runs.sqlite.session import damnit_registry


@pytest.fixture(autouse=True)
def _clear_damnit_registry():
    damnit_registry.clear()
    async_table.cache_clear()
    yield
    damnit_registry.clear()
    async_table.cache_clear()

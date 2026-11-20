import pytest

from damnit_api.graphql import subscriptions
from damnit_api.graphql.metadata import fetch_metadata
from damnit_api.runs.sqlite import (
    DatabaseSessionManager,
    async_active_proposal,
    async_table,
)


@pytest.fixture(autouse=True)
def _clear_caches():
    def _clear():
        DatabaseSessionManager.registry.clear()
        async_table.cache_clear()
        async_active_proposal.cache_clear()
        fetch_metadata.cache_clear()
        subscriptions.poll_proposal.cache_clear()
        subscriptions._last_seen_timestamp.clear()

    _clear()
    yield
    _clear()

import asyncio
import warnings

import pytest

from damnit_api.runs.sqlite import (
    DatabaseSessionManager,
    async_active_proposal,
    async_table,
)


@pytest.fixture(autouse=True)
def _clear_db_session_manager_registry():
    DatabaseSessionManager.registry.clear()  # pyright: ignore[reportAttributeAccessIssue]
    async_table.cache_clear()
    async_active_proposal.cache_clear()
    yield
    DatabaseSessionManager.registry.clear()  # pyright: ignore[reportAttributeAccessIssue]
    async_table.cache_clear()
    async_active_proposal.cache_clear()


@pytest.fixture(autouse=True)
def _restore_current_event_loop():
    """Put back the thread's event loop a test's ``asyncio.run()`` unset.

    ``asyncio.run()`` leaves the thread with no current loop when it returns.
    pytest-asyncio's session-scoped loop needs to stay current, so without this
    every async test after such a test fails with "There is no current event
    loop in thread 'MainThread'".
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        try:
            previous_loop = asyncio.get_event_loop()
        except RuntimeError:
            previous_loop = None
    yield
    if previous_loop is not None and not previous_loop.is_closed():
        asyncio.set_event_loop(previous_loop)

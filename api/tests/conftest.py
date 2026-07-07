import pytest

from damnit_api.runs.sqlite import DamnitDBRegistry


@pytest.fixture
def damnit_registry() -> DamnitDBRegistry:
    """A fresh per-test registry; nothing module-level to clear between tests."""
    return DamnitDBRegistry()

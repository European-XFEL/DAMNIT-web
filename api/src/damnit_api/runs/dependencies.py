"""Litestar dependency helpers for the runs repository registry."""

from litestar.datastructures import State

from .repository import DamnitRepositoryRegistry


def get_repositories(state: State) -> DamnitRepositoryRegistry:
    """Provide the per-proposal repository registry from the application state."""
    return state.app_state.repositories  # type: ignore[attr-defined]


# Plain type alias; Litestar injects by the parameter name `repositories`.
Repositories = DamnitRepositoryRegistry
"""Type alias for the DAMNIT repository registry dependency."""

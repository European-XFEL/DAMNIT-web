"""FastAPI dependency helpers for the runs repository registry."""

from typing import Annotated

from fastapi import Depends, Request

from ..state import get_app_state
from .repository import DamnitRepositoryRegistry


def get_repositories(request: Request) -> DamnitRepositoryRegistry:
    """Provide the per-proposal repository registry from the application state."""
    return get_app_state(request).repositories


Repositories = Annotated[DamnitRepositoryRegistry, Depends(get_repositories)]
"""Type alias for the DAMNIT repository registry dependency."""

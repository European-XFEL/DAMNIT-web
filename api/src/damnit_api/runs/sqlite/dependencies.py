"""FastAPI dependency helpers for the DAMNIT database registry."""

from typing import Annotated

from fastapi import Depends, Request

from ...state import get_app_state
from .session import DamnitDBRegistry


def get_damnit_registry(request: Request) -> DamnitDBRegistry:
    """Provide the DAMNIT database registry from the application state."""
    return get_app_state(request).damnit_registry


DamnitRegistry = Annotated[DamnitDBRegistry, Depends(get_damnit_registry)]
"""Type alias for the DAMNIT database registry dependency."""

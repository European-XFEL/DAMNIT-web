from typing import Annotated

from fastapi import Depends, Request

from ..state import get_app_state
from . import clients


def get_mymdc_client(request: Request) -> "clients.MyMdCClient":
    """Provide the MyMdC client from the application state."""
    return get_app_state(request).mymdc_client


MyMdCClient = Annotated[clients.MyMdCClient, Depends(get_mymdc_client)]
"""Type alias for the MyMdC client dependency."""

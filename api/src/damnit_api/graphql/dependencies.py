"""FastAPI dependency helpers for GraphQL subscription state."""

from typing import Annotated

from fastapi import Depends, Request

from ..state import get_app_state
from .subscriptions import SubscriptionCursors


def get_subscription_cursors(request: Request) -> SubscriptionCursors:
    """Provide the subscription cursors from the application state."""
    return get_app_state(request).subscription_cursors


SubscriptionCursorsDep = Annotated[
    SubscriptionCursors, Depends(get_subscription_cursors)
]
"""Type alias for the subscription cursors dependency."""

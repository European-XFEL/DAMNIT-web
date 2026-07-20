"""Litestar dependency helpers for GraphQL subscription state."""

from litestar.datastructures import State

from .subscriptions import SubscriptionCursors


def get_subscription_cursors(state: State) -> SubscriptionCursors:
    """Provide the subscription cursors from the application state."""
    return state.app_state.subscription_cursors  # type: ignore[attr-defined]


# Plain type alias; Litestar injects by the parameter name `subscription_cursors`.
SubscriptionCursorsDep = SubscriptionCursors
"""Type alias for the subscription cursors dependency."""

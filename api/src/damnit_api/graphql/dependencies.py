"""Litestar dependency helpers for GraphQL subscription state."""

from litestar.channels import ChannelsPlugin
from litestar.datastructures import State

from .publisher import RunUpdatePublisher


def get_channels(state: State) -> ChannelsPlugin:
    """Provide the channels plugin from the application state."""
    return state.app_state.channels  # type: ignore[attr-defined]


def get_run_update_publisher(state: State) -> RunUpdatePublisher:
    """Provide the run-update publisher from the application state."""
    return state.app_state.run_update_publisher  # type: ignore[attr-defined]


# Plain type aliases; Litestar injects by the parameter name.
ChannelsDep = ChannelsPlugin
"""Type alias for the channels-plugin dependency."""
RunUpdatePublisherDep = RunUpdatePublisher
"""Type alias for the run-update-publisher dependency."""

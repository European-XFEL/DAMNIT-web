from litestar.datastructures import State
from litestar.params import SkipValidation

from . import clients


def get_mymdc_client(state: State) -> "clients.MyMdCClient":
    """Provide the MyMdC client from the application state."""
    return state.app_state.mymdc_client  # type: ignore[attr-defined]


# `MyMdCClient` is a union of two concrete clients; Litestar's msgspec-based
# signature validation cannot build a decoder for a union of custom types, so
# injection sites skip validation of this app-provided collaborator.
MyMdCClient = SkipValidation[clients.MyMdCClient]
"""Type alias for the MyMdC client dependency."""

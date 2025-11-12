"""MyMdC Domain.

!!! warning Internal module

    This module should **not** directly expose any routes, it should **only** be used
    internally by other modules to interact with the MyMdC API.
"""

from typing import TYPE_CHECKING

from .bootstrap import bootstrap as bootstrap

if TYPE_CHECKING:
    from . import clients

global __CLIENT

__CLIENT: "clients.MyMdCClient" = None  # pyright: ignore[reportAssignmentType]
"""Global/singleton MyMdC client instance."""


def get_client_mymdc() -> "clients.MyMdCClient":
    """Get the global MyMdC client instance - for use with fastapi dependencies.

    Returns:
        The global MyMdC client.
    """
    if __CLIENT is None:
        msg = "MyMdC client has not been initialized. Call bootstrap() first."
        raise RuntimeError(msg)
    return __CLIENT


__all__ = ["bootstrap", "get_client_mymdc"]

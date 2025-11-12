"""MyMdC Domain.

!!! warning Internal module

    This module should **not** directly expose any routes, it should **only** be used
    internally by other modules to interact with the MyMdC API.
"""

from typing import TYPE_CHECKING

from .bootstrap import bootstrap

if TYPE_CHECKING:
    from . import clients

global CLIENT

CLIENT: "clients.MyMdCClient" = None  # pyright: ignore[reportAssignmentType]

__all__ = ["CLIENT", "bootstrap"]

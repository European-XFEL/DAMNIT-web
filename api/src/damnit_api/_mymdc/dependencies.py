from typing import Annotated

from fastapi import Depends
from fastapi.requests import HTTPConnection

from . import clients, ports

MyMdCClient = Annotated[clients.MyMdCClient, Depends(ports.MyMdCPort.from_global)]
"""Type alias for the MyMdC client dependency."""


def get_optional_mymdc_client(
    connection: HTTPConnection,
) -> clients.MyMdCClient | None:
    """Return the configured MyMdC client when the deployment uses one.

    An app-level override of `MyMdCPort.from_global` (how upstream's tests swap
    in a mock) applies here too, as it would to the required `MyMdCClient`.
    """
    override = connection.app.dependency_overrides.get(ports.MyMdCPort.from_global)
    if override is not None:
        return override()
    try:
        return ports.MyMdCPort.from_global()
    except RuntimeError:
        return None


OptionalMyMdCClient = Annotated[
    clients.MyMdCClient | None, Depends(get_optional_mymdc_client)
]
"""Type alias for optional MyMdC access in local/HZDR deployments."""

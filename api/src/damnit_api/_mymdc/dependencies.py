from typing import Annotated

from fastapi import Depends

from . import clients, ports

MyMdCClient = Annotated[clients.MyMdCClient, Depends(ports.MyMdCPort.from_global)]
"""Type alias for the MyMdC client dependency."""


def get_optional_mymdc_client() -> clients.MyMdCClient | None:
    """Return the configured MyMdC client when the deployment uses one."""
    try:
        return ports.MyMdCPort.from_global()
    except RuntimeError:
        return None


OptionalMyMdCClient = Annotated[
    clients.MyMdCClient | None, Depends(get_optional_mymdc_client)
]
"""Type alias for optional MyMdC access in local/HZDR deployments."""

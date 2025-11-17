from typing import Annotated

from fastapi import Depends

from . import clients, ports

MyMdCClient = Annotated[clients.MyMdCClient, Depends(ports.MyMdCPort.from_global)]
"""Type alias for the MyMdC client dependency."""

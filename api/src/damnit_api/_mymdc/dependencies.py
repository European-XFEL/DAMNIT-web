from typing import Annotated

from fastapi import Depends

from .clients import MyMdCClient as _MyMC

MyMdCClient = Annotated[_MyMC, Depends(_MyMC.from_global)]
"""Type alias for the MyMdC client dependency."""

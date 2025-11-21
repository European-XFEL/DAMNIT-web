"""Bootstrapping code for MyMdC client instantiation."""

from typing import TYPE_CHECKING

from .. import get_logger
from . import clients
from .settings import MyMdCHTTPSettings, MyMdCMockSettings

if TYPE_CHECKING:
    from ..shared.settings import Settings

logger = get_logger(__name__)


async def bootstrap(settings: "Settings"):
    """Bootstrap MyMdC client based on the current settings, saving the instance to the
    global [`damnit._mymdc.__CLIENT`] variable.

    Calling this multiple times will have no effect after the first call, but will log a
    warning."""
    import damnit_api._mymdc

    if damnit_api._mymdc.CLIENT is None:
        await logger.ainfo("Initialising MyMdC client")
        damnit_api._mymdc.CLIENT = await _init(settings)
    else:
        await logger.awarning("MyMdC client already initialised")


async def _init(settings: "Settings") -> clients.MyMdCClient:
    """Create MyMdC client based on settings."""
    match settings.mymdc:
        case MyMdCHTTPSettings():
            await logger.ainfo("Creating MyMdC client from credentials")
            auth = clients.MyMdCAuth.model_validate(settings.mymdc.model_dump())
            return clients.MyMdCClientAsync(auth)
        case MyMdCMockSettings():
            await logger.ainfo("Creating Mock MyMdC client")
            return clients.MyMdCClientMock.model_validate(settings.mymdc.model_dump())
        case _:
            msg = "Invalid MyMdC configuration"
            raise ValueError(msg)

from typing import TYPE_CHECKING

from .. import get_logger
from . import clients
from .settings import MockMyMdCData, MyMdCCredentials

if TYPE_CHECKING:
    from ..settings import Settings

logger = get_logger(__name__)


async def bootstrap(settings: "Settings"):
    """Bootstrap MyMdC client."""
    import damnit_api._mymdc

    if damnit_api._mymdc.CLIENT is None:
        await logger.ainfo("Initialising MyMdC client")
        damnit_api._mymdc.CLIENT = await _inject(settings)
    else:
        await logger.awarning("MyMdC client already initialised")


async def _inject(settings: "Settings"):
    match settings.mymdc:
        case MyMdCCredentials():
            await logger.ainfo("Creating MyMdC client with credentials")
            auth = clients.MyMdCAuth.model_validate(settings.mymdc)
            return clients.MyMdCClient(auth)
        case MockMyMdCData():
            await logger.ainfo("Creating Mock MyMdC client")
            return clients.MockMyMdCClient.model_validate(settings.mymdc.model_dump())
        case _:
            msg = "Invalid MyMdC configuration"
            raise ValueError(msg)

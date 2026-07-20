from anyio import Path as APath
from litestar import Request, Router, get
from litestar.di import Provide

from ..metadata.models import ProposalMeta
from ..metadata.routers import get_proposal_meta
from . import models


def _proposal_cache_key(request: Request) -> str:
    """Key response-cache entries per proposal so entries stay isolated."""
    proposal_number = request.query_params.get("proposal_number", "")
    return f"{request.url.path}:{proposal_number}"


@get("/content", cache=5, cache_key_builder=_proposal_cache_key)
async def get_content(proposal: ProposalMeta) -> models.ContextFile | None:
    if proposal.damnit_path is None:
        return None
    return await models.ContextFile.from_file(
        APath(proposal.damnit_path) / "context.py"
    )


@get("/last_modified", cache=5, cache_key_builder=_proposal_cache_key)
async def get_modified(proposal: ProposalMeta) -> models.ModifiedTime | None:
    if proposal.damnit_path is None:
        return None
    return await models.ModifiedTime.from_file(
        APath(proposal.damnit_path) / "context.py"
    )


router = Router(
    path="/contextfile",
    route_handlers=[get_content, get_modified],
    dependencies={"proposal": Provide(get_proposal_meta)},
)

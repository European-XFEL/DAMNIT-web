import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from .. import get_logger
from ..auth.models import User
from ..metadata.services import get_proposal_meta, update_proposal_meta
from .bootstrap import bootstrap
from .utils import DatabaseInput

logger = get_logger()


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def refresh(self, info: Info, database: DatabaseInput) -> JSON:
        if not database.proposal:
            msg = "Proposal number is required to refresh metadata."
            # TODO: custom exceptions
            raise ValueError(msg)

        user = await User.from_oauth_user(
            info.context.mymdc, info.context.session, info.context.oauth_user
        )

        meta = await get_proposal_meta(
            info.context.mymdc,
            int(database.proposal),
            user,
            info.context.session,
        )

        if not meta.damnit_path:
            logger.info("No damnit path found, updating proposal metadata")
            meta = await update_proposal_meta(
                info.context.mymdc,
                int(database.proposal),
                user,
                info.context.session,
            )
            if not meta.damnit_path:
                msg = "No damnit path found after updating proposal metadata."
                # TODO: custom exceptions
                raise ValueError(msg)

        proposal = database.proposal

        # Bootstrap
        model = await bootstrap(proposal)  # pyright: ignore[reportGeneralTypeIssues]
        info.schema.update(model.stype)  # pyright: ignore[reportAttributeAccessIssue]

        metadata = {
            "runs": model.runs,
            "variables": model.variables,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
            "tags": model.tags,
        }
        return {"metadata": metadata}  # FIX:  # pyright: ignore[reportReturnType]

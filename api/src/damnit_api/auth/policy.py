"""Proposal-membership authorization policy (ADR-011).

Authorization is enforced only at the edges: Strawberry permission classes
for GraphQL fields and a Litestar guard for REST routes, both delegating to
`require_proposal_member`. Domain services take plain parameters and perform
no authorization.
"""

from typing import TYPE_CHECKING

from .. import get_logger
from ..shared.errors import ForbiddenError
from ..shared.models import ProposalNumber
from . import models

if TYPE_CHECKING:
    from litestar.connection import ASGIConnection
    from litestar.handlers.base import BaseRouteHandler

logger = get_logger()


async def require_proposal_member(
    user: "models.User",
    proposal_number: ProposalNumber,
) -> None:
    """Raise `ForbiddenError` unless `user` is a member of the proposal."""
    from ..shared.settings import settings

    if settings.is_local:
        return

    if proposal_number not in user.proposals:
        msg = (
            f"User not authorised for proposal {proposal_number}, or proposal does not "
            "exist."
        )
        await logger.ainfo("Forbidden", message=msg)
        raise ForbiddenError(msg)


async def proposal_member_guard(
    connection: "ASGIConnection",
    _: "BaseRouteHandler",
) -> None:
    """Litestar guard enforcing proposal membership on REST routes.

    Attached to the proposal-scoped routers in the composition root (ADR-008),
    so the slices themselves stay authorization-free. Fails closed if a guarded
    route carries no `proposal_number`.
    """
    raw = connection.path_params.get("proposal_number") or connection.query_params.get(
        "proposal_number"
    )
    if raw is None:
        # A guarded route without the parameter is a wiring bug; fail closed.
        msg = "Route requires proposal membership but has no proposal_number"
        raise ForbiddenError(msg)
    proposal_number = ProposalNumber(int(raw))

    app_state = connection.app.state.app_state
    async with app_state.db_sessionmaker() as session:
        user = await models.User.from_connection(
            connection, app_state.mymdc_client, session
        )

    await require_proposal_member(user, proposal_number)

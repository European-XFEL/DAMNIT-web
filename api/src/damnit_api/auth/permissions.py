"""Strawberry permissions for GraphQL authorization."""

from typing import TYPE_CHECKING, cast

from strawberry.exceptions import StrawberryGraphQLError
from strawberry.permission import BasePermission
from strawberry.types import Info

from .. import get_logger
from ..metadata.services import _check_user_allowed
from ..shared.errors import ForbiddenError
from .models import User

if TYPE_CHECKING:
    from ..graphql.utils import DatabaseInput

logger = get_logger()


class IsAuthenticated(BasePermission):
    message = "Authentication required."

    async def has_permission(self, source, info: Info, **kwargs) -> bool:
        return info.context is not None and info.context.oauth_user is not None


class IsProposalMember(BasePermission):
    message = "Access to this proposal is forbidden."

    async def has_permission(self, source, info: Info, **kwargs) -> bool:
        if "database" not in kwargs:
            # Permission check on a field without a database doesn't make sense, so
            # raise a specific error for these cases
            logger.error(
                "IsProposalMember applied to a field without a `database` argument",
                field=getattr(info, "field_name", None),
            )
            msg = "Field is misconfigured for proposal authorization."
            raise StrawberryGraphQLError(msg)

        database = cast("DatabaseInput | None", kwargs["database"])
        proposal_str = database.proposal if database is not None else None
        if not proposal_str:
            return False

        try:
            proposal = int(proposal_str.strip("p"))
        except (ValueError, TypeError):
            logger.info("Invalid proposal identifier", proposal=proposal_str)
            # NOTE: Strawberry shares one permission instance across all requests, so a
            # per-call message must be raised, not stored on `self`.
            msg = "Invalid proposal identifier."
            raise StrawberryGraphQLError(msg) from None

        if info.context.user is None:
            try:
                info.context.user = await User.from_oauth_user(
                    info.context.mymdc, info.context.session, info.context.oauth_user
                )
            except Exception as exc:
                # Do not respond with upstream errors directly, might contain internal
                # info that shouldn't be sent to client.
                msg = "Could not verify proposal access"
                logger.exception(msg, proposal=proposal_str)
                raise StrawberryGraphQLError(msg) from exc
        user = info.context.user

        try:
            await _check_user_allowed(proposal, user)
            return True
        except ForbiddenError:
            return False


PROPOSAL_PERMISSIONS = [IsAuthenticated, IsProposalMember]

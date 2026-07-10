"""Strawberry permissions for GraphQL authorization."""

from strawberry.exceptions import StrawberryGraphQLError
from strawberry.permission import BasePermission
from strawberry.types import Info

from .. import get_logger
from ..metadata.services import _check_user_allowed
from ..shared.errors import ForbiddenError

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

        proposal_str = getattr(kwargs["database"], "proposal", None)
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

        try:
            user = await info.context.get_user()
        except Exception as exc:
            # Do not respond with upstream errors directly, might contain internal
            # info that shouldn't be sent to client.
            msg = "Could not verify proposal access"
            logger.exception(msg, proposal=proposal_str)
            raise StrawberryGraphQLError(msg) from exc

        try:
            await _check_user_allowed(proposal, user)
            return True
        except ForbiddenError:
            return False


PROPOSAL_PERMISSIONS = [IsAuthenticated, IsProposalMember]

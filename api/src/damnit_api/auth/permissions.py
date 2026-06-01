"""Strawberry permissions for GraphQL authorization."""

from typing import TYPE_CHECKING, cast

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
        database = cast("DatabaseInput | None", kwargs.get("database"))
        proposal_str = database.proposal if database is not None else None
        if not proposal_str:
            return False

        try:
            proposal = int(proposal_str.strip("p"))
        except (ValueError, TypeError):
            logger.info("Invalid proposal identifier", proposal=proposal_str)
            self.message = "Invalid proposal identifier."
            return False

        if info.context.user is None:
            info.context.user = await User.from_oauth_user(
                info.context.mymdc, info.context.session, info.context.oauth_user
            )
        user = info.context.user

        try:
            await _check_user_allowed(proposal, user)
            return True
        except ForbiddenError:
            return False


PROPOSAL_PERMISSIONS = [IsAuthenticated, IsProposalMember]

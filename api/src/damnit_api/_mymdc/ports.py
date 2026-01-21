"""MyMdC Ports (Interfaces) definitions."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

import async_lru

from .. import get_logger
from .models import (
    InstrumentCycle,
    Proposal,
    ProposalNumber,
    User,
    UserId,
    UserProposals,
)

if TYPE_CHECKING:
    from . import clients

logger = get_logger()


class MyMdCPort(ABC):
    """MyMdC Port Definition.

    !!! todo

        Remove the async_lru caching after hishel MR merged and repository
        added for main metadata module.
    """

    @classmethod
    def from_global(cls) -> "clients.MyMdCClient":
        """Create a MyMdCPort from the global client."""
        from damnit_api import _mymdc

        if _mymdc.CLIENT is None:
            msg = "MyMdC client has not been initialized. Call bootstrap() first."
            raise RuntimeError(msg)
        return _mymdc.CLIENT

    @abstractmethod
    async def _get_proposal_by_number(self, no: ProposalNumber) -> dict: ...

    @async_lru.alru_cache(ttl=60 * 60)  # TODO: remove
    async def get_proposal_by_number(self, no: ProposalNumber) -> Proposal:
        """Get a proposal by its number."""
        return Proposal.model_validate(await self._get_proposal_by_number(no))

    @abstractmethod
    async def _get_user_by_id(self, id: UserId) -> dict: ...

    @async_lru.alru_cache(ttl=60 * 60)  # TODO: remove
    async def get_user_by_id(self, id: UserId) -> User:
        """Get a user by their (MyMdC) ID."""
        return User.model_validate(await self._get_user_by_id(id))

    @abstractmethod
    async def _get_cycle_by_id(self, id: int) -> dict: ...

    @async_lru.alru_cache(ttl=60 * 60)  # TODO: remove
    async def get_cycle_by_id(self, id: int) -> InstrumentCycle:
        """Get a user by their (MyMdC) ID."""
        return InstrumentCycle.model_validate(await self._get_cycle_by_id(id))

    @abstractmethod
    async def _get_user_proposals(self, id: UserId) -> dict: ...

    @async_lru.alru_cache(ttl=60 * 60)  # TODO: remove
    async def get_user_proposals(self, id: UserId) -> UserProposals:
        """Get all proposals associated with a user ID.

        !!! todo

            Request ITDM return this directly from `users/{id}/proposals` endpoint then
            we can remove the grouping logic here
        """
        user_proposals = UserProposals.model_validate(
            await self._get_user_proposals(id)
        )

        return UserProposals.model_validate(user_proposals)

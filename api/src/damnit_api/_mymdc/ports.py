"""MyMdC Ports (Interfaces) definitions."""

import re
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

import async_lru

from .. import get_logger
from .models import (
    InstrumentCycle,
    Proposal,
    ProposalNo,
    User,
    UserId,
    UserProposalsByCycle,
    UsersProposals,
)

if TYPE_CHECKING:
    from . import clients

logger = get_logger()

CYCLE_PATTERN = re.compile(r".*/gpfs/exfel/exp/\w+/(\d+)/")


def try_extract_cycle_from_proposal_path(proposal_path: str) -> int | None:
    """Extract cycle number from proposal path."""
    m = CYCLE_PATTERN.match(proposal_path)
    if m is None:
        logger.warning(
            "Could not extract cycle from proposal path", proposal_path=proposal_path
        )
        return None
    return int(m.group(1))


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
    async def _get_proposal_by_number(self, no: ProposalNo) -> dict: ...

    @async_lru.alru_cache(ttl=60 * 60)  # TODO: remove
    async def get_proposal_by_number(self, no: ProposalNo) -> Proposal:
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

    @async_lru.alru_cache(ttl=5)  # TODO: remove
    async def get_user_proposals(self, id: UserId) -> UserProposalsByCycle:
        """Get all proposals associated with a user ID.

        !!! todo

            Request ITDM return this directly from `users/{id}/proposals` endpoint then
            we can remove the grouping logic here
        """
        user_proposals = UsersProposals.model_validate(
            await self._get_user_proposals(id)
        )

        user_proposals.root = user_proposals.root[-10:]

        proposals_by_cycle = {}
        for p in user_proposals.root:
            if p.proposal_number is None:
                continue
            proposal = await self.get_proposal_by_number(p.proposal_number)
            cycle = try_extract_cycle_from_proposal_path(proposal.def_proposal_path)

            if cycle is None:
                logger.warning(
                    "Could not determine cycle for proposal",
                    proposal_number=p.proposal_number,
                )
                cycle = -1  # Unknown cycle

            if cycle not in proposals_by_cycle:
                proposals_by_cycle[cycle] = [p.proposal_number]
            else:
                proposals_by_cycle[cycle].append(p.proposal_number)

        return UserProposalsByCycle.model_validate(proposals_by_cycle)

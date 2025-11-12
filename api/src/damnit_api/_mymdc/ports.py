"""MyMdC Ports (Interfaces) definitions."""

from abc import ABC, abstractmethod

from .models import InstrumentCycle, Proposal, ProposalNo, User, UserId, UserProposals


class MyMdCPort(ABC):
    """MyMdC Port Definition."""

    @abstractmethod
    async def _get_proposal_by_number(self, no: ProposalNo) -> dict: ...

    async def get_proposal_by_number(self, no: ProposalNo) -> Proposal:
        """Get a proposal by its number."""
        return Proposal.model_validate(await self._get_proposal_by_number(no))

    @abstractmethod
    async def _get_user_by_id(self, id: UserId) -> dict: ...

    async def get_user_by_id(self, id: UserId) -> User:
        """Get a user by their (MyMdC) ID."""
        return User.model_validate(await self._get_user_by_id(id))

    @abstractmethod
    async def _get_cycle_by_id(self, id: int) -> dict: ...

    async def get_cycle_by_id(self, id: int) -> InstrumentCycle:
        """Get a user by their (MyMdC) ID."""
        return InstrumentCycle.model_validate(await self._get_cycle_by_id(id))

    @abstractmethod
    async def _get_user_proposals(self, id: UserId) -> dict: ...

    async def get_user_proposals(self, id: UserId) -> UserProposals:
        """Get all proposals associated with a user ID."""
        return UserProposals.model_validate(await self._get_user_proposals(id))

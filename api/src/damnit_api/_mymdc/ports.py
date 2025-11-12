"""MyMdC Ports (Interfaces)."""

from abc import ABC, abstractmethod

from .models import Proposal, ProposalNo, User, UserId


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

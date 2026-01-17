"""MyMdC models, re-exported from vendor models and shared models."""

from pydantic import RootModel

from ..shared.models import ProposalNo
from .vendor import GetProposals, InstrumentCycles, Users, UsersProposal, UsersProposals

User = Users
"""MyMdC User model."""

UserId = str
"""MyMdC User ID."""

Proposal = GetProposals
"""MyMdC Proposal model."""

InstrumentCycle = InstrumentCycles
"""MyMdC Instrument Cycle model."""

UserProposal = UsersProposal
"""MyMdC User Proposal model, element returned by `users/{id}/proposals` call."""

UsersProposals = UsersProposals
"""MyMdC Users Proposals model, returned by `users/{id}/proposals` call."""


class UserProposalsByCycle(RootModel[dict[int, list[ProposalNo]]]):
    """User proposals grouped by instrument cycle."""


__all__ = [
    "InstrumentCycle",
    "Proposal",
    "ProposalNo",
    "User",
    "UserId",
    "UserProposalsByCycle",
    "UsersProposals",
]

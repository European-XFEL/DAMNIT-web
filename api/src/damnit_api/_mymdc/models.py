"""MyMdC models, re-exported from vendor models and shared models."""

from ..shared.models import ProposalNumber
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

UserProposals = UsersProposals
"""MyMdC Users Proposals model, returned by `users/{id}/proposals` call."""


__all__ = [
    "InstrumentCycle",
    "Proposal",
    "ProposalNumber",
    "User",
    "UserId",
    "UserProposals",
]

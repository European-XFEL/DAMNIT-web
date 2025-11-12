"""MyMdC models, re-exported from vendor models and shared models."""

from ..models import ProposalNo
from .vendor.models import GetProposals, InstrumentCycles, Users, UsersProposals

User = Users
"""MyMdC User model."""

type UserId = str
"""MyMdC User ID."""

Proposal = GetProposals
"""MyMdC Proposal model."""

InstrumentCycle = InstrumentCycles
"""MyMdC Instrument Cycle model."""


UserProposals = UsersProposals
"""MyMdC User Proposals model, list of all proposals a user has access to."""


__all__ = [
    "InstrumentCycle",
    "Proposal",
    "ProposalNo",
    "User",
    "UserId",
    "UserProposals",
]

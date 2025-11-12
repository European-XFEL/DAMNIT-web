from ..models import ProposalNo
from .vendor.models import GetProposals, InstrumentCycles, Users

User = Users
"""MyMdC User model."""

type UserId = str
"""MyMdC User ID."""

Proposal = GetProposals
"""MyMdC Proposal model."""

InstrumentCycle = InstrumentCycles
"""MyMdC Instrument Cycle model."""

# Export the relevant models
__all__ = ["InstrumentCycle", "Proposal", "ProposalNo", "User", "UserId"]

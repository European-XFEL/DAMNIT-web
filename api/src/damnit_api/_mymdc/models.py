from ..models import ProposalNo
from .vendor.models import GetProposals, Users

User = Users
"""MyMdC User model."""

type UserId = str
"""MyMdC User ID."""

Proposal = GetProposals
"""MyMdC Proposal model."""

# Export the relevant models
__all__ = ["Proposal", "ProposalNo", "User", "UserId"]

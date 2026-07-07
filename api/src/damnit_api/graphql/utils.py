import strawberry

from ..shared.const import DEFAULT_PROPOSAL
from ..shared.models import ProposalNumber


@strawberry.input
class DatabaseInput:
    proposal: ProposalNumber = strawberry.field(
        default=ProposalNumber(DEFAULT_PROPOSAL)
    )
    path: str | None = strawberry.field(default=strawberry.UNSET)

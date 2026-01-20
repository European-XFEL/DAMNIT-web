"""Metadata models."""

from datetime import datetime

from pydantic import computed_field
from sqlmodel import JSON, Column, Field, SQLModel

from .. import get_logger
from .._db.models import CreatedAtMixin, UpdatedAtMixin
from ..shared.models import ProposalCycle, ProposalNumber

logger = get_logger()


class ProposalMetaBase(SQLModel):
    """Proposal Metadata."""

    id: int = Field(default=None, primary_key=True)
    number: ProposalNumber
    cycle: ProposalCycle
    instrument: str
    path: str
    title: str
    principal_investigator: str
    start_date: datetime | None
    end_date: datetime | None

    damnit_path: str | None
    damnit_paths_searched: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
    )

    proposal_read_only: bool = False
    damnit_path_last_check: datetime | None = None

    @computed_field
    def year_half(self) -> str | None:
        if self.start_date is None:
            return None

        year_month = self.start_date.strftime("%Y%m")
        return str(year_month[:4] + ("01" if year_month[4] < "07" else "02"))


class ProposalMeta(ProposalMetaBase, CreatedAtMixin, UpdatedAtMixin, table=True): ...

"""Metadata models."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from ..shared.models import ProposalCycle, ProposalNumber


class ProposalMeta(BaseModel):
    """Proposal Metadata."""

    number: ProposalNumber
    cycle: ProposalCycle
    instrument: str
    path: Path
    title: str
    principal_investigator: str

    damnit_path: Path | None = None
    damnit_paths_searched: list[Path]

    start_date: datetime | None
    end_date: datetime | None

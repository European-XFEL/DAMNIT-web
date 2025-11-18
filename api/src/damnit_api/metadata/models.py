"""Metadata models."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from ..shared.models import ProposalCycle, ProposalNo


class ProposalMeta(BaseModel):
    """Proposal Metadata."""

    no: ProposalNo
    cycle: ProposalCycle
    instrument: str
    path: Path
    title: str

    damnit_path: Path | None = None
    damnit_paths_searched: list[Path]

    start_date: datetime | None
    end_date: datetime | None

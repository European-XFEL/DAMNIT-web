"""Metadata models."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from ..models import Instrument, ProposalCycle, ProposalNo


class ProposalMeta(BaseModel):
    """Proposal Metadata."""

    no: ProposalNo
    cycle: ProposalCycle
    instrument: Instrument
    path: Path
    title: str

    damnit_path: Path | None = None

    start_date: datetime
    end_date: datetime

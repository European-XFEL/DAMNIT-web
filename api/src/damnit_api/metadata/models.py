"""Metadata models."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, DirectoryPath

from ..shared.models import ProposalCycle, ProposalNo


class ProposalMetaBase(BaseModel):
    """Proposal Metadata."""

    no: ProposalNo
    cycle: ProposalCycle
    instrument: str
    path: Path
    title: str

    start_date: datetime | None
    end_date: datetime | None


class ProposalMeta(ProposalMetaBase):
    damnit_path: Path | None = None
    damnit_paths_searched: list[Path]

    def with_damnit_path(self) -> "ProposalMetaWithPath":
        return ProposalMetaWithPath(**self.model_dump())


class ProposalMetaWithPath(ProposalMetaBase):
    damnit_path: DirectoryPath
    damnit_paths_searched: list[Path]

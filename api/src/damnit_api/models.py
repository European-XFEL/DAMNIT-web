"""Shared Models for Damnit API."""

from enum import StrEnum
from pathlib import Path
from typing import Annotated

from anyio import Path as _APath
from pydantic import BaseModel, Field, GetCoreSchemaHandler, RootModel


class ProposalNo(RootModel):
    """Proposal Number."""

    root: Annotated[int, Field(gt=0, lt=999_9999)]


class ProposalCycle(BaseModel):
    """Proposal (Run) Cycle."""

    year: Annotated[int, Field(gt=2000, lt=2100)]
    cycle: Annotated[int, Field(gt=0, lt=99)]


class Instrument(StrEnum):
    """Instruments at the European XFEL."""

    FXE = "FXE"
    SCS = "SCS"
    MID = "MID"
    SPB = "SPB"
    HED = "HED"
    SQS = "SQS"


class APath(_APath):
    """AnyIO Path type for Pydantic models."""

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler: GetCoreSchemaHandler):
        return handler.generate_schema(Path)

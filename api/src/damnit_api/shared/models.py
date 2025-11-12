"""Shared Models for Damnit API."""

from enum import StrEnum
from typing import Annotated

from pydantic import Field

type ProposalNo = Annotated[int, Field(gt=0, lt=999_9999)]


type ProposalCycle = Annotated[str, Field(pattern=r"^\d{6}$")]


class Instrument(StrEnum):
    """Instruments at the European XFEL."""

    FXE = "FXE"
    SCS = "SCS"
    MID = "MID"
    SPB = "SPB"
    HED = "HED"
    SQS = "SQS"

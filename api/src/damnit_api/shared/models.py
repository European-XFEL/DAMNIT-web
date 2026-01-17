"""Shared Models for Damnit API."""

from typing import Annotated

from pydantic import Field

type ProposalNumber = Annotated[int, Field(gt=0, lt=999_9999)]

type ProposalCycle = Annotated[str, Field(pattern=r"^\d{6}$")]

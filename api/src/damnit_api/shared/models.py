"""Shared Models for Damnit API."""

import re
from typing import Annotated, Self

from pydantic import Field

_PROPOSAL_STR_PATTERN = re.compile(r"^p?(\d{1,6})$")


class ProposalNumber(int):
    """Validated proposal number (1-999999).

    ``str(pn)`` returns the canonical ``p{n:06d}`` form (e.g. ``"p001234"``).
    Format specs (``f"{pn:d}"``, ``"%d" % pn``) bypass ``__str__`` and produce
    plain integer output.
    """

    def __new__(cls, value: int | str) -> Self:
        if isinstance(value, float):
            msg = f"Expected int or str, got float: {value!r}"
            raise TypeError(msg)
        if isinstance(value, str):
            m = _PROPOSAL_STR_PATTERN.fullmatch(value)
            if not m:
                msg = f"Invalid proposal number: {value!r}"
                raise ValueError(msg)
            value = int(m.group(1))
        if not (0 < value < 1_000_000):
            msg = f"Proposal number out of range: {value}"
            raise ValueError(msg)
        return super().__new__(cls, value)

    def __str__(self) -> str:
        return f"p{self:06d}"

    def __repr__(self) -> str:
        return f"ProposalNumber({int(self)!r})"

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        from pydantic_core import core_schema

        return core_schema.no_info_plain_validator_function(
            cls,
            serialization=core_schema.plain_serializer_function_ser_schema(int),
        )


ProposalCycle = Annotated[str, Field(pattern=r"^\d{6}$")]

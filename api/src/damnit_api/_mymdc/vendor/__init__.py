"""Models generated from the OpenAPI specification for MyMDC.

This is done by:

1. Fetching the OpenAPI spec from MyMDC using `redocly`.
2. Filtering the spec to only include models we're interested in by using a wrapper spec
  and `redocly bundle`.
3. Generating pydantic models using `datamodel-codegen`.

Running `generate.sh` will regenerate these models.

To add new models, update the wrapper spec in `wrapper.yaml` by adding in additional
schemas.

!!! warning

    Some corrections are applied to the generated models in [`damnit_api._mymdc.vendor`]
"""

from . import models
from .models import InstrumentCycles, Users, UsersProposals

# TODO: Contact ITDM to request fixes to the OpenAPI spec


class UsersInfoItem(models.UsersInfoItem):
    name: str  # pyright: ignore[reportGeneralTypeIssues, reportIncompatibleVariableOverride]


class LogbookInfo(models.LogbookInfo):
    using_zulip_logbook: bool | None = None  # pyright: ignore[reportGeneralTypeIssues, reportIncompatibleVariableOverride]


class GetProposals(models.GetProposals):
    number: int  # pyright: ignore[reportGeneralTypeIssues, reportIncompatibleVariableOverride]
    def_proposal_path: str  # pyright: ignore[reportGeneralTypeIssues, reportIncompatibleVariableOverride]
    instrument_identifier: str  # pyright: ignore[reportGeneralTypeIssues, reportIncompatibleVariableOverride]
    users_ids: list[tuple[int, str, str]] | None = None  # pyright: ignore[reportIncompatibleVariableOverride]
    users_info: list[UsersInfoItem] | None = None  # pyright: ignore[reportIncompatibleVariableOverride]
    logbook_info: LogbookInfo | None = None  # pyright: ignore[reportIncompatibleVariableOverride]


__all__ = ["GetProposals", "InstrumentCycles", "Users", "UsersProposals"]

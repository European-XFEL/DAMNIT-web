from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import strawberry
from sqlalchemy import or_, select

from .._mymdc.clients import MyMdCClient
from ..auth.models import OAuthUserInfo, User
from ..db import async_table, get_session
from ..metadata import services as metadata
from ..metadata.models import ProposalMeta
from ..utils import map_dtype
from .models import DamnitType


@strawberry.input
class DamnitDataSpecifierPath:
    db_path: str
    name: str


@strawberry.input
class DamnitDataSpecifierProposal:
    proposal_no: int

    def __hash__(self) -> int:
        return hash(self.proposal_no)


@strawberry.input(one_of=True)
class DamnitDataSpecifierInput:
    path: strawberry.Maybe[DamnitDataSpecifierPath]
    proposal: strawberry.Maybe[DamnitDataSpecifierProposal]

    async def get_proposal_meta_with_auth(
        self,
        oauth_user: OAuthUserInfo,
        mymdc: MyMdCClient,
    ) -> ProposalMeta:
        if self.proposal is not None:
            proposal_no = self.proposal.value.proposal_no
        else:  # self.path is not None:
            msg = "Only proposal specifier is supported for non-development usage."
            raise NotImplementedError(msg)

        user = User.model_validate({
            **oauth_user.model_dump(),
            "proposals": await mymdc.get_user_proposals(oauth_user.preferred_username),
        })

        return await metadata.get_proposal_meta(mymdc, proposal_no, user)


@dataclass
class MetaData:
    dtype: DamnitType = DamnitType.STRING
    timestamp: float = 0


@dataclass
class Data(MetaData):
    value: Any = None


class LatestData:
    def __init__(self):
        self.runs = defaultdict(lambda: defaultdict(Data))
        self.variables = defaultdict(MetaData)

    def add(self, data):
        timestamp = data["timestamp"]
        dtype = map_dtype(type(data["value"]))

        # Bookkeep by runs
        run = self.runs[data["run"]]
        if run[data["name"]].timestamp < timestamp:
            run[data["name"]] = Data(
                value=data["value"], dtype=dtype, timestamp=timestamp
            )

        # Bookkeep by variables
        variable = self.variables[data["name"]]
        if variable.timestamp < timestamp:
            variable.dtype = dtype
            variable.timestamp = timestamp

    @property
    def dtypes(self):
        return {variable: data.dtype for variable, data in self.variables.items()}

    @property
    def timestamp(self):
        timestamps = [data.timestamp for data in self.variables.values()]
        return max(timestamps) if len(timestamps) else None

    @classmethod
    def from_list(cls, sequence):
        instance = cls()
        for seq in sequence:
            instance.add(seq)

        return instance


async def fetch_info(db_path: Path, *, runs):
    table = await async_table(db_path, name="run_info")
    conditions = [table.c.run == run for run in runs]
    query = select(table).where(or_(*conditions)).order_by(table.c.run)

    async with get_session(db_path) as session:
        result = await session.execute(query)
        if not result:
            raise ValueError  # TODO: Better error handling

        return result.mappings().all()

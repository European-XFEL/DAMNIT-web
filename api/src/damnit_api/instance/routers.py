from datetime import datetime
from typing import TypeAlias

import strawberry
import strawberry.experimental.pydantic as st_pydantic

from ..auth.services import resource_from_path, user_from_ldap
from . import models, services


@st_pydantic.type(models.Proposal, fields=["no", "cycle", "instrument"])
class Proposal:
    path: str


@st_pydantic.type(models.Metadata, all_fields=True)
class Metadata:
    pass


ListenerStatus: TypeAlias = strawberry.enum(models.ListenerStatus)  # type: ignore


@strawberry.type
class Listener:
    _listener: strawberry.Private[models.Listener]

    @strawberry.field
    async def last_modify(self) -> datetime | None:
        return await self._listener.get_last_modify()

    @strawberry.field
    async def status(self) -> ListenerStatus | None:
        return await self._listener.get_status()


@strawberry.type
class Instance:
    _dir: strawberry.Private[str]

    mask: str = "---"

    @strawberry.field
    def proposal(self) -> Proposal:
        return Proposal.from_pydantic(models.Proposal.from_path(path=self._dir))

    @strawberry.field
    async def metadata(self) -> Metadata:
        return Metadata.from_pydantic(
            await models.Metadata.from_mymdc(self.proposal.proposal_no)  # type: ignore
        )

    @strawberry.field
    def listener(self) -> Listener:
        return Listener(_listener=models.Listener(path=self._dir))  # type: ignore


@strawberry.type
class Query:
    @strawberry.field
    async def all_instances(self, username: str) -> list[Instance]:
        user = await user_from_ldap(username)
        dirs = services.get_amore_dirs()
        return [await get_instance(dir, user) for dir in dirs]

    @strawberry.field
    async def instance(self, instance_dir: str, username: str) -> Instance:
        user = await user_from_ldap(username)
        return await get_instance(instance_dir, user)


async def get_instance(instance_dir, user):
    proposal_path = models.Proposal.from_path(instance_dir).path
    proposal_res = await resource_from_path(proposal_path / "usr")
    mask = mask = proposal_res.acl & user.acl

    return Instance(_dir=instance_dir, mask=str(mask))


schema = strawberry.Schema(Query)

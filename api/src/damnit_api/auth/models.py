from pathlib import Path

from pydantic import BaseModel

from ..acl.models import ACL, GroupACE, Mask, UserACE


class Group(BaseModel):
    gid: int | None
    name: str

    @property
    def ace(self) -> GroupACE:
        return GroupACE(who=self.name, mask=Mask.rwx)


class User(BaseModel):
    uid: int | None
    username: str
    name: str | None
    email: str | None

    proposals: list[str]
    groups: list[Group]

    @property
    def ace(self) -> UserACE:
        return UserACE(who=self.username, mask=Mask.rwx)

    @property
    def acl(self) -> ACL:
        _groups = [group.ace for group in self.groups]
        return ACL([self.ace, *_groups])


class Resource(BaseModel):
    path: Path
    acl: ACL
    owner: str
    group: str

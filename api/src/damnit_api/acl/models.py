"""GPFS NFSv4 ACL models.

Models for parsing and working with GPFS NFSv4 ACLs. The scope of this is to model
enough of the ACL to be able to determine what (basic, rwx) permissions a user has given
a path to a file or directory.

For more information see the GPFS documentation:

- [NFS V4 ACL Syntax](https://www.ibm.com/docs/en/storage-scale/5.2.0?topic=administration-nfs-v4-acl-syntax)
"""

import asyncio
import operator
import re
from enum import Flag
from functools import reduce
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import BaseModel, RootModel
from typing_extensions import Doc


class ACE(BaseModel):
    """Access Control Entry.

    Partial model of a GPFS Access Control Entry (ACE), does not include type or flags.

    ACEs can be compared with the `&` operator, this will return the intersection of the
    two ACEs if they have the same identity and name, otherwise it will return 0.
    """

    identity: Annotated[Literal["user", "group"], Doc("The identity type of the ACE.")]
    who: Annotated[str, Doc("The name of the user or group the ACE applies to.")]
    mask: Annotated["Mask", Doc("The permissions granted by the ACE.")]

    @classmethod
    def from_str(cls, ace: str) -> Self:
        """Create an ACE from a string.

        Input string format should match the ACE format returned by `mmgetacl`, namely a
        colon-separated string of "{identity}:{name}:{mask}:{type}:[{flags}...].

        Example:
            >>> ACE.from_str("user:foo:r---:some_type:some:extra:flags")
            ACE(identity='user', who='foo', mask=<Mask.READ_DATA: 1>)

            >>> ACE.from_str("user:foo:r-x-:some_type:some:extra:flags")
            ACE(identity='user', who='foo', mask=<Mask.READ_DATA|EXECUTE: 33>)

            >>> ACE.from_str("user:foo:rwx-:some_type:some:extra:flags")
            ACE(identity='user', who='foo', mask=<Mask.rwx: 35>)
        """

        identity, who, mask_str, type, *flags = ace.split(":")

        # ace mask string is "rwxc" with "-" used to indicate no permission, this
        # gets a mask for each present value and ORs them together to get the final mask
        mask = reduce(
            operator.or_,
            (getattr(Mask, m) for m in mask_str if m != "-"),
        )

        return cls(
            identity=identity,  # type: ignore as pydantic will validate on init
            who=who,
            mask=mask,
        )

    def __and__(self, other: "ACE") -> "Mask":
        """Return the intersection of two ACEs if they have the same identity and
        name."""
        if self.identity == other.identity and self.who == other.who:
            return self.mask & other.mask
        return Mask(0)


class UserACE(ACE):
    identity: Literal["user"] = "user"


class GroupACE(ACE):
    identity: Literal["group"] = "group"


_GPFS_NFSV4_ACL = re.compile(
    r"""^#NFSv4\sACL\s*$
^#owner:(?P<owner>[\w@-]+)\s*$
^#group:(?P<group>[\w@-]+)\s*$
(?P<aces>(?:^[^\s].*$(?:\n.*$(?:\n.*$)*)*)*)
""",
    re.MULTILINE,
)

_GPFS_NFSV4_ACE = re.compile(
    r"""
^(?P<identity>special|user|group):(?P<name>[\w@-]+)@?:(?P<mask>[-rwxc]+):(.*)$
""",
    re.MULTILINE,
)


class ACL(RootModel[list[ACE]]):
    """Access Control List.

    ACLs can be compared to another ACL or a single ACE with the `&` operator, this will
    return the intersection of the two by comparing all ACE(s) with each other and
    returning the intersection of all matches.
    """

    root: list[ACE]

    def __getitem__(self, i: int) -> ACE:
        return self.root[i]

    def __iter__(self):
        return iter(self.root)

    @classmethod
    def from_str(cls, text: str) -> Self:
        """Create an ACL from a complete NFS v4 ACL string.

        The string must be the output of `mmgetacl` for a file or directory, e.g:

        ```
        #NFSv4 ACL
        #owner:smithj
        #group:staff
        special:owner@:rwxc:allow:FileInherit
        (X)READ/LIST (X)WRITE/CREATE (X)APPEND/MKDIR (-)SYNCHRONIZE (X)READ_ACL  (X)READ_ATTR  (-)READ_NAMED
        (X)DELETE    (X)DELETE_CHILD (X)CHOWN (X)EXEC/SEARCH (X)WRITE_ACL (X)WRITE_ATTR (-)WRITE_NAMED

        special:owner@:rwxc:allow:DirInherit:InheritOnly
        (X)READ/LIST (X)WRITE/CREATE (X)APPEND/MKDIR (-)SYNCHRONIZE (X)READ_ACL  (X)READ_ATTR  (-)READ_NAMED
        (X)DELETE    (X)DELETE_CHILD (X)CHOWN (X)EXEC/SEARCH (X)WRITE_ACL (-)WRITE_ATTR (-)WRITE_NAMED

        user:smithj:rwxc:allow
        (X)READ/LIST (X)WRITE/CREATE (X)APPEND/MKDIR (-)SYNCHRONIZE (X)READ_ACL  (X)READ_ATTR  (-)READ_NAMED
        (X)DELETE    (X)DELETE_CHILD (X)CHOWN (X)EXEC/SEARCH (X)WRITE_ACL (-)WRITE_ATTR (-)WRITE_NAMED
        ```
        """
        match = _GPFS_NFSV4_ACL.match(text)
        if not match:
            raise Exception  # TODO: better exception

        owner = match.group("owner")
        group = match.group("group")
        aces_text = match.group("aces")
        aces: list[ACE] = []
        for ace_match in _GPFS_NFSV4_ACE.finditer(aces_text):
            ace_identity = ace_match.group("identity")
            ace_name = ace_match.group("name")
            ace_mask = ace_match.group("mask")

            match ace_identity, ace_name:
                case "special", "owner@":
                    ace_identity = "user"
                    ace_name = owner
                case "special", "group@":
                    ace_identity = "group"
                    ace_name = group
                case "special", _:
                    # TODO: logging
                    continue
                case _:
                    pass

            mask = reduce(
                operator.or_,
                [getattr(Mask, m) for m in ace_mask if m != "-"] or [0],
            )

            ace = ACE(
                identity=ace_identity,  # type: ignore
                who=ace_name,
                mask=mask,
            )

            aces.append(ace)

        return cls(aces)

    @classmethod
    async def from_path(cls, path: Path) -> Self:
        """Create an ACL from a file or directory path.

        This is a convenience method which calls `mmgetacl` on the given path and then
        parses the output to create an ACL object.

        See Also:
            from_str: for more information on the expected format of the input string.
        """
        proc = await asyncio.create_subprocess_exec(
            "mmgetacl",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        if proc.returncode and proc.returncode != 0:
            raise Exception(proc.returncode)  # TODO: better exception

        stdout, stderr = await proc.communicate()

        if stderr:
            raise RuntimeError(stderr.decode())  # TODO: better exception

        return cls.from_str(stdout.decode())

    def __and__(self, other: "ACE | ACL") -> "Mask":
        """Return the intersection of an ACL with another ACL or an ACE."""
        match other:
            case ACE():
                return reduce(operator.or_, [other & ace for ace in self])
            case ACL():
                matches = [other & entry for entry in self]
                return Mask(reduce(operator.or_, matches) if matches else 0)
            case _:
                raise TypeError(
                    f"unsupported operand type(s) for &: 'ACL' and '{type(other).__name__}'"
                )


# Mask class as defined in the GPFS ACL documentation:
#
# https://www.ibm.com/docs/en/aix/7.3?topic=system-nfs4-access-control-list
#
# _mask_values = {
#     "r": ["READ_DATA", "LIST_DIRECTORY"],
#     "w": ["WRITE_DATA", "ADD_FILE"],
#     "p": ["APPEND_DATA", "ADD_SUBDIRECTORY"],
#     "R": ["READ_NAMED_ATTRS"],
#     "W": ["WRITE_NAMED_ATTRS"],
#     "x": ["EXECUTE", "SEARCH_DIRECTORY"],
#     "D": ["DELETE_CHILD"],
#     "a": ["READ_ATTRIBUTES"],
#     "A": ["WRITE_ATTRIBUTES"],
#     "d": ["DELETE"],
#     "c": ["READ_ACL"],
#     "C": ["WRITE_ACL"],
#     "o": ["WRITE_OWNER"],
#     "s": ["SYNCHRONIZE"],
# }
#
# for i, (key, aliases) in enumerate(_mask_values.items()):
#     v = 2**i
#     for k in [*aliases, key]:
#         print(f"{k} = {v}")


class Mask(Flag):
    READ_DATA = 1
    LIST_DIRECTORY = 1
    r = 1
    WRITE_DATA = 2
    ADD_FILE = 2
    w = 2
    ADD_SUBDIRECTORY = 4
    APPEND_DATA = 4
    p = 4
    READ_NAMED_ATTRS = 8
    R = 8
    WRITE_NAMED_ATTRS = 16
    W = 16
    EXECUTE = 32
    SEARCH_DIRECTORY = 32
    x = 32
    DELETE_CHILD = 64
    D = 64
    READ_ATTRIBUTES = 128
    a = 128
    WRITE_ATTRIBUTES = 256
    A = 256
    DELETE = 512
    d = 512
    READ_ACL = 1024
    c = 1024
    WRITE_ACL = 2048
    C = 2048
    WRITE_OWNER = 4096
    o = 4096
    SYNCHRONIZE = 8192
    s = 8192

    rwx = r | w | x

    def __str__(self) -> str:
        return "".join(l if self & getattr(self, l) else "-" for l in ["r", "w", "x"])

import re
from pathlib import Path
from typing import NewType, Self

from pydantic import BaseModel

from .exceptions import InvalidProposalPathError

ProposalNumber = NewType("ProposalNumber", int)

_RE_PNFS_SUB = re.compile(
    r"/pnfs/xfel\.eu/exfel/archive/XFEL/(?:proc|raw)"
    r"/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_RE_GPFS = re.compile(
    r"/gpfs/exfel/exp/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_RE_GPFS_SUB = re.compile(
    r"/gpfs/exfel/(?:u/scratch|u/usr|d/proc|d/raw)"
    r"/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_RE_LIST = [_RE_PNFS_SUB, _RE_GPFS, _RE_GPFS_SUB]


class ProposalPath(BaseModel):
    instrument: str
    cycle: int
    number: ProposalNumber

    @property
    def dirname(self) -> str:
        return f"p{self.number:06d}"

    @property
    def path(self) -> Path:
        return Path(f"/gpfs/exfel/exp/{self.instrument}/{self.cycle}/{self.dirname}")

    @classmethod
    def from_path(cls, path: Path) -> Self:
        match = [m.match(str(path)) for m in _RE_LIST]
        match = [m for m in match if m]

        if not match:
            raise InvalidProposalPathError(path)

        group = match[0].groupdict()

        inst, cycle, no = group["inst"], group["cycle"], int(group["prop"])

        return cls(instrument=inst, cycle=int(cycle), number=ProposalNumber(no))

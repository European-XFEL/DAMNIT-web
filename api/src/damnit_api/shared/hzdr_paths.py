"""Map the paths events record onto the paths this host can open.

Producers record the path people use (``/bigdata/...``) or the one on their own
PC (``Z:/bigdata/...``); the server reaches the same share through a mount
(``/home/<user>/mnt/bigdata``). ``DW_API_METADATA__PATH_MAP`` states the
translation as ``from=to`` prefixes, comma separated, the way the SciCat
plugin's ``SOURCE_FOLDER_PUBLISH_MAP`` does in the other direction.
"""

import os
from collections.abc import Iterable
from pathlib import Path, PurePosixPath, PureWindowsPath

PathRule = tuple[str, str]


def parse_path_map(spec: str) -> list[PathRule]:
    """Parse ``"/bigdata=/mnt/bigdata,Z:/bigdata=/mnt/bigdata"`` into rules."""
    rules: list[PathRule] = []
    for entry in spec.split(","):
        entry = entry.strip()
        if not entry:
            continue
        source, sep, target = entry.partition("=")
        source, target = source.strip(), target.strip()
        if not sep or not source or not target:
            msg = f"path map entry {entry!r} must look like 'from=to'"
            raise ValueError(msg)
        if not (
            PurePosixPath(target).is_absolute() or PureWindowsPath(target).is_absolute()
        ):
            msg = f"path map target {target!r} must be an absolute path"
            raise ValueError(msg)
        rules.append((source, target))
    return rules


def _normalize(raw: str) -> str:
    return raw.replace("\\", "/")


def map_path(raw: str | None, rules: list[PathRule]) -> Path | None:
    """Return ``raw`` with the longest matching prefix rule applied."""
    if raw is None:
        return None
    path = _normalize(raw)
    prefixed = [(_normalize(source).rstrip("/"), target) for source, target in rules]
    for prefix, target in sorted(prefixed, key=lambda rule: -len(rule[0])):
        head = path[: len(prefix)]
        # Drive letters compare case-insensitively; everything else exactly.
        same = (
            head.lower() == prefix.lower()
            if PureWindowsPath(prefix).drive
            else head == prefix
        )
        if same and (len(path) == len(prefix) or path[len(prefix)] == "/"):
            return Path(target) / path[len(prefix) :].lstrip("/")
    return Path(raw)


FSTAB = Path("/etc/fstab")


def fstab_mount_points(fstab: Path = FSTAB) -> set[Path]:
    """The mount points ``fstab`` declares; empty where there is no fstab."""
    try:
        lines = fstab.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return set()
    points: set[Path] = set()
    for line in lines:
        fields = line.split()
        if len(fields) < 2 or fields[0].startswith("#") or fields[1] == "none":
            continue
        # fstab writes a space in a path as \040.
        points.add(Path(fields[1].replace("\\040", " ")))
    return points


def missing_mount(
    target: Path, required: Iterable[Path] = (), fstab: Path = FSTAB
) -> Path | None:
    """The mount point that should hold ``target`` but is not mounted, if any.

    A share that is not mounted leaves its mount point as an ordinary folder on
    the machine's own disk. A build writing there succeeds, creating whatever
    folders it needs, and its output disappears behind the share once it is
    mounted again; on 2026-11-03 a whole catalog went that way on fwkt-webapps
    after a lazy unmount. So: every ``required`` path must be a mount point, and
    the nearest mount point ``fstab`` declares above ``target`` must be mounted.
    An x-systemd.automount placeholder counts as mounted: writing through it
    mounts the share, or fails loudly.
    """
    for point in required:
        if not os.path.ismount(point):
            return Path(point)
    declared = fstab_mount_points(fstab)
    target = Path(target).absolute()
    for candidate in (target, *target.parents):
        if candidate in declared:
            return None if os.path.ismount(candidate) else candidate
    return None

"""Frames numbered by set and ordinal, or a recording's frames, and their comment.

A port of shot-aligner's ``diagnostics/sequence_frames.py`` ``write`` to h5py,
with the same output, and the one part of it this rewrite exists for: **a
recording streams**. shot-aligner fills a pre-shaped stack but keeps the first
frame for its display copy; here each frame is read, appended to a chunked
gzip-4 dataset (one frame per chunk, unlimited first axis) and released before
the next is read, so a 200-frame pco.edge recording costs one frame of memory.
There is no display copy (decision 6).

The recorder comment (``<frame>.tif.rec``, UTF-16, written by pco.camware once
per recording) is parsed into typed settings and kept verbatim, as shot-aligner
does; its parser is part of this pack there, so it is ported here.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from . import _h5
from ._images import read_image

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping

    import h5py

SIDECAR_SUFFIX = ".rec"

# Lines of the recorder comment that are not `key : value`.
_HEADING = re.compile(r"^(pco\.camware|Camera Settings|Comment:)\s*$", re.IGNORECASE)

# `Record Date: 20.02.2026 Time: 13:14:46`, the only clock on such a date.
_RECORDED = re.compile(
    r"Record\s+Date:\s*(?P<d>\d{2})\.(?P<m>\d{2})\.(?P<y>\d{4})\s+"
    r"Time:\s*(?P<hh>\d{2}):(?P<mm>\d{2}):(?P<ss>\d{2})"
)

# The exposure, with the unit the vendor wrote beside it.
_EXPOSURE = re.compile(r"(?P<value>[\d.]+)\s*(?P<unit>ms|us|\u00b5s|s)\s*/")

_TRAILING_NUMBER = re.compile(r"_(\d+)$")


def read_recorder_comment(path: Path) -> tuple[dict, str | None, str]:
    """``(settings, recorded_iso, verbatim)`` from a pco.camware ``.rec``.

    Decoded leniently: a comment file that lost a byte costs its own contents,
    not the frame beside it.
    """
    try:
        raw = path.read_bytes()
    except OSError:
        return {}, None, ""
    if raw[:2] in {b"\xff\xfe", b"\xfe\xff"}:
        text = raw.decode("utf-16", "replace")
    else:
        text = raw.decode("utf-8", "replace")
    text = text.replace("\r\n", "\n").replace("\ufeff", "")

    recorded = None
    found = _RECORDED.search(text)
    if found:
        recorded = (
            f"{found['y']}-{found['m']}-{found['d']}T"
            f"{found['hh']}:{found['mm']}:{found['ss']}"
        )

    settings: dict[str, str] = {}
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or _HEADING.match(stripped) or ":" not in stripped:
            continue
        key, _, value = stripped.partition(":")
        key, value = key.strip(), value.strip()
        if key and value and not _RECORDED.match(stripped):
            settings[key] = value
    return settings, recorded, text


def _safe_key(label: str) -> str:
    """A vendor label as a NeXus name, without pretending it is a new fact."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", label.strip().lower()).strip("_")
    return cleaned or "setting"


def _stem_of_frame(name: str) -> str:
    return name.rsplit(".", 1)[0] if "." in name else name


def frame_number(path: Path) -> int | None:
    """The number at the end of a frame's name: its place in the recording."""
    found = _TRAILING_NUMBER.search(_stem_of_frame(path.name))
    return int(found.group(1)) if found else None


def frame_order(path: Path) -> tuple:
    """Frames by the number in their name: `_2` before `_10`, padded or not."""
    number = frame_number(path)
    return (number is None, number or 0, path.name)


def _signal(group: h5py.Group) -> None:
    """The NXdata view of `raw_data/image`, and the detector's default."""
    data = _h5.group(group, "data", "NXdata")
    _h5.link(data, "image", _h5.dataset(group, "raw_data/image"))
    data.attrs["signal"] = "image"
    _h5.dataset(data, "image").attrs["interpretation"] = "image"
    group.attrs["default"] = "data"


def _write_stack(group: h5py.Group, frames: list[Path], problems: list[str]) -> bool:
    """Every frame of one recording as `raw_data/image[frame, y, x]`, streamed.

    A frame that will not read, or is not the first readable frame's size,
    stays zeros and is flagged in `frame_readable`, so a position keeps
    meaning the same frame. Returns whether any frame was written.
    """
    raw = _h5.subgroup(group, "raw_data")
    stack = _h5.FrameStack(raw, "image")
    readable = np.zeros(len(frames), dtype=bool)
    bad: list[str] = []
    for place, path in enumerate(frames):
        frame = read_image(path) if path.is_file() else None
        if frame is None or (
            stack.frame_shape is not None and tuple(frame.shape) != stack.frame_shape
        ):
            bad.append(path.name)
            stack.skip()
            continue
        stack.append(frame)
        readable[place] = True
        del frame
    if stack.dataset is None:
        problems.append(
            f"none of the {len(frames)} frames of this recording could "
            f"be read ({frames[0].name} …)"
        )
        return False
    stack.dataset.attrs["units"] = "counts"
    stack.dataset.attrs["description"] = (
        f"all {len(frames)} frames of one recording of one shot, in frame "
        "order; raw_data/frame_number says which file each came from"
    )
    numbers = [frame_number(path) for path in frames]
    _h5.field(
        raw,
        "frame_number",
        np.array([n if n is not None else -1 for n in numbers], dtype="int32"),
        description=(
            "the frame number in each file name: a position within this "
            "recording, not a shot number"
        ),
    )
    flags = _h5.field(raw, "frame_readable", readable)
    if bad:
        flags.attrs["description"] = (
            "false where the frame could not be read or was not the first "
            "frame's size; those positions hold zeros, not a measurement"
        )
        problems.append(
            f"{len(bad)} of {len(frames)} frames could not be written: "
            f"{', '.join(bad[:3])}{' …' if len(bad) > 3 else ''}"
        )
    return True


def _write_comment(group: h5py.Group, sidecar: Path, problems: list[str]) -> None:
    """The recorder comment: verbatim, its start time, and typed settings."""
    settings, recorded, verbatim = read_recorder_comment(sidecar)
    if not settings and not recorded:
        problems.append(f"unreadable recorder comment {sidecar.name}")
    if verbatim:
        original = _h5.group(group, "original_metadata", "NXcollection")
        _h5.note(
            original,
            "recorder_comment",
            type="text/plain",
            data=verbatim,
            description=f"{sidecar.name} exactly as the camera software "
            "wrote it; the typed copies are in acquisition_settings",
        )
    if recorded:
        _h5.field(
            group,
            "recording_started",
            recorded,
            description=(
                "when this set's recording began, from the recorder comment "
                "file. Not the time of this frame: one comment describes the "
                "whole set, and the frames carry no clock of their own"
            ),
        )
    if settings:
        collection = _h5.group(group, "acquisition_settings", "NXcollection")
        for label, value in settings.items():
            _h5.field(
                collection, _safe_key(label), value, source_text=f"{label}: {value}"
            )
        exposure = _EXPOSURE.search(settings.get("Exposure / Delay", ""))
        if exposure:
            unit = exposure["unit"].replace("\u00b5s", "us")
            _h5.field(group, "count_time", float(exposure["value"]), units=unit)


def write(
    group: h5py.Group, acquisition: Mapping, read_path: Callable[[str], Path]
) -> list[str]:
    """Write one frame -- or a whole recording's frames -- and its comment."""
    problems: list[str] = []
    files = [Path(read_path(f)) for f in acquisition["files"]]
    frames = sorted(
        (f for f in files if not f.name.endswith(SIDECAR_SUFFIX)), key=frame_order
    )
    frame = frames[0] if frames else None
    sidecar = next((f for f in files if f.name.endswith(SIDECAR_SUFFIX)), None)

    raw = _h5.group(group, "raw_data", "NXcollection")
    if acquisition.get("seq") is not None:
        _h5.field(
            raw,
            "sequence_number",
            int(acquisition["seq"]),
            description=(
                "the ordinal in the file name; this diagnostic records no clock, "
                "so this is what places the frame in its set"
            ),
        )

    if len(frames) > 1:
        if _write_stack(group, frames, problems):
            _signal(group)
    elif frame is None or not frame.is_file():
        problems.append(f"missing frame for {acquisition['instrument']}")
    else:
        pixels = read_image(frame)
        if pixels is None:
            problems.append(f"unreadable frame {frame.name}")
        else:
            _h5.image(raw, "image", pixels, units="counts")
            del pixels
            _signal(group)

    if sidecar is not None and sidecar.is_file():
        _write_comment(group, sidecar, problems)
    return problems

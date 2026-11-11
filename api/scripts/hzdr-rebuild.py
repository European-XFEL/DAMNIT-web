#!/usr/bin/env python
"""Rebuild the campaign NeXus files by hand, with exactly the auto-trigger's inputs.

The auto-trigger rebuilds on an export change or new events, never after a
code update, so a change to the file layout (a new bridge profile) reaches a
campaign only when it is rebuilt. This runs the command the trigger would run,
assembled by the API's own code from ``api/.env`` (it never starts a spool
consumer, so the running API keeps its Kafka partitions).

Run from ``api/`` as the user who owns the output (on fwkt-webapps: tippey)::

    uv run --no-sync python scripts/hzdr-rebuild.py --print       # show it only
    uv run --no-sync python scripts/hzdr-rebuild.py               # rebuild
    uv run --no-sync python scripts/hzdr-rebuild.py --all-exports # every export
    uv run --no-sync python scripts/hzdr-rebuild.py --check-only  # v6 check only

``--all-exports`` adds every campaign that has an export
(``<CURATED_ROOT>/<c>/<c>.sqlite``). A named campaign's export may claim
``unassigned`` triggers during that build, which is why the trigger lists only
the campaigns taking shots; use it for a one-off rebuild of old campaigns.

After the build (or with ``--check-only``) every campaign file under
``OUTPUT_ROOT`` is checked for ``/entry/shots/authority_shot_number``
(bridge profile v6). Exit status: the builder's, else 1 when a file lacks the
column, 2 when the auto-trigger is not configured, 0 otherwise.
"""

from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from pathlib import Path  # noqa: TC003

V6_DATASET = "/entry/shots/authority_shot_number"


def _export_campaigns(curated_root: Path) -> list[str]:
    if not curated_root.is_dir():
        return []
    return sorted(
        d.name
        for d in curated_root.iterdir()
        if d.is_dir() and (d / f"{d.name}.sqlite").is_file()
    )


def _with_campaigns(cmd: list[str], extra: list[str]) -> list[str]:
    named = {cmd[i + 1] for i, arg in enumerate(cmd[:-1]) if arg == "--campaign"}
    out = list(cmd)
    for campaign in extra:
        if campaign not in named:
            out += ["--campaign", campaign]
            named.add(campaign)
    return out


def campaign_files(output_root: Path) -> list[Path]:
    """``<root>/<campaign>/<campaign>.nxs`` for every campaign folder."""
    if not output_root.is_dir():
        return []
    return sorted(
        d / f"{d.name}.nxs"
        for d in output_root.iterdir()
        if d.is_dir() and (d / f"{d.name}.nxs").is_file()
    )


def check_v6(paths: list[Path]) -> int:
    """Print one line per file; return how many lack the v6 column."""
    import h5py

    missing = 0
    for path in paths:
        try:
            with h5py.File(path, "r") as f:
                if V6_DATASET not in f:
                    print(f"MISSING {path}: no {V6_DATASET} (rebuild it)")
                    missing += 1
                    continue
                values = f[V6_DATASET][()]
                numbered = int((values >= 0).sum())
                print(f"PASS    {path}: {len(values)} shots, {numbered} with a number")
        except OSError as exc:
            print(f"ERROR   {path}: {exc}")
            missing += 1
    if not paths:
        print("No campaign files found.")
    return missing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__.split("\n\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--print", action="store_true", help="print the command only")
    parser.add_argument(
        "--campaign", action="append", default=[], help="also build this campaign"
    )
    parser.add_argument(
        "--all-exports",
        action="store_true",
        help="also build every campaign that has a LabFrog export",
    )
    parser.add_argument(
        "--check-only", action="store_true", help="skip the build, only check v6"
    )
    args = parser.parse_args(argv)

    from damnit_api.consumer.bootstrap import builder_command
    from damnit_api.shared.settings import settings

    builder = settings.hzdr_builder
    cmd = builder_command(settings)
    if cmd is None:
        print(
            "The builder auto-trigger is off (DW_API_HZDR_BUILDER__ENABLED and a "
            "spool consumer); nothing to rebuild with.",
            file=sys.stderr,
        )
        return 2
    output_root = builder.output_root
    extra = list(args.campaign)
    if args.all_exports and builder.curated_root is not None:
        extra += _export_campaigns(builder.curated_root)
    if extra and output_root is None:
        print("--campaign/--all-exports need multi-campaign mode (OUTPUT_ROOT).")
        return 2
    cmd = _with_campaigns(cmd, extra)

    if not args.check_only:
        print("$ " + shlex.join(cmd), flush=True)
        if args.print:
            return 0
        result = subprocess.run(cmd, check=False)
        if result.returncode != 0:
            print(f"Builder exited {result.returncode}.", file=sys.stderr)
            return result.returncode

    paths = (
        campaign_files(output_root)
        if output_root is not None
        else [p for p in [builder.output_nexus] if p is not None and p.is_file()]
    )
    return 1 if check_v6(paths) else 0


if __name__ == "__main__":
    sys.exit(main())

"""Print a compact tree for a generated HZDR HDF5 file."""

from __future__ import annotations

import argparse
from pathlib import Path

import h5py


def format_shape(shape) -> str:
    if shape == ():
        return "scalar"
    return "x".join(str(value) for value in shape)


def inspect_hdf5(path: Path) -> None:
    with h5py.File(path, "r") as handle:
        print(f"HDF5: {path}")
        if handle.attrs:
            print("Attributes:")
            for key, value in handle.attrs.items():
                print(f"  {key}: {value}")
        print("Datasets:")

        def print_item(name, item):
            if isinstance(item, h5py.Dataset):
                print(f"  /{name}  shape={format_shape(item.shape)} dtype={item.dtype}")

        handle.visititems(print_item)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        type=Path,
        nargs="?",
        default=Path("../.generated/hzdr-package-emulator/hdf5/exp-2026-05-draco.h5"),
    )
    args = parser.parse_args()
    inspect_hdf5(args.path.resolve())


if __name__ == "__main__":
    main()

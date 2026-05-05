from pathlib import Path

import h5py
import numpy as np
import orjson

from damnit_api.metadata.hzdr_sources import (
    HZDRSourceProvider,
    _map_mongo_shot,
    list_hdf5_datasets,
    load_sources_file,
)
from damnit_api.shared.settings import MetadataSettings


def write_source_fixture(tmp_path: Path) -> Path:
    """Write a minimal source fixture without relying on tracked example data."""
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps(
            {
                "sources": [
                    {
                        "key": "hzdr-local",
                        "title": "HZDR local file fixture",
                        "damnit_path": "damnit/hzdr-local",
                        "metadata": {"facility": "HZDR"},
                        "shots": [
                            {
                                "source_key": "hzdr-local",
                                "shot_number": 1001,
                                "fired_at": "2026-05-05T08:15:00Z",
                                "metadata": {"status": "processed"},
                            },
                            {
                                "source_key": "hzdr-local",
                                "shot_number": 1002,
                                "fired_at": "2026-05-05T08:17:30Z",
                                "metadata": {"status": "metadata-only"},
                            },
                        ],
                    }
                ]
            }
        )
    )
    return path


def test_load_hzdr_sources_from_json_file(tmp_path: Path):
    """JSON fixtures provide source metadata without MyMdC."""
    path = write_source_fixture(tmp_path)

    sources = load_sources_file(path)

    assert [source.key for source in sources] == ["hzdr-local"]
    assert sources[0].metadata["facility"] == "HZDR"
    assert [shot.shot_number for shot in sources[0].shots] == [1001, 1002]


def test_local_provider_returns_sources_from_file(tmp_path: Path):
    """The local provider is the default for file-backed HZDR testing."""
    path = write_source_fixture(tmp_path)
    settings = MetadataSettings(
        provider="local",
        sources_file=path,
    )

    source = HZDRSourceProvider(settings).get_source("hzdr-local")

    assert source is not None
    assert source.title == "HZDR local file fixture"


def test_local_provider_returns_shots_from_file(tmp_path: Path):
    """HZDR fixtures are shot-first rather than proposal-first."""
    path = write_source_fixture(tmp_path)
    settings = MetadataSettings(
        provider="local",
        sources_file=path,
    )

    shots = HZDRSourceProvider(settings).list_shots("hzdr-local")

    assert [shot.shot_number for shot in shots] == [1001, 1002]
    assert shots[0].fired_at == "2026-05-05T08:15:00Z"


def test_map_mongo_shot_supports_shot_alias_fields():
    """Existing shot documents can use `shot` and `timestamp` field names."""
    record = {
        "shot": 77,
        "timestamp": "2026-05-05T10:00:00Z",
        "status": "processed",
    }

    shot = _map_mongo_shot(
        record,
        "hzdr-local",
        shot_number_field="shot_number",
        fired_at_field="fired_at",
    )

    assert shot is not None
    assert shot.source_key == "hzdr-local"
    assert shot.shot_number == 77
    assert shot.fired_at == "2026-05-05T10:00:00Z"
    assert shot.metadata["status"] == "processed"


def test_list_hdf5_datasets_reads_structure_without_full_arrays(tmp_path: Path):
    """Shot details expose HDF5 dataset names, dtypes, and shapes."""
    hdf5_path = tmp_path / "shot.h5"
    with h5py.File(hdf5_path, "w") as handle:
        handle.create_dataset("signal", data=np.asarray([1.0, 1.2]))
        handle.create_dataset("image_preview", data=np.arange(4).reshape(2, 2))

    datasets = list_hdf5_datasets(hdf5_path)

    assert [(dataset.name, dataset.shape) for dataset in datasets] == [
        ("image_preview", [2, 2]),
        ("signal", [2]),
    ]

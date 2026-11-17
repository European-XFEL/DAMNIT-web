import pytest

from damnit_api.metadata.services import _search_damnit_dir


@pytest.mark.asyncio
async def test_only_amore_counts_as_the_damnit_folder(tmp_path):
    amore = tmp_path / "usr/Shared/amore"

    # Only amore-online exists
    (tmp_path / "usr/Shared/amore-online").mkdir(parents=True)
    assert await _search_damnit_dir(tmp_path) == (None, [amore])

    # amore exists too
    amore.mkdir()
    assert await _search_damnit_dir(tmp_path) == (amore, [amore])

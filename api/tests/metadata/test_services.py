import pytest

from damnit_api.metadata.services import _search_damnit_dir


@pytest.mark.asyncio
async def test_a_proposal_with_only_amore_online_has_no_damnit_folder(tmp_path):
    (tmp_path / "usr/Shared/amore-online").mkdir(parents=True)

    damnit_path, searched = await _search_damnit_dir(tmp_path)

    assert damnit_path is None
    assert searched == [(tmp_path / "usr/Shared/amore").resolve()]

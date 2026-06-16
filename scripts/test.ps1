$ErrorActionPreference = "Stop"

$repo = Resolve-Path "$PSScriptRoot\.."
Set-Location $repo

$env:DW_API_DAMNIT_PATH = "$PWD\.damnit-test"

uv run ruff check . --fix
uv run ruff format .
uv run ruff check .
uv run pytest
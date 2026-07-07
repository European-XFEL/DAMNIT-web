param(
    [switch] $WithAcceptance
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path "$PSScriptRoot\..\.."
$apiRoot = Join-Path $repo "api"

# Run from api/, not the repo root: api/.env (auth/metadata config consumed
# by Settings()) and api/ruff.toml are resolved relative to cwd, and
# api/tests assumes that layout too (see hzdr/docs/status/testing.md). Push/Pop so the
# caller's shell returns to its starting folder.
Push-Location $apiRoot
try {
    if (-not (Test-Path ".env") -and (Test-Path ".env.test.example")) {
        Copy-Item ".env.test.example" ".env"
    }

    $env:DW_API_DAMNIT_PATH = (Join-Path $apiRoot ".damnit-test")
    $env:DW_API_AUTH__MODE = "ldap"

    uv run ruff check . --fix
    uv run ruff format .
    uv run ruff check .
    uv run pytest

    if ($WithAcceptance) {
        uv run python scripts/hzdr-local-acceptance.py
    }
} finally {
    Pop-Location
}

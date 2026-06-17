#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the test suites for DAMNIT-web-hzdr and all HZDR sibling repos.

.PARAMETER WithAcceptance
    Also run the DAMNIT local acceptance script after the API suite.

.PARAMETER Repos
    Comma-separated list of repo names to run (default: all).
    Valid names: damnit, labfrog, sqlite-tools, planet-watchdog, shotcounter, asapo

.EXAMPLE
    .\test-all.ps1
    .\test-all.ps1 -WithAcceptance
    .\test-all.ps1 -Repos damnit,planet-watchdog
#>
param(
    [switch] $WithAcceptance,
    [string[]] $Repos = @()
)

$ErrorActionPreference = "Stop"

$gitlabRoot = Resolve-Path "$PSScriptRoot\..\.."
$damnitRoot = Resolve-Path "$PSScriptRoot\.."

function Resolve-Repo([string]$name) {
    $path = Join-Path $gitlabRoot $name
    if (-not (Test-Path $path)) {
        Write-Warning "Repo not found, skipping: $path"
        return $null
    }
    return $path
}

# -- Repo definitions ----------------------------------------------------------
# Each entry: name, path, command block.
# Commands run with Set-Location already pointing at the repo root.

$allSuites = [ordered]@{
    "damnit" = @{
        label = "DAMNIT-web-hzdr"
        path  = $damnitRoot
        run   = {
            $apiRoot = Join-Path $damnitRoot "api"
            Set-Location $apiRoot
            if (-not (Test-Path ".env") -and (Test-Path ".env.test.example")) {
                Copy-Item ".env.test.example" ".env"
            }
            $env:DW_API_DAMNIT_PATH = (Join-Path $apiRoot ".damnit-test")
            uv run ruff check . --fix --quiet
            uv run ruff format . --quiet
            uv run ruff check .
            uv run pytest -q
            if ($WithAcceptance) {
                Write-Host "  [acceptance]"
                uv run python scripts/hzdr-local-acceptance.py
            }
        }
    }
    "labfrog" = @{
        label = "labfrog"
        path  = Resolve-Repo "labfrog"
        run   = {
            $env:LABFROG_TESTING    = "1"
            $env:SKIP_CUSTOM_OPTIONS = "1"
            $env:SKIP_MEDIAWIKI     = "1"
            uv run --group testing pytest -q -s tests -k "not webkit"
        }
    }
    "sqlite-tools" = @{
        label = "labfrog-sqlite-tools-repo"
        path  = Resolve-Repo "labfrog-sqlite-tools-repo"
        run   = { uv run pytest -q }
    }
    "planet-watchdog" = @{
        label = "planet-watchdog"
        path  = Resolve-Repo "planet-watchdog"
        run   = { uv run pytest -q }
    }
    "shotcounter" = @{
        label = "shotcounter"
        path  = Resolve-Repo "shotcounter"
        run   = { uv run pytest -q -k "not ntp" }
    }
    "asapo" = @{
        label = "asapo-for-hzdr-damnit"
        path  = Resolve-Repo "asapo-for-hzdr-damnit"
        run   = { uv run pytest -q }
    }
}

# -- Suite selection -----------------------------------------------------------
# $Repos may arrive as a string[] (comma-separated on CLI becomes an array) or
# empty. Flatten any embedded commas in case someone passes "a,b" as one element.
$selected = if ($Repos.Count -gt 0) {
    $Repos | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
} else {
    $allSuites.Keys
}

$invalid = $selected | Where-Object { -not $allSuites.Contains($_) }
if ($invalid) {
    Write-Error "Unknown repo name(s): $($invalid -join ', '). Valid: $($allSuites.Keys -join ', ')"
}

# -- Run -----------------------------------------------------------------------
$results  = [ordered]@{}
$startAll = Get-Date

foreach ($key in $selected) {
    $suite = $allSuites[$key]
    if (-not $suite.path -or -not (Test-Path $suite.path)) {
        $results[$key] = "SKIP (not found)"
        continue
    }

    Write-Host ""
    Write-Host "--- $($suite.label) ---" -ForegroundColor Cyan
    $start = Get-Date
    Set-Location $suite.path

    try {
        & $suite.run
        $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
        $results[$key] = "PASS ($($elapsed)s)"
    } catch {
        $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
        $results[$key] = "FAIL ($($elapsed)s)"
        Write-Host "  ERROR: $_" -ForegroundColor Red
    }
}

# -- Summary -------------------------------------------------------------------
$totalElapsed = [math]::Round(((Get-Date) - $startAll).TotalSeconds, 1)
Write-Host ""
Write-Host "--- Summary ($($totalElapsed)s) ---" -ForegroundColor Cyan
foreach ($key in $results.Keys) {
    $status = $results[$key]
    $color  = if ($status -like "PASS*") { "Green" } elseif ($status -like "SKIP*") { "Yellow" } else { "Red" }
    Write-Host ("  {0,-18} {1}" -f $allSuites[$key].label, $status) -ForegroundColor $color
}

$anyFail = $results.Values | Where-Object { $_ -like "FAIL*" }
if ($anyFail) {
    Write-Host ""
    Write-Host "One or more suites failed." -ForegroundColor Red
    exit 1
}

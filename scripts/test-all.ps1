#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the test suites for DAMNIT-web-hzdr and all HZDR sibling repos.

.PARAMETER WithAcceptance
    Also run the DAMNIT local acceptance script after the API suite.

.PARAMETER Repos
    Comma-separated list of repo names to run (default: all).
    Valid names: damnit, labfrog, sqlite-tools, planet-watchdog, shotcounter, asapo

.PARAMETER NoCoverage
    Skip pytest-cov collection, per-repo coverage-map refresh, and the aggregate
    HZDR coverage map in docs/testing.md. By default coverage is collected and
    the maps are refreshed.

.PARAMETER DockerTests
    Also run the real-broker integration tests (pytest.mark.integration_docker).
    Requires a Kafka broker reachable at $env:KAFKA_TEST_BROKER (default localhost:9092).
    Start one with: cd kafka-broker-docker && docker compose up -d

.EXAMPLE
    .\test-all.ps1
    .\test-all.ps1 -WithAcceptance
    .\test-all.ps1 -Repos damnit,planet-watchdog
    .\test-all.ps1 -NoCoverage
    .\test-all.ps1 -DockerTests
    $env:KAFKA_TEST_BROKER="myhost:9092"; .\test-all.ps1 -DockerTests
#>
param(
    [switch] $WithAcceptance,
    [string[]] $Repos = @(),
    [switch] $NoCoverage,
    [switch] $DockerTests
)

$ErrorActionPreference = "Stop"

$gitlabRoot = Resolve-Path "$PSScriptRoot\..\.."
$damnitRoot = Resolve-Path "$PSScriptRoot\.."
$script:coverage = -not $NoCoverage

# In PowerShell 5.1, $ErrorActionPreference = "Stop" does not apply to native
# executables. Wrap every native command that should fail the suite with this.
function Invoke-Exe {
    $cmd     = $args[0]
    $cmdArgs = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }
    & $cmd $cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Command exited ${LASTEXITCODE}: $($args -join ' ')"
    }
}

# When coverage is on, the per-repo pytest config already sets `--cov=<pkg>`;
# we only add the JSON report that the coverage maps read.
function Get-CovArgs {
    if ($script:coverage) { return @("--cov-report=json:cover/coverage.json") }
    return @()
}

# Refresh a repo's own per-area coverage map after its suite ran with coverage.
# Non-fatal: a stale/missing map must not turn a green suite red.
function Update-RepoMap([string] $relScript) {
    if (-not $script:coverage) { return }
    if (-not (Test-Path $relScript)) { return }
    try {
        uv run python $relScript
    } catch {
        Write-Host "  [coverage-map refresh skipped: $_]" -ForegroundColor DarkGray
    }
}

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
            Invoke-Exe uv run ruff check .
            # `--group test` activates pytest-cov (api sets default-groups = []).
            # `--cov=damnit_api` is passed here rather than in api/pyproject.toml
            # so the plain `uv run pytest` workflow stays coverage-free.
            $pa = @('run', 'python', '-m', 'pytest', '-q')
            if ($script:coverage) {
                $pa = @('run', '--group', 'test', 'python', '-m', 'pytest', '-q', '--cov=damnit_api') + (Get-CovArgs)
            }
            Invoke-Exe uv @pa
            # DAMNIT API has no per-area map; its api/cover/coverage.json feeds
            # the aggregate map refreshed at the end of this script.
            if ($WithAcceptance) {
                Write-Host "  [acceptance]"
                uv run python scripts/hzdr-local-acceptance.py
            }
            if ($DockerTests) {
                Write-Host "  [broker integration tests]"
                $brokerAddr = if ($env:KAFKA_TEST_BROKER) { $env:KAFKA_TEST_BROKER } else { "localhost:9092" }
                Write-Host "    KAFKA_TEST_BROKER=$brokerAddr" -ForegroundColor DarkGray
                $env:KAFKA_TEST_BROKER = $brokerAddr
                Invoke-Exe uv run python -m pytest -q -m integration_docker tests/test_hzdr_broker_roundtrip.py
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
            $pa = @('run', '--group', 'testing', 'python', '-m', 'pytest', '-q', '-s', 'tests', '-k', 'not webkit') + (Get-CovArgs)
            Invoke-Exe uv @pa
            Update-RepoMap "scripts/docs/refresh_coverage_map.py"
        }
    }
    "sqlite-tools" = @{
        label = "labfrog-sqlite-tools-repo"
        path  = Resolve-Repo "labfrog-sqlite-tools-repo"
        run   = {
            $pa = @('run', 'python', '-m', 'pytest', '-q') + (Get-CovArgs)
            Invoke-Exe uv @pa
            Update-RepoMap "scripts/docs/refresh_coverage_map.py"
        }
    }
    "planet-watchdog" = @{
        label = "planet-watchdog"
        path  = Resolve-Repo "planet-watchdog"
        run   = {
            $pa = @('run', 'python', '-m', 'pytest', '-q') + (Get-CovArgs)
            Invoke-Exe uv @pa
            Update-RepoMap "scripts/docs/refresh_coverage_map.py"
        }
    }
    "shotcounter" = @{
        label = "shotcounter"
        path  = Resolve-Repo "shotcounter"
        run   = {
            $pa = @('run', 'python', '-m', 'pytest', '-q', '-k', 'not ntp') + (Get-CovArgs)
            Invoke-Exe uv @pa
            Update-RepoMap "scripts/docs/refresh_coverage_map.py"
        }
    }
    "asapo" = @{
        label = "asapo-for-hzdr-damnit"
        path  = Resolve-Repo "asapo-for-hzdr-damnit"
        run   = {
            $pa = @('run', 'python', '-m', 'pytest', '-q') + (Get-CovArgs)
            Invoke-Exe uv @pa
            Update-RepoMap "scripts/docs/refresh_coverage_map.py"
        }
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

# -- Contract sync check -------------------------------------------------------
# Verifies that vendored hzdr_event.py and JSON-Schema fixtures are byte-identical
# across sibling repos. Fails fast so drift never silently reaches a test run.
# Skip when only specific repos are selected (the check spans all repos).
if ($Repos.Count -eq 0) {
    Write-Host ""
    Write-Host "--- Contract sync (hzdr_event.py + fixtures) ---" -ForegroundColor Cyan
    try {
        & "$PSScriptRoot\sync-hzdr-event.ps1"
    } catch {
        Write-Host "  Contract sync failed: $_" -ForegroundColor Red
        Write-Host "  Run: pwsh scripts/sync-hzdr-event.ps1 -Apply  to fix." -ForegroundColor Yellow
        exit 1
    }
}

# -- Run -----------------------------------------------------------------------
# Restore the caller's starting folder afterward: the loop Set-Locations into
# each repo, and PowerShell's location is process-wide.
$results  = [ordered]@{}
$startAll = Get-Date
$startLocation = Get-Location

try {
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
} finally {
    Set-Location $startLocation
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

# -- Aggregate coverage map ----------------------------------------------------
# Reads each repo's cover/coverage.json and refreshes the combined HZDR table in
# docs/testing.md. Non-fatal so it never flips the suite result.
if ($script:coverage) {
    Write-Host ""
    Write-Host "--- Coverage map (docs/testing.md) ---" -ForegroundColor Cyan
    try {
        Set-Location $damnitRoot
        uv run python scripts/docs/refresh_coverage_summary.py
    } catch {
        Write-Host "  [coverage summary refresh failed: $_]" -ForegroundColor DarkGray
    } finally {
        Set-Location $startLocation
    }
}

$anyFail = $results.Values | Where-Object { $_ -like "FAIL*" }
if ($anyFail) {
    Write-Host ""
    Write-Host "One or more suites failed." -ForegroundColor Red
    exit 1
}

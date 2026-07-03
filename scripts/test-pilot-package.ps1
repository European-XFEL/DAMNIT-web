#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the HZDR pilot package readiness gate across sibling repos.

.DESCRIPTION
    This is the deployment-facing wrapper around the existing cross-repo test
    runner. It checks the concrete Pilot_Verification_07.2026 package shape:

      * required sibling repos are present
      * local git state is visible before a pilot run
      * hzdr-event-v1 model/fixtures and Kafka topic defaults are in sync
      * pilot config files agree on campaign, topics, ASAPO-disabled policy,
        and temporary watchdog ZMQ-in/Kafka-out behavior
      * selected repo suites pass via scripts/test-all.ps1

    ASAPO is excluded by default for this pilot. Use -IncludeAsapo only when the
    deferred ASAPO/LaserData path is intentionally back in scope.

.PARAMETER Repos
    Optional comma-separated repo suite list to pass through to test-all.ps1.
    Defaults to the pilot package scope:
    damnit, labfrog, sqlite-tools, planet-watchdog, shotcounter.

.PARAMETER IncludeAsapo
    Add the asapo suite to the selected repos.

.PARAMETER NoCoverage
    Pass -NoCoverage through to test-all.ps1.

.PARAMETER WithAcceptance
    Pass -WithAcceptance through to test-all.ps1.

.PARAMETER DockerTests
    Pass -DockerTests through to test-all.ps1.

.PARAMETER Broker
    Set KAFKA_TEST_BROKER before running DockerTests. Use localhost:9092 on the
    fwkt-webapps VM, or fwkt-webapps.fz-rossendorf.de:9092 from an external host.

.PARAMETER SkipSuites
    Run only package/config/contract checks. Useful before dependencies are
    installed or before spending time on the full suite.

.PARAMETER UvCacheDir
    Cache directory to use when UV_CACHE_DIR is not already set. Defaults to
    HZDR_combo/.uv-cache, avoiding locked or permission-restricted user-profile
    caches.

.PARAMETER TempDir
    Temp directory exported as TMP, TEMP, TMPDIR, and PYTEST_DEBUG_TEMPROOT for
    child suites. Defaults to HZDR_combo/.tmp to avoid locked user-profile temp
    directories on managed Windows runners.

.PARAMETER StrictGit
    Fail when any checked repo has local modifications. By default dirty repos
    are reported as warnings so local notes such as untracked editor folders do
    not block a config-only package check.

.EXAMPLE
    pwsh scripts/test-pilot-package.ps1 -NoCoverage

.EXAMPLE
    pwsh scripts/test-pilot-package.ps1 -NoCoverage -DockerTests -Broker localhost:9092

.EXAMPLE
    pwsh scripts/test-pilot-package.ps1 -SkipSuites
#>
param(
    [string[]] $Repos = @(),
    [switch] $IncludeAsapo,
    [switch] $NoCoverage,
    [switch] $WithAcceptance,
    [switch] $DockerTests,
    [string] $Broker = "",
    [switch] $SkipSuites,
    [string] $UvCacheDir = "",
    [string] $TempDir = "",
    [switch] $StrictGit
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$damnitRoot = Resolve-Path (Join-Path $scriptDir "..")
$comboRoot = Split-Path $damnitRoot -Parent
$campaign = "Pilot_Verification_07.2026"
$dracoTopic = "draco.trigger"
$watchdogTopic = "planet.watchdog.events"
$powerShellExe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
if (-not $UvCacheDir) {
    $UvCacheDir = Join-Path $comboRoot ".uv-cache"
}
if (-not $env:UV_CACHE_DIR) {
    New-Item -ItemType Directory -Force $UvCacheDir | Out-Null
    $env:UV_CACHE_DIR = $UvCacheDir
}
if (-not $TempDir) {
    $TempDir = Join-Path $comboRoot ".tmp"
}
New-Item -ItemType Directory -Force $TempDir | Out-Null
$env:TMP = $TempDir
$env:TEMP = $TempDir
$env:TMPDIR = $TempDir
$env:PYTEST_DEBUG_TEMPROOT = $TempDir

function Write-Step([string] $title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

function Invoke-Exe {
    $cmd = $args[0]
    $cmdArgs = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }
    & $cmd $cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Command exited ${LASTEXITCODE}: $($args -join ' ')"
    }
}

function Assert-True([bool] $condition, [string] $message) {
    if (-not $condition) {
        throw $message
    }
}

function Assert-Text([string] $path, [string] $pattern, [string] $message) {
    $text = Get-Content $path -Raw
    Assert-True ($text -match $pattern) $message
}

function Resolve-Repo([string] $name) {
    Join-Path $comboRoot $name
}

function Get-GitStatusLines([string] $path) {
    $safePath = $path.Replace("\", "/")
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & git -c "safe.directory=$safePath" -C $path status --short 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    $lines = @($output | ForEach-Object { $_.ToString() } | Where-Object {
        $_ -and ($_ -notmatch "warning: unable to access '.+\.config/git/ignore'")
    })
    if ($exitCode -ne 0) {
        throw "git status failed in ${path}: $($lines -join "`n")"
    }
    $lines
}

function Read-TopicRegistry([string] $path) {
    $registry = @{}
    Get-Content $path | ForEach-Object {
        if ($_ -match "^(TOPIC_\w+)=(.+)$") {
            $registry[$Matches[1]] = $Matches[2].Trim()
        }
    }
    $registry
}

function Get-SelectedSuites {
    $selected = if ($Repos.Count -gt 0) {
        $Repos | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    } else {
        @("damnit", "labfrog", "sqlite-tools", "planet-watchdog", "shotcounter")
    }
    if ($IncludeAsapo -and ($selected -notcontains "asapo")) {
        $selected += "asapo"
    }
    $selected
}

Write-Host "HZDR pilot package gate"
Write-Host "  Combo root:   $comboRoot"
Write-Host "  Campaign:     $campaign"
Write-Host "  ASAPO scope:  $(if ($IncludeAsapo) { 'included' } else { 'excluded' })"
Write-Host "  UV cache:     $env:UV_CACHE_DIR"
Write-Host "  Temp root:    $TempDir"

$requiredRepos = @(
    "DAMNIT-web-hzdr",
    "fwkt-webapps",
    "kafka-broker-docker",
    "labfrog",
    "labfrog-sqlite-tools-repo",
    "planet-watchdog",
    "shotcounter"
)

Write-Step "Repo presence"
foreach ($repo in $requiredRepos) {
    $path = Resolve-Repo $repo
    Assert-True (Test-Path $path) "Required repo not found: $path"
    Write-Host "  OK $repo" -ForegroundColor Green
}
if ($IncludeAsapo) {
    $path = Resolve-Repo "asapo-for-hzdr-damnit"
    Assert-True (Test-Path $path) "ASAPO repo not found: $path"
    Write-Host "  OK asapo-for-hzdr-damnit" -ForegroundColor Green
}

Write-Step "Git state"
$dirtyRepos = @()
foreach ($repo in $requiredRepos) {
    $path = Resolve-Repo $repo
    $lines = Get-GitStatusLines $path
    if ($lines.Count -eq 0) {
        Write-Host ("  {0,-26} clean" -f $repo) -ForegroundColor Green
    } else {
        $dirtyRepos += $repo
        Write-Host ("  {0,-26} local changes:" -f $repo) -ForegroundColor Yellow
        $lines | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
    }
}
if ($StrictGit -and $dirtyRepos.Count -gt 0) {
    throw "StrictGit enabled and local changes are present: $($dirtyRepos -join ', ')"
}

Write-Step "Contract sync"
Invoke-Exe $powerShellExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "sync-hzdr-event.ps1")

Write-Step "Pilot config conformance"
$topicsPath = Resolve-Repo "kafka-broker-docker\topics.env"
Assert-True (Test-Path $topicsPath) "Topic registry not found: $topicsPath"
$topics = Read-TopicRegistry $topicsPath
Assert-True ($topics["TOPIC_DRACO_TRIGGER"] -eq $dracoTopic) "TOPIC_DRACO_TRIGGER must be $dracoTopic"
Assert-True ($topics["TOPIC_WATCHDOG_EVENTS"] -eq $watchdogTopic) "TOPIC_WATCHDOG_EVENTS must be $watchdogTopic"
Write-Host "  OK Kafka topic registry" -ForegroundColor Green

$watchdogConfigPath = Resolve-Repo "planet-watchdog\settings\watchdog.pilot.json.example"
Assert-True (Test-Path $watchdogConfigPath) "Watchdog pilot config not found: $watchdogConfigPath"
$watchdogConfig = Get-Content $watchdogConfigPath -Raw | ConvertFrom-Json
Assert-True ($watchdogConfig.features.message_input -eq "zmq") "Watchdog pilot input must be ZMQ for the temporary bridge"
Assert-True ($watchdogConfig.features.zmq_attach_enabled -eq $true) "Watchdog ZMQ attach must be enabled"
Assert-True ($watchdogConfig.features.kafka_output_enabled -eq $true) "Watchdog Kafka feature flag must be enabled"
Assert-True ($watchdogConfig.kafka.input_enabled -eq $false) "Watchdog Kafka input must stay disabled for the ZMQ bridge"
Assert-True ($watchdogConfig.kafka.output_enabled -eq $true) "Watchdog Kafka output must be enabled"
Assert-True ($watchdogConfig.kafka.output_format -eq "hzdr_event") "Watchdog output format must be hzdr_event"
Assert-True ($watchdogConfig.kafka.output_topic -eq $watchdogTopic) "Watchdog output topic must be $watchdogTopic"
Assert-True ($watchdogConfig.kafka.output_experiment_id -eq $campaign) "Watchdog campaign must be $campaign"
Write-Host "  OK watchdog ZMQ-in/Kafka-out pilot bridge" -ForegroundColor Green

$damnitEnvPath = Resolve-Repo "DAMNIT-web-hzdr\api\.env.pilot.example"
Assert-True (Test-Path $damnitEnvPath) "DAMNIT pilot env not found: $damnitEnvPath"
Assert-Text $damnitEnvPath "DW_API_HZDR_SPOOL__ENABLED=false" "DAMNIT ASAPO spool must stay disabled"
Assert-Text $damnitEnvPath "DW_API_HZDR_KAFKA_SPOOL__ENABLED=true" "DAMNIT Kafka spool must be enabled"
Assert-Text $damnitEnvPath "DW_API_HZDR_KAFKA_SPOOL__TOPICS=\[`"$dracoTopic`",`"$watchdogTopic`"\]" "DAMNIT Kafka topics must include both canonical topics"
Assert-Text $damnitEnvPath "DW_API_HZDR_KAFKA_SPOOL__CAMPAIGN=$campaign" "DAMNIT Kafka campaign must be $campaign"
Write-Host "  OK DAMNIT Kafka-spool pilot env" -ForegroundColor Green

$brokerEnvPath = Resolve-Repo "kafka-broker-docker\env.pilot.example"
Assert-True (Test-Path $brokerEnvPath) "Broker pilot env not found: $brokerEnvPath"
Assert-Text $brokerEnvPath "fwkt-webapps\.fz-rossendorf\.de:9092" "Broker pilot env must advertise fwkt-webapps.fz-rossendorf.de:9092"
Write-Host "  OK broker pilot env" -ForegroundColor Green

if ($SkipSuites) {
    Write-Host ""
    Write-Host "Package/config checks passed; suite run skipped by -SkipSuites." -ForegroundColor Green
    exit 0
}

Write-Step "Cross-repo suites"
$selectedSuites = Get-SelectedSuites
$testArgs = @()
if ($selectedSuites.Count -gt 0) {
    $testArgs += "-Repos"
    $testArgs += ($selectedSuites -join ",")
}
if ($NoCoverage) { $testArgs += "-NoCoverage" }
if ($WithAcceptance) { $testArgs += "-WithAcceptance" }
if ($DockerTests) { $testArgs += "-DockerTests" }
if ($Broker) {
    $env:KAFKA_TEST_BROKER = $Broker
    Write-Host "  KAFKA_TEST_BROKER=$Broker" -ForegroundColor DarkGray
}

Invoke-Exe $powerShellExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "test-all.ps1") @testArgs

Write-Host ""
Write-Host "Pilot package gate passed." -ForegroundColor Green

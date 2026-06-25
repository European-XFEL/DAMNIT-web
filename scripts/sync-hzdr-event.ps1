#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Check (or apply) consistency of the vendored hzdr_event.py and JSON schema
    fixtures across all sibling repos.

.DESCRIPTION
    DAMNIT-web-hzdr is the canonical source for the hzdr-event-v1 contract:

        api/src/damnit_api/metadata/hzdr_event.py          (Pydantic model)
        api/tests/fixtures/hzdr-event-v1.schema.json       (JSON Schema)
        api/tests/fixtures/hzdr-event-v1.sample.json       (sample event)

    These are vendored into:

        planet-watchdog/watchdog_core/hzdr_event.py
        planet-watchdog/tests/fixtures/hzdr-event-v1.*
        shotcounter/tests/fixtures/hzdr-event-v1.*

    In Check mode (default): fails with a diff if any copy has drifted.
    In Apply mode: copies canonical files into all sibling repos.

    Note: DAMNIT's own test suite (test_hzdr_event.py) verifies that the
    committed fixtures match the current model; this script only checks that
    sibling-repo copies are byte-identical to DAMNIT's committed fixtures.

.PARAMETER Apply
    Copy canonical files to sibling repos instead of only checking.

.EXAMPLE
    .\sync-hzdr-event.ps1
    .\sync-hzdr-event.ps1 -Apply
#>
param(
    [switch] $Apply
)

$ErrorActionPreference = "Stop"

# Use Split-Path on the script's own path for reliable root computation
# (avoids $PSScriptRoot edge cases in PS 5.1).
$scriptDir  = Split-Path $MyInvocation.MyCommand.Path -Parent
$damnitRoot = Split-Path $scriptDir  -Parent
$gitlabRoot = Split-Path $damnitRoot -Parent   # ..\HZDR_combo

$script:driftFound = $false

function Fail([string] $msg) {
    Write-Host "  DRIFT: $msg" -ForegroundColor Red
    $script:driftFound = $true
}

function Compare-FilePair([string] $canonical, [string] $copy, [string] $label) {
    if (-not (Test-Path $copy)) {
        Fail "$label — not found at: $copy"
        return
    }
    $a = [System.IO.File]::ReadAllText($canonical)
    $b = [System.IO.File]::ReadAllText($copy)
    if ($a -ne $b) {
        Fail "$label — differs from canonical"
        # Show first few differing lines as a hint
        $aLines = $a -split "`n"
        $bLines = $b -split "`n"
        $maxLines = [math]::Min($aLines.Count, $bLines.Count)
        $shown = 0
        for ($i = 0; $i -lt $maxLines -and $shown -lt 8; $i++) {
            if ($aLines[$i] -ne $bLines[$i]) {
                Write-Host ("    canonical: {0}" -f $aLines[$i]) -ForegroundColor Yellow
                Write-Host ("    copy:      {0}" -f $bLines[$i]) -ForegroundColor Cyan
                $shown++
            }
        }
        if ($aLines.Count -ne $bLines.Count) {
            Write-Host "    (line counts differ: canonical=$($aLines.Count) copy=$($bLines.Count))" -ForegroundColor DarkGray
        }
    }
}

function Apply-FilePair([string] $canonical, [string] $destDir, [string] $filename, [string] $label) {
    $dest = Join-Path $destDir $filename
    New-Item -ItemType Directory -Force $destDir | Out-Null
    Copy-Item $canonical $dest -Force
    Write-Host "  Applied: $filename -> $label" -ForegroundColor Green
}

$apiRoot      = Join-Path $damnitRoot "api"
$fixturesDir  = Join-Path $apiRoot    "tests\fixtures"
$canonicalPy  = Join-Path $apiRoot    "src\damnit_api\metadata\hzdr_event.py"

$watchdogRoot = Join-Path $gitlabRoot "planet-watchdog"
$shotRoot     = Join-Path $gitlabRoot "shotcounter"

Write-Host ""
Write-Host "--- Contract sync (hzdr_event.py + fixtures) ---" -ForegroundColor Cyan
Write-Host "    Canonical root: $damnitRoot"
Write-Host "    Sibling root:   $gitlabRoot"

# 1. hzdr_event.py: DAMNIT canonical vs planet-watchdog vendored copy.
Write-Host "  Checking hzdr_event.py..."
$pwPyDest = Join-Path $watchdogRoot "watchdog_core"
$pwPyCopy = Join-Path $pwPyDest     "hzdr_event.py"
if ($Apply) {
    if (Test-Path $watchdogRoot) {
        Apply-FilePair $canonicalPy $pwPyDest "hzdr_event.py" "planet-watchdog/watchdog_core"
    } else {
        Write-Host "  Skipped planet-watchdog (not found at $watchdogRoot)" -ForegroundColor DarkGray
    }
} else {
    if (Test-Path $watchdogRoot) {
        Compare-FilePair $canonicalPy $pwPyCopy "planet-watchdog/watchdog_core/hzdr_event.py"
    } else {
        Write-Host "  Skipped planet-watchdog (not found at $watchdogRoot)" -ForegroundColor DarkGray
    }
}

# 2. Fixture files (schema + sample) into planet-watchdog and shotcounter.
Write-Host "  Checking fixture files..."
$fixtureFiles = @("hzdr-event-v1.schema.json", "hzdr-event-v1.sample.json")
$siblings = @(
    @{ root = $watchdogRoot; label = "planet-watchdog" },
    @{ root = $shotRoot;     label = "shotcounter" }
)
foreach ($sibling in $siblings) {
    if (-not (Test-Path $sibling.root)) {
        Write-Host "  Skipped $($sibling.label) (not found at $($sibling.root))" -ForegroundColor DarkGray
        continue
    }
    $sibFix = Join-Path $sibling.root "tests\fixtures"
    foreach ($file in $fixtureFiles) {
        $src  = Join-Path $fixturesDir $file
        $dest = Join-Path $sibFix $file
        if ($Apply) {
            Apply-FilePair $src $sibFix $file $sibling.label
        } else {
            Compare-FilePair $src $dest "$($sibling.label)/tests/fixtures/$file"
        }
    }
}

# 3. Topic-registry conformance: key default topic values in each repo must
#    match what kafka-broker-docker/topics.env documents.
Write-Host "  Checking topic-registry defaults..."
$topicsEnv = Join-Path $gitlabRoot "kafka-broker-docker\topics.env"
if (Test-Path $topicsEnv) {
    # Parse registry: lines matching TOPIC_<SLUG>=<value>
    $registry = @{}
    Get-Content $topicsEnv | ForEach-Object {
        if ($_ -match '^TOPIC_\w+=(.+)$') { $null = $_ -match '^TOPIC_\w+=(.+)$' }
        if ($_ -match '^(TOPIC_\w+)=(.+)$') { $registry[$Matches[1]] = $Matches[2].Trim() }
    }
    $dracoTopic   = $registry["TOPIC_DRACO_TRIGGER"]
    $watchdogTopic = $registry["TOPIC_WATCHDOG_EVENTS"]

    # shotcounter add_server.py default (pattern: "KafkaTopic": os.environ.get("...", "draco.trigger"))
    $scAddServer = Join-Path $shotRoot "scripts\add_server.py"
    if (Test-Path $scAddServer) {
        $content = Get-Content $scAddServer -Raw
        if ($content -match '"KafkaTopic"[^"]*environ\.get\("[^"]+",\s*"([^"]+)"') {
            $found = $Matches[1]
            if ($found -ne $dracoTopic) {
                Fail "shotcounter/scripts/add_server.py KafkaTopic default '$found' != registry '$dracoTopic'"
            }
        }
    }

    # shotcounter start_local.sh default
    $scStart = Join-Path $shotRoot "scripts\start_local.sh"
    if (Test-Path $scStart) {
        $content = Get-Content $scStart -Raw
        if ($content -match 'topic=(\S+)') {
            $found = $Matches[1]
            if ($found -ne $dracoTopic) {
                Fail "shotcounter/scripts/start_local.sh topic default '$found' != registry '$dracoTopic'"
            }
        }
    }

    # planet-watchdog/watchdog_core/config.py output_topic default
    $pwConfig = Join-Path $watchdogRoot "watchdog_core\config.py"
    if (Test-Path $pwConfig) {
        $content = Get-Content $pwConfig -Raw
        if ($content -match '"output_topic":\s*"([^"]+)"') {
            $found = $Matches[1]
            if ($found -ne $watchdogTopic) {
                Fail "planet-watchdog/watchdog_core/config.py output_topic '$found' != registry '$watchdogTopic'"
            }
        }
    }

    # DAMNIT routers.py WATCHDOG_KAFKA_TOPIC constant
    $routersFile = Join-Path $apiRoot "src\damnit_api\metadata\routers.py"
    if (Test-Path $routersFile) {
        $content = Get-Content $routersFile -Raw
        if ($content -match 'WATCHDOG_KAFKA_TOPIC\s*=\s*"([^"]+)"') {
            $found = $Matches[1]
            if ($found -ne $watchdogTopic) {
                Fail "DAMNIT metadata/routers.py WATCHDOG_KAFKA_TOPIC '$found' != registry '$watchdogTopic'"
            }
        }
    }
} else {
    Write-Host "  Skipped topic-registry check (kafka-broker-docker not found)" -ForegroundColor DarkGray
}

if ($script:driftFound) {
    Write-Host ""
    Write-Host "Contract drift detected." -ForegroundColor Red
    Write-Host "To sync model+fixtures: pwsh scripts/sync-hzdr-event.ps1 -Apply" -ForegroundColor Yellow
    Write-Host "If the model changed: run api/scripts/regen_hzdr_event_fixtures.py first, then -Apply." -ForegroundColor Yellow
    Write-Host "For topic mismatches: update kafka-broker-docker/topics.env and each repo's default." -ForegroundColor Yellow
    exit 1
} elseif (-not $Apply) {
    Write-Host "  All contract copies and topic defaults in sync." -ForegroundColor Green
}

param(
    [string] $ConfigPath = "",
    [switch] $InitConfig,
    [switch] $NoApi,
    [switch] $NoGui,
    [switch] $NoBroker,
    [switch] $ValidateOnly
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string] $Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Resolve-ConfigPath {
    param(
        [string] $PathValue,
        [string] $BaseDir
    )

    if (-not $PathValue) {
        return ""
    }
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return (Resolve-Path $PathValue).Path
    }
    return (Resolve-Path (Join-Path $BaseDir $PathValue)).Path
}

function Find-RelatedRepository {
    param(
        [string] $StartDir,
        [string] $RepoName
    )

    $current = (Resolve-Path $StartDir).Path
    while ($true) {
        $candidate = Join-Path $current $RepoName
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }

        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) {
            return ""
        }
        $current = $parent
    }
}

function Resolve-RepositoryPath {
    param(
        [string] $PathValue,
        [string] $BaseDir,
        [string] $RepoName,
        [string] $Label,
        [string] $SearchStart,
        [string] $DefaultPath = ""
    )

    if ($PathValue) {
        $candidate = if ([System.IO.Path]::IsPathRooted($PathValue)) {
            $PathValue
        }
        else {
            Join-Path $BaseDir $PathValue
        }
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    if ($DefaultPath -and (Test-Path $DefaultPath)) {
        return (Resolve-Path $DefaultPath).Path
    }

    $discovered = Find-RelatedRepository -StartDir $SearchStart -RepoName $RepoName
    if ($discovered) {
        return $discovered
    }

    throw "Could not find $Label repository. Set repositories.$RepoName in the launch config, or place $RepoName in this checkout or a parent folder."
}

function Resolve-OptionalRepositoryPath {
    param(
        [string] $PathValue,
        [string] $BaseDir,
        [string] $RepoName,
        [string] $SearchStart
    )

    if ($PathValue) {
        $candidate = if ([System.IO.Path]::IsPathRooted($PathValue)) {
            $PathValue
        }
        else {
            Join-Path $BaseDir $PathValue
        }
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    return Find-RelatedRepository -StartDir $SearchStart -RepoName $RepoName
}

function Resolve-DefaultEventsDir {
    param([string] $AsapoRoot)

    $examplesDir = Join-Path $AsapoRoot "examples"
    if (
        (Test-Path $examplesDir) -and
        (Get-ChildItem -Path $examplesDir -Filter "*.json" -File -ErrorAction SilentlyContinue | Select-Object -First 1)
    ) {
        return (Resolve-Path $examplesDir).Path
    }

    if (Get-ChildItem -Path $AsapoRoot -Filter "*.json" -File -ErrorAction SilentlyContinue | Select-Object -First 1) {
        return (Resolve-Path $AsapoRoot).Path
    }

    return $examplesDir
}

function Test-CommandAvailable {
    param([string] $Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-ConfigValue {
    param(
        $Value,
        $Default
    )

    if ($null -eq $Value -or $Value -eq "") {
        return $Default
    }
    return $Value
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Command,
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,
        [string] $WorkingDirectory = (Get-Location).Path
    )

    Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $Command"
        }
    }
    finally {
        Pop-Location
    }
}

function Test-TcpPort {
    param(
        [string] $HostName,
        [int] $Port
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(1000)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Wait-TcpPort {
    param(
        [string] $Name,
        [string] $HostName,
        [int] $Port,
        [int] $TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort -HostName $HostName -Port $Port) {
            Write-Host "$Name is reachable at ${HostName}:$Port" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 1
    }
    throw "$Name did not become reachable at ${HostName}:$Port within ${TimeoutSeconds}s"
}

function Start-AsapoLocalBroker {
    param(
        [string] $AsapoRoot,
        [string] $DamnitRoot,
        [int] $Port
    )

    if (Test-TcpPort -HostName "127.0.0.1" -Port $Port) {
        Write-Host "ASAPO local broker already reachable at 127.0.0.1:$Port" -ForegroundColor Green
        return
    }

    $spoolDir = Join-Path $DamnitRoot ".generated\asapo-broker-spool"
    New-Item -ItemType Directory -Force -Path $spoolDir | Out-Null
    $stdout = Join-Path $spoolDir "local-broker.stdout.log"
    $stderr = Join-Path $spoolDir "local-broker.stderr.log"

    if (Test-CommandAvailable "node") {
        Start-Process -FilePath "node" `
            -ArgumentList @("tools/local-message-suite.js", "broker", "--port", "$Port", "--spool-dir", $spoolDir) `
            -WorkingDirectory $AsapoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden | Out-Null
    }
    elseif (Test-CommandAvailable "python") {
        Start-Process -FilePath "python" `
            -ArgumentList @("tools/local_message_suite.py", "broker", "--port", "$Port", "--spool-dir", $spoolDir) `
            -WorkingDirectory $AsapoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden | Out-Null
    }
    else {
        throw "Neither node nor python is available for the ASAPO local broker."
    }

    Wait-TcpPort -Name "ASAPO local broker" -HostName "127.0.0.1" -Port $Port
}

function Start-OptionalDockerService {
    param(
        [string] $Name,
        [string] $Root,
        [string[]] $Arguments,
        [int] $Port
    )

    if (-not (Test-CommandAvailable "docker")) {
        throw "docker is required to start $Name"
    }
    Write-Step "Starting $Name"
    Invoke-Checked "docker" $Arguments $Root
    Wait-TcpPort -Name $Name -HostName "127.0.0.1" -Port $Port
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
$defaultConfigPath = Join-Path $scriptRoot "hzdr-launch.config.json"
$exampleConfigPath = Join-Path $scriptRoot "hzdr-launch.config.example.json"
$selectedConfigPath = if ($ConfigPath) { $ConfigPath } else { $defaultConfigPath }

if ($InitConfig) {
    if (Test-Path $selectedConfigPath) {
        Write-Host "Config already exists: $selectedConfigPath" -ForegroundColor Yellow
    }
    else {
        Copy-Item $exampleConfigPath $selectedConfigPath
        Write-Host "Created config: $selectedConfigPath" -ForegroundColor Green
    }
    Write-Host "Edit repository paths, then run:"
    Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\hzdr\scripts\hzdr-launch.ps1"
    exit 0
}

if (-not (Test-Path $selectedConfigPath)) {
    throw "Config file not found: $selectedConfigPath. Create one with -InitConfig."
}

$configDir = Split-Path -Parent (Resolve-Path $selectedConfigPath)
$config = Get-Content -Path $selectedConfigPath -Raw | ConvertFrom-Json

$damnitRoot = Resolve-RepositoryPath `
    -PathValue $config.repositories.damnitWeb `
    -BaseDir $configDir `
    -RepoName "DAMNIT-web-hzdr" `
    -Label "DAMNIT-web" `
    -SearchStart $repoRoot `
    -DefaultPath $repoRoot
$asapoRoot = Resolve-RepositoryPath `
    -PathValue $config.repositories.asapoHarness `
    -BaseDir $configDir `
    -RepoName "asapo-for-hzdr-damnit" `
    -Label "ASAPO harness" `
    -SearchStart $repoRoot
$kafkaRoot = Resolve-RepositoryPath `
    -PathValue $config.repositories.kafkaBroker `
    -BaseDir $configDir `
    -RepoName "kafka-broker-docker" `
    -Label "Kafka broker" `
    -SearchStart $repoRoot
$labfrogRoot = Resolve-RepositoryPath `
    -PathValue $config.repositories.labfrog `
    -BaseDir $configDir `
    -RepoName "labfrog" `
    -Label "LabFrog" `
    -SearchStart $repoRoot
$labfrogSqliteToolsRoot = Resolve-RepositoryPath `
    -PathValue $config.repositories.labfrogSqliteTools `
    -BaseDir $configDir `
    -RepoName "labfrog-sqlite-tools-repo" `
    -Label "LabFrog SQLite tools" `
    -SearchStart $repoRoot
$planetWatchdogRoot = Resolve-OptionalRepositoryPath `
    -PathValue $config.repositories.planetWatchdog `
    -BaseDir $configDir `
    -RepoName "planet-watchdog" `
    -SearchStart $repoRoot


$apiPort = [int](Get-ConfigValue $config.ports.api 8000)
$guiPort = [int](Get-ConfigValue $config.ports.gui 5173)
$asapoPort = [int](Get-ConfigValue $config.ports.asapoBroker 8765)
$kafkaPort = [int](Get-ConfigValue $config.ports.kafka 9092)
$mongoPort = [int](Get-ConfigValue $config.ports.mongo 27018)

# Parity with hzdr-launch.sh: config auth.mode wins, then an existing
# DW_API_AUTH__MODE, then hzdr-dev.ps1's ldap default (empty = not forwarded).
$authMode = [string](Get-ConfigValue $config.auth.mode "")

$sourceKey = [string](Get-ConfigValue $config.emulator.sourceKey "hzdr-emulator")
$experimentId = [string](Get-ConfigValue $config.emulator.experimentId "")
$shotCount = [int](Get-ConfigValue $config.emulator.shotCount 6)
$shotIncrement = [int](Get-ConfigValue $config.emulator.shotIncrement 1)
$eventsDir = if ($config.emulator.eventsDir) {
    Resolve-ConfigPath $config.emulator.eventsDir $configDir
}
else {
    Resolve-DefaultEventsDir $asapoRoot
}
$outputDir = if ($config.emulator.outputDir) {
    Resolve-ConfigPath $config.emulator.outputDir $configDir
}
else {
    Join-Path $damnitRoot ".generated\hzdr-package-emulator"
}

Write-Step "Configuration"
Write-Host "DAMNIT-web: $damnitRoot"
Write-Host "ASAPO harness: $asapoRoot"
Write-Host "Kafka broker: $kafkaRoot"
Write-Host "LabFrog: $labfrogRoot"
Write-Host "LabFrog SQLite tools: $labfrogSqliteToolsRoot"
Write-Host "DAQ File Watchdog: $(if ($planetWatchdogRoot) { $planetWatchdogRoot } else { 'not found (skipped)' })"

Write-Host "Event packages: $eventsDir"
Write-Host "Emulator output: $outputDir"
Write-Host "Generated shots: $shotCount, increment: $shotIncrement"
Write-Host "Flow monitor: http://127.0.0.1:$guiPort/flow-monitor"

Write-Step "Prerequisites"
foreach ($command in @("uv", "node")) {
    if (Test-CommandAvailable $command) {
        Write-Host "$command found" -ForegroundColor Green
    }
    else {
        Write-Warning "$command was not found on PATH"
    }
}
if (Test-CommandAvailable "pnpm") {
    Write-Host "pnpm found" -ForegroundColor Green
}
elseif (Test-CommandAvailable "corepack") {
    Write-Host "corepack found; GUI startup can use corepack pnpm" -ForegroundColor Green
}
else {
    Write-Warning "neither pnpm nor corepack was found for GUI startup"
}

if ($ValidateOnly) {
    Write-Host "Validation complete. Nothing was started because -ValidateOnly was set." -ForegroundColor Green
    exit 0
}

if ($config.emulator.startLabfrog) {
    Start-OptionalDockerService `
        -Name "LabFrog MongoDB" `
        -Root $labfrogRoot `
        -Arguments @("compose", "-f", "compose.yaml", "up", "-d", "mongo", "mongo-express") `
        -Port $mongoPort
}

if ($config.emulator.startKafka) {
    Start-OptionalDockerService `
        -Name "Kafka" `
        -Root $kafkaRoot `
        -Arguments @("compose", "up", "-d") `
        -Port $kafkaPort
}

if ($config.emulator.startAsapoBroker -and -not $NoBroker) {
    Write-Step "Starting ASAPO-style local broker"
    Start-AsapoLocalBroker -AsapoRoot $asapoRoot -DamnitRoot $damnitRoot -Port $asapoPort
}

Write-Step "Generating package emulator output"
$apiRoot = Join-Path $damnitRoot "api"
$emulatorArguments = @(
    "run",
    "python",
    "scripts/hzdr-package-emulator.py",
    "--events-dir",
    $eventsDir,
    "--output-dir",
    $outputDir,
    "--source-key",
    $sourceKey,
    "--shot-count",
    "$shotCount",
    "--shot-increment",
    "$shotIncrement"
)
if ($experimentId) {
    $emulatorArguments += @("--experiment-id", $experimentId)
}
Invoke-Checked "uv" $emulatorArguments $apiRoot

$sourcesFile = Join-Path $outputDir "hzdr_sources.json"
if (-not (Test-Path $sourcesFile)) {
    throw "Package emulator did not create expected sources file: $sourcesFile"
}

$env:DW_API_FLOW_MONITOR__RECEIVERS__LASER_DATA = [Convert]::ToString([bool](Get-ConfigValue $config.flowMonitor.receivers.laserData $true)).ToLowerInvariant()
$env:DW_API_FLOW_MONITOR__RECEIVERS__WATCHDOG = [Convert]::ToString([bool](Get-ConfigValue $config.flowMonitor.receivers.watchdog $true)).ToLowerInvariant()

$env:DW_API_FLOW_MONITOR__RECEIVERS__MONGO = [Convert]::ToString([bool](Get-ConfigValue $config.flowMonitor.receivers.mongo $true)).ToLowerInvariant()

# Per-producer-box settings (Shotcounter TKEYs, Watchdog watcher rules, Mongo
# sqlite sync, ...) come from this launch config file's flowMonitor.producers
# section. Each is forwarded as one JSON env var, matching how the API
# already accepts DW_API_*__... settings - so the frontend's Flow Monitor
# renders whatever is configured here instead of a hard-coded option list.
# Producers omitted from the config keep the API's built-in defaults.
$producers = $config.flowMonitor.producers
if ($producers.shotcounter) {
    $env:DW_API_FLOW_MONITOR__PRODUCERS__SHOTCOUNTER = ($producers.shotcounter | ConvertTo-Json -Depth 10 -Compress)
}
if ($producers.laserData) {
    $env:DW_API_FLOW_MONITOR__PRODUCERS__LASER_DATA = ($producers.laserData | ConvertTo-Json -Depth 10 -Compress)
}
if ($producers.watchdog) {
    $env:DW_API_FLOW_MONITOR__PRODUCERS__WATCHDOG = ($producers.watchdog | ConvertTo-Json -Depth 10 -Compress)
}
if ($producers.mongo) {
    $env:DW_API_FLOW_MONITOR__PRODUCERS__MONGO = ($producers.mongo | ConvertTo-Json -Depth 10 -Compress)
}

Write-Step "Starting DAMNIT-web"
$devScript = Join-Path $apiRoot "scripts\hzdr-dev.ps1"
$devArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $devScript,
    "-Provider",
    "local",
    "-SourcesFile",
    (Resolve-Path $sourcesFile).Path,
    "-SourceKey",
    $sourceKey,
    "-Port",
    "$apiPort",
    "-GuiPort",
    "$guiPort"
)
if ($authMode) {
    $devArguments += @("-AuthMode", $authMode)
}
if (-not $NoGui) {
    $devArguments += "-WithGui"
}
if ($NoApi) {
    $devArguments += "-NoApi"
}

Write-Host "Home: http://127.0.0.1:$guiPort/home"
Write-Host "Flow monitor: http://127.0.0.1:$guiPort/flow-monitor"
Write-Host "API sources: http://127.0.0.1:$apiPort/metadata/hzdr/sources"

if ($config.emulator.openFlowMonitor) {
    Start-Process "http://127.0.0.1:$guiPort/flow-monitor" | Out-Null
}

& powershell @devArguments

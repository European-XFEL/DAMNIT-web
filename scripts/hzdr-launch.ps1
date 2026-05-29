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
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
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
    Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1"
    exit 0
}

if (-not (Test-Path $selectedConfigPath)) {
    throw "Config file not found: $selectedConfigPath. Create one with -InitConfig."
}

$configDir = Split-Path -Parent (Resolve-Path $selectedConfigPath)
$config = Get-Content -Path $selectedConfigPath -Raw | ConvertFrom-Json

$damnitRoot = Resolve-ConfigPath (Get-ConfigValue $config.repositories.damnitWeb $repoRoot) $configDir
$asapoRoot = Resolve-ConfigPath $config.repositories.asapoHarness $configDir
$kafkaRoot = Resolve-ConfigPath $config.repositories.kafkaBroker $configDir
$labfrogRoot = Resolve-ConfigPath $config.repositories.labfrog $configDir

$apiPort = [int](Get-ConfigValue $config.ports.api 8000)
$guiPort = [int](Get-ConfigValue $config.ports.gui 5173)
$asapoPort = [int](Get-ConfigValue $config.ports.asapoBroker 8765)
$kafkaPort = [int](Get-ConfigValue $config.ports.kafka 9092)
$mongoPort = [int](Get-ConfigValue $config.ports.mongo 27018)

$sourceKey = [string](Get-ConfigValue $config.emulator.sourceKey "hzdr-emulator")
$experimentId = [string](Get-ConfigValue $config.emulator.experimentId "")
$shotCount = [int](Get-ConfigValue $config.emulator.shotCount 6)
$shotIncrement = [int](Get-ConfigValue $config.emulator.shotIncrement 1)
$eventsDir = if ($config.emulator.eventsDir) {
    Resolve-ConfigPath $config.emulator.eventsDir $configDir
}
else {
    Join-Path $asapoRoot "examples"
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

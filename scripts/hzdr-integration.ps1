param(
    [string] $ProjectsRoot = "",
    [int] $AsapoPort = 8765,
    [int] $KafkaPort = 9092,
    [int] $MongoPort = 27018,
    [int] $ApiPort = 8000,
    [string] $AsapoSpoolDir = "",
    [string] $PackageEventsDir = "",
    [string] $PackageOutputDir = "",
    [string] $ExperimentId = "",
    [int] $ShotCount = 6,
    [int] $ShotIncrement = 1,
    [string] $MongoUri = "",
    [string] $SourceKey = "hzdr-labfrog",
    [switch] $StartLabfrog,
    [switch] $StartKafka,
    [switch] $StartAsapoBroker,
    [switch] $RunPackageEmulator,
    [switch] $RunAsapoRoundtrip,
    [switch] $RunKafkaRoundtrip,
    [switch] $RunWatchdogVerifier,
    [switch] $RunApiSmoke,
    [switch] $RunApiTests,
    [switch] $NoWait
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string] $Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Resolve-ProjectRoot {
    if ($ProjectsRoot) {
        return (Resolve-Path $ProjectsRoot).Path
    }
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Test-CommandAvailable {
    param([string] $Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
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

    if ($NoWait) {
        return
    }

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

function Assert-ProjectPath {
    param(
        [string] $Root,
        [string] $Name
    )

    $current = (Resolve-Path $Root).Path
    while ($true) {
        $path = Join-Path $current $Name
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }

        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) {
            throw "Expected related project not found while searching upward for ${Name} from $Root"
        }
        $current = $parent
    }
}

function Find-OptionalProjectPath {
    param(
        [string] $Root,
        [string] $Name
    )

    $current = (Resolve-Path $Root).Path
    while ($true) {
        $path = Join-Path $current $Name
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }

        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) {
            return ""
        }
        $current = $parent
    }
}

function Start-AsapoLocalBroker {
    param(
        [string] $AsapoRoot,
        [string] $SpoolDir
    )

    if (Test-TcpPort -HostName "127.0.0.1" -Port $AsapoPort) {
        Write-Host "ASAPO local broker already reachable at 127.0.0.1:$AsapoPort" -ForegroundColor Green
        return
    }

    $logDir = $SpoolDir
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stdout = Join-Path $logDir "local-broker.stdout.log"
    $stderr = Join-Path $logDir "local-broker.stderr.log"

    if (Test-CommandAvailable "node") {
        Start-Process -FilePath "node" `
            -ArgumentList @("tools/local-message-suite.js", "broker", "--port", "$AsapoPort", "--spool-dir", $SpoolDir) `
            -WorkingDirectory $AsapoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden | Out-Null
    }
    elseif (Test-CommandAvailable "python") {
        Start-Process -FilePath "python" `
            -ArgumentList @("tools/local_message_suite.py", "broker", "--port", "$AsapoPort", "--spool-dir", $SpoolDir) `
            -WorkingDirectory $AsapoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden | Out-Null
    }
    else {
        throw "Neither node nor python is available for the ASAPO local broker."
    }

    Wait-TcpPort -Name "ASAPO local broker" -HostName "127.0.0.1" -Port $AsapoPort
}

function Invoke-AsapoRoundtrip {
    param([string] $AsapoRoot)

    if (-not (Test-CommandAvailable "node")) {
        Write-Warning "Skipping ASAPO roundtrip because node is not available."
        return
    }

    Invoke-Checked "node" @(
        "tools/local-message-suite.js",
        "produce",
        "--broker",
        "http://127.0.0.1:$AsapoPort",
        "--count",
        "1"
    ) $AsapoRoot

    Invoke-Checked "node" @(
        "tools/local-message-suite.js",
        "consume",
        "--broker",
        "http://127.0.0.1:$AsapoPort",
        "--consumer",
        "integration-coordinator",
        "--batch-size",
        "1"
    ) $AsapoRoot
}

function Set-DamnitHzdrEnvironment {
    param([string] $DamnitRoot)

    $apiRoot = Join-Path $DamnitRoot "api"
    $defaultMongoUri = "mongodb://root:mypasswd@localhost:$MongoPort/?authSource=admin"
    $selectedMongoUri = if ($MongoUri) { $MongoUri } else { $defaultMongoUri }

    $env:DW_API_AUTH__MODE = "ldap"
    $env:DW_API_DEBUG = "true"
    $env:DW_API_LOG_LEVEL = "DEBUG"
    $env:DW_API_METADATA__PROVIDER = "mongo"
    $env:DW_API_METADATA__MONGO_URI = $selectedMongoUri
    $env:DW_API_METADATA__MONGO_DATABASE = "damnit_web_test"
    $env:DW_API_METADATA__MONGO_COLLECTION = "hzdr_sources"
    $env:DW_API_METADATA__MONGO_SHOTS_DATABASE = "shotsheet"
    $env:DW_API_METADATA__MONGO_SHOTS_COLLECTION = "shots"
    $env:DW_API_METADATA__MONGO_SHOTS_SOURCE_FIELD = ""
    $env:DW_API_METADATA__MONGO_SHOTS_NUMBER_FIELD = "shot_number"
    $env:DW_API_METADATA__MONGO_SHOTS_FIRED_AT_FIELD = "fired_at"
    $env:DW_API_METADATA__MONGO_DEFAULT_SOURCE_KEY = $SourceKey
    $env:DW_API_METADATA__MONGO_DEFAULT_SOURCE_TITLE = "HZDR labfrog shots"
    $env:DW_API_METADATA__MONGO_DEFAULT_DAMNIT_PATH = $apiRoot
    $env:DW_API_DEPLOYMENT__PROFILE = "hzdr"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME = "source"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME_PLURAL = "sources"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL = "Source"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL = "Sources"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__COLLECTION_LABEL = "HZDR sources"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS = "false"
    $env:DW_API_DEPLOYMENT__TERMINOLOGY__USES_MYMDC = "false"
    Set-Item -Path "Env:DW_API_DAMNIT__PATHS_BY_PROPOSAL__$SourceKey" -Value $apiRoot
    $env:DW_API_UVICORN__HOST = "127.0.0.1"
    $env:DW_API_UVICORN__PORT = "$ApiPort"
}

function Clear-DamnitHzdrEnvironment {
    $names = @(
        "DW_API_AUTH__MODE",
        "DW_API_DEBUG",
        "DW_API_LOG_LEVEL",
        "DW_API_METADATA__PROVIDER",
        "DW_API_METADATA__MONGO_URI",
        "DW_API_METADATA__MONGO_DATABASE",
        "DW_API_METADATA__MONGO_COLLECTION",
        "DW_API_METADATA__MONGO_SHOTS_DATABASE",
        "DW_API_METADATA__MONGO_SHOTS_COLLECTION",
        "DW_API_METADATA__MONGO_SHOTS_SOURCE_FIELD",
        "DW_API_METADATA__MONGO_SHOTS_NUMBER_FIELD",
        "DW_API_METADATA__MONGO_SHOTS_FIRED_AT_FIELD",
        "DW_API_METADATA__MONGO_DEFAULT_SOURCE_KEY",
        "DW_API_METADATA__MONGO_DEFAULT_SOURCE_TITLE",
        "DW_API_METADATA__MONGO_DEFAULT_DAMNIT_PATH",
        "DW_API_DEPLOYMENT__PROFILE",
        "DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME",
        "DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME_PLURAL",
        "DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL",
        "DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL",
        "DW_API_DEPLOYMENT__TERMINOLOGY__COLLECTION_LABEL",
        "DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS",
        "DW_API_DEPLOYMENT__TERMINOLOGY__USES_MYMDC",
        "DW_API_UVICORN__HOST",
        "DW_API_UVICORN__PORT"
    )
    foreach ($name in $names) {
        Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    }
    Remove-Item -Path "Env:DW_API_DAMNIT__PATHS_BY_PROPOSAL__$SourceKey" -ErrorAction SilentlyContinue
}

function Invoke-ApiSmoke {
    param([string] $DamnitRoot)

    $apiRoot = Join-Path $DamnitRoot "api"
    $smoke = @'
from damnit_api.metadata.hzdr_sources import HZDRSourceProvider
from damnit_api.shared.settings import settings

sources = HZDRSourceProvider(settings.metadata).list_sources()
print("Loaded {} HZDR source(s): {}".format(len(sources), [source.key for source in sources]))
for source in sources:
    print("  {}: {} shot(s)".format(source.key, len(source.shots)))
if not sources:
    raise SystemExit("No HZDR sources loaded from MongoDB. Seed LabFrog shots or hzdr_sources first.")
'@

    Invoke-Checked "uv" @("run", "python", "-c", $smoke) $apiRoot
}

function Invoke-PackageEmulator {
    param(
        [string] $DamnitRoot,
        [string] $AsapoRoot
    )

    $apiRoot = Join-Path $DamnitRoot "api"
    $eventsDir = if ($PackageEventsDir) {
        (Resolve-Path $PackageEventsDir).Path
    }
    else {
        Join-Path $AsapoRoot "examples"
    }
    $outputDir = if ($PackageOutputDir) {
        $PackageOutputDir
    }
    else {
        Join-Path $DamnitRoot ".generated\hzdr-package-emulator"
    }

    $arguments = @(
        "run",
        "python",
        "scripts/hzdr-package-emulator.py",
        "--events-dir",
        $eventsDir,
        "--output-dir",
        $outputDir,
        "--source-key",
        $SourceKey,
        "--shot-count",
        "$ShotCount",
        "--shot-increment",
        "$ShotIncrement"
    )
    if ($ExperimentId) {
        $arguments += @("--experiment-id", $ExperimentId)
    }

    Invoke-Checked "uv" $arguments $apiRoot
}

$root = Resolve-ProjectRoot
$damnitRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$asapoRoot = Assert-ProjectPath $root "asapo-for-hzdr-damnit"
$kafkaRoot = Assert-ProjectPath $root "kafka-broker-docker"
$labfrogRoot = Assert-ProjectPath $root "labfrog"
$planetWatchdogRoot = Assert-ProjectPath $root "planet-watchdog"
$motionAutoLoggerRoot = Find-OptionalProjectPath $root "motion-auto-logger"
$selectedAsapoSpoolDir = if ($AsapoSpoolDir) {
    (Resolve-Path $AsapoSpoolDir -ErrorAction SilentlyContinue).Path
} else {
    Join-Path $damnitRoot ".generated\asapo-broker-spool"
}
if (-not $selectedAsapoSpoolDir) {
    $selectedAsapoSpoolDir = $AsapoSpoolDir
}

Write-Step "Project topology"
Write-Host "DAMNIT-web: $damnitRoot"
Write-Host "ASAPO harness: $asapoRoot"
Write-Host "Kafka broker: $kafkaRoot"
Write-Host "LabFrog: $labfrogRoot"
Write-Host "PLANET Watchdog: $planetWatchdogRoot"
if ($motionAutoLoggerRoot) {
    Write-Host "Motion auto logger: $motionAutoLoggerRoot"
}
else {
    Write-Host "Motion auto logger: not found (optional)"
}
Write-Host "ASAPO spool: $selectedAsapoSpoolDir"

Write-Step "Prerequisites"
foreach ($command in @("uv", "docker")) {
    if (Test-CommandAvailable $command) {
        Write-Host "$command found" -ForegroundColor Green
    }
    else {
        Write-Warning "$command was not found on PATH"
    }
}
if (Test-CommandAvailable "node") {
    Write-Host "node found" -ForegroundColor Green
}
elseif (Test-CommandAvailable "python") {
    Write-Host "python found for ASAPO fallback" -ForegroundColor Green
}
else {
    Write-Warning "neither node nor python was found for the ASAPO local broker"
}

if ($StartLabfrog) {
    Write-Step "Starting LabFrog MongoDB"
    Invoke-Checked "docker" @("compose", "-f", "compose.yaml", "up", "-d", "mongo", "mongo-express") $labfrogRoot
    Wait-TcpPort -Name "LabFrog MongoDB" -HostName "127.0.0.1" -Port $MongoPort
}

if ($StartKafka) {
    Write-Step "Starting Kafka"
    if (-not (Test-Path (Join-Path $kafkaRoot ".env"))) {
        Copy-Item (Join-Path $kafkaRoot ".env.example") (Join-Path $kafkaRoot ".env")
    }
    Invoke-Checked "docker" @("compose", "up", "-d") $kafkaRoot
    Wait-TcpPort -Name "Kafka" -HostName "127.0.0.1" -Port $KafkaPort
}

if ($StartAsapoBroker) {
    Write-Step "Starting ASAPO local broker"
    Start-AsapoLocalBroker $asapoRoot $selectedAsapoSpoolDir
}

if ($RunPackageEmulator) {
    Write-Step "HZDR package emulator"
    Invoke-PackageEmulator $damnitRoot $asapoRoot
}

Write-Step "Port status"
@(
    @("ASAPO local broker", $AsapoPort),
    @("Kafka", $KafkaPort),
    @("LabFrog MongoDB", $MongoPort),
    @("DAMNIT-web API", $ApiPort)
) | ForEach-Object {
    $name = $_[0]
    $port = $_[1]
    if (Test-TcpPort -HostName "127.0.0.1" -Port $port) {
        Write-Host "$name reachable on 127.0.0.1:$port" -ForegroundColor Green
    }
    else {
        Write-Host "$name not reachable on 127.0.0.1:$port" -ForegroundColor Yellow
    }
}

if ($RunAsapoRoundtrip) {
    Write-Step "ASAPO local broker roundtrip"
    Invoke-AsapoRoundtrip $asapoRoot
}

if ($RunKafkaRoundtrip) {
    Write-Step "Kafka roundtrip"
    if (-not (Test-CommandAvailable "bash")) {
        throw "bash is required for kafka-broker-docker/scripts/test-roundtrip.sh"
    }
    if (Test-Path (Join-Path $kafkaRoot "scripts\test-roundtrip.sh")) {
        Invoke-Checked "bash" @("scripts/test-roundtrip.sh") $kafkaRoot
    }
    else {
        Write-Warning "Kafka roundtrip script not found."
    }
}

if ($RunWatchdogVerifier) {
    Write-Step "PLANET Watchdog verifier"
    Invoke-Checked "uv" @(
        "run",
        "python",
        "scripts/verify-hzdr-watchdog.py",
        "--config",
        "..\scripts\hzdr-launch.config.json",
        "--mode",
        "auto"
    ) (Join-Path $damnitRoot "api")
}

if ($RunApiSmoke) {
    Write-Step "DAMNIT-web HZDR provider smoke"
    Set-DamnitHzdrEnvironment $damnitRoot
    Invoke-ApiSmoke $damnitRoot
}

if ($RunApiTests) {
    Write-Step "DAMNIT-web API tests"
    Clear-DamnitHzdrEnvironment
    Invoke-Checked "uv" @(
        "run",
        "--group",
        "test",
        "pytest",
        "tests/test_hzdr_sources.py",
        "tests/test_runtime_config.py",
        "tests/test_hzdr_config.py"
    ) (Join-Path $damnitRoot "api")
}

Write-Step "Done"
Write-Host "ASAPO GUI: http://127.0.0.1:$AsapoPort/"
Write-Host "Mongo Express: http://127.0.0.1:8081/"
Write-Host "Use -RunApiSmoke to test DAMNIT-web against the LabFrog MongoDB settings."

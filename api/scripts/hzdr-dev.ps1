param(
    [ValidateSet("labfrog", "mongo", "local")]
    [string] $Provider = "labfrog",

    [string] $HostAddress = "127.0.0.1",
    [int] $Port = 8000,
    [int] $GuiPort = 5173,
    [string] $MongoUri = "",
    [string] $MongoDatabase = "",
    [string] $MongoCollection = "",
    [string] $SourcesFile = "",
    [string] $ShotsDatabase = "",
    [string] $ShotsCollection = "",
    [string] $ShotsSourceField = "",
    [string] $ShotsNumberField = "",
    [string] $ShotsFiredAtField = "",
    [string] $SourceKey = "hzdr-labfrog",
    [string] $SourceTitle = "HZDR labfrog shots",

    [switch] $WithGui,
    [switch] $NoApi,
    [switch] $NoSmoke
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Command,

        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

function Set-HzdrDebugEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string] $SelectedProvider,

        [Parameter(Mandatory = $true)]
        [string] $SelectedHost,

        [Parameter(Mandatory = $true)]
        [int] $SelectedPort
    )

    $env:DW_API_AUTH__MODE = "ldap"
    $env:DW_API_DEBUG = "true"
    $env:DW_API_LOG_LEVEL = "DEBUG"
    $env:DW_API_METADATA__PROVIDER = $SelectedProvider
    $env:DW_API_UVICORN__HOST = $SelectedHost
    $env:DW_API_UVICORN__PORT = "$SelectedPort"
    $env:DW_API_UVICORN__RELOAD = "true"

    if ($SelectedProvider -eq "mongo") {
        $env:DW_API_METADATA__MONGO_URI = if ($MongoUri) { $MongoUri } else { "mongodb://localhost:27017" }
        $env:DW_API_METADATA__MONGO_DATABASE = if ($MongoDatabase) { $MongoDatabase } else { "damnit_web_test" }
        $env:DW_API_METADATA__MONGO_COLLECTION = if ($MongoCollection) { $MongoCollection } else { "hzdr_sources" }
    }
    elseif ($SelectedProvider -eq "labfrog") {
        $env:DW_API_METADATA__PROVIDER = "mongo"
        $env:DW_API_METADATA__MONGO_URI = if ($MongoUri) { $MongoUri } else { "mongodb://localhost:27018" }
        $env:DW_API_METADATA__MONGO_DATABASE = if ($MongoDatabase) { $MongoDatabase } else { "damnit_web_test" }
        $env:DW_API_METADATA__MONGO_COLLECTION = if ($MongoCollection) { $MongoCollection } else { "hzdr_sources" }
        $env:DW_API_METADATA__MONGO_SHOTS_DATABASE = if ($ShotsDatabase) { $ShotsDatabase } else { "shotsheet" }
        $env:DW_API_METADATA__MONGO_SHOTS_COLLECTION = if ($ShotsCollection) { $ShotsCollection } else { "shots" }
        $env:DW_API_METADATA__MONGO_SHOTS_SOURCE_FIELD = if ($ShotsSourceField) { $ShotsSourceField } else { "" }
        $env:DW_API_METADATA__MONGO_SHOTS_NUMBER_FIELD = if ($ShotsNumberField) { $ShotsNumberField } else { "shot_number" }
        $env:DW_API_METADATA__MONGO_SHOTS_FIRED_AT_FIELD = if ($ShotsFiredAtField) { $ShotsFiredAtField } else { "fired_at" }
        $env:DW_API_METADATA__MONGO_DEFAULT_SOURCE_KEY = $SourceKey
        $env:DW_API_METADATA__MONGO_DEFAULT_SOURCE_TITLE = $SourceTitle
    }
    else {
        if ($SourcesFile) {
            $env:DW_API_METADATA__SOURCES_FILE = $SourcesFile
        }
    }
}

function Test-HzdrSourceProvider {
    $smokeCheck = @'
from damnit_api.metadata.hzdr_sources import HZDRSourceProvider
from damnit_api.shared.settings import settings

sources = HZDRSourceProvider(settings.metadata).list_sources()
print('Loaded {} HZDR source(s): {}'.format(
    len(sources),
    [source.key for source in sources],
))
for source in sources:
    print('  {}: {} shot(s)'.format(source.key, len(source.shots)))
if not sources:
    raise SystemExit('No HZDR sources loaded')
if not any(source.shots for source in sources):
    raise SystemExit('HZDR sources loaded, but no shots were found')
'@

    Write-Host "Checking HZDR source provider..." -ForegroundColor Cyan
    Invoke-Checked "uv" @("run", "python", "-c", $smokeCheck)
}

function Start-HzdrApi {
    Write-Host "Starting DAMNIT-web API in debug mode..." -ForegroundColor Cyan
    Write-Host "Root redirects to docs: http://$env:DW_API_UVICORN__HOST`:$env:DW_API_UVICORN__PORT/"
    Write-Host "Docs: http://$env:DW_API_UVICORN__HOST`:$env:DW_API_UVICORN__PORT/docs"
    Write-Host "Sources: http://$env:DW_API_UVICORN__HOST`:$env:DW_API_UVICORN__PORT/metadata/hzdr/sources"
    Write-Host "Runtime config: http://$env:DW_API_UVICORN__HOST`:$env:DW_API_UVICORN__PORT/config/runtime"
    Invoke-Checked "uv" @("run", "-m", "damnit_api.main")
}

function Start-HzdrGui {
    param(
        [Parameter(Mandatory = $true)]
        [int] $SelectedGuiPort
    )

    if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
        throw "pnpm is not on PATH. Install Node >= 24, then run: corepack enable"
    }

    $repoRoot = Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "..")
    $frontendRoot = Join-Path $repoRoot "frontend"
    $frontendNodeModules = Join-Path $frontendRoot "node_modules"
    $apiUrl = "http://$env:DW_API_UVICORN__HOST`:$env:DW_API_UVICORN__PORT"
    $guiUrl = "http://127.0.0.1:$SelectedGuiPort"
    $command = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$frontendRoot'
if (-not (Test-Path '$frontendNodeModules')) {
    Write-Host 'Installing frontend dependencies...'
    pnpm install
}
`$env:VITE_API = '$apiUrl'
`$env:VITE_PORT = '$SelectedGuiPort'
pnpm dev:app
"@

    Write-Host "Starting DAMNIT-web GUI in a new PowerShell window..." -ForegroundColor Cyan
    Write-Host "GUI: $guiUrl"
    Write-Host "GUI docs link proxies to: $apiUrl/docs"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $command
    )
}

$apiRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $apiRoot

Set-HzdrDebugEnvironment `
    -SelectedProvider $Provider `
    -SelectedHost $HostAddress `
    -SelectedPort $Port

if (-not $NoSmoke) {
    Test-HzdrSourceProvider
}

if ($WithGui) {
    Start-HzdrGui -SelectedGuiPort $GuiPort
}

if (-not $NoApi) {
    Start-HzdrApi
}
else {
    Write-Host "Setup complete. API start skipped because -NoApi was set." -ForegroundColor Green
}

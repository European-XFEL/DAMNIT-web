param(
    [string] $HostAddress = "0.0.0.0",
    [int] $Port = 8000,
    [int] $Workers = 1,
    [string] $EnvFile = ".env",
    [switch] $NoEnvFile
)

$ErrorActionPreference = "Stop"

$apiRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $apiRoot

$env:DW_API_UVICORN__HOST = $HostAddress
$env:DW_API_UVICORN__PORT = "$Port"
$env:DW_API_UVICORN__RELOAD = "false"

if (-not $NoEnvFile -and -not (Test-Path $EnvFile)) {
    throw "Environment file not found: $EnvFile"
}

$arguments = @(
    "run",
    "uvicorn",
    "damnit_api.main:create_app",
    "--factory",
    "--host",
    $HostAddress,
    "--port",
    "$Port"
)

if ($Workers -gt 1) {
    $arguments += @("--workers", "$Workers")
}

if (-not $NoEnvFile) {
    Write-Host "Using environment file: $EnvFile" -ForegroundColor Cyan
}

Write-Host "Starting DAMNIT-web API for deployment on ${HostAddress}:${Port}" -ForegroundColor Cyan
& uv @arguments
if ($LASTEXITCODE -ne 0) {
    throw "uvicorn exited with code $LASTEXITCODE"
}

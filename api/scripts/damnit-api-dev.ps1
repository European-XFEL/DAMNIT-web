param(
    [string] $HostAddress = "127.0.0.1",
    [int] $Port = 8000,
    [string] $EnvFile = ".env",
    [switch] $NoEnvFile
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

$apiRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $apiRoot

if (-not $NoEnvFile -and -not (Test-Path $EnvFile)) {
    Write-Host "No $EnvFile found; continuing with environment/default settings." -ForegroundColor Yellow
}

$env:DW_API_DEBUG = "true"
$env:DW_API_LOG_LEVEL = "DEBUG"
$env:DW_API_UVICORN__HOST = $HostAddress
$env:DW_API_UVICORN__PORT = "$Port"
$env:DW_API_UVICORN__RELOAD = "true"

Write-Host "Starting DAMNIT-web API for development on ${HostAddress}:${Port}" -ForegroundColor Cyan
Write-Host "Reload: enabled"
Write-Host "Docs: http://$HostAddress`:$Port/docs"
Write-Host "GraphQL: http://$HostAddress`:$Port/graphql"

Invoke-Checked "uv" @("run", "-m", "damnit_api.main")

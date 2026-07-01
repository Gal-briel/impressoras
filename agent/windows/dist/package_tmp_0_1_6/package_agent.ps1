param(
    [string]$OutputDir = ".\dist",

    [string]$PackageName = "gabriel-windows-agent.zip"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputPath = Join-Path $ScriptDir $OutputDir
$ZipPath = Join-Path $OutputPath $PackageName
$TempDir = Join-Path $OutputPath "package_tmp"

if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

$files = @(
    "main.py",
    "api_client.py",
    "command_runner.py",
    "requirements.txt",
    "install_agent.ps1",
    "uninstall_agent.ps1"
)

foreach ($file in $files) {
    $source = Join-Path $ScriptDir $file

    if (-not (Test-Path $source)) {
        throw "Arquivo obrigatório não encontrado: $file"
    }

    Copy-Item -Path $source -Destination (Join-Path $TempDir $file) -Force
}

if (Test-Path $ZipPath) {
    Remove-Item -Path $ZipPath -Force
}

Compress-Archive -Path (Join-Path $TempDir "*") -DestinationPath $ZipPath -Force

Remove-Item -Path $TempDir -Recurse -Force

Write-Host "Pacote criado em:" -ForegroundColor Green
Write-Host $ZipPath

$ErrorActionPreference = "Stop"

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AgentDir

$VenvPython = Join-Path $AgentDir ".venv\Scripts\python.exe"
$Requirements = Join-Path $AgentDir "requirements.txt"
$MainPy = Join-Path $AgentDir "main.py"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Yellow
    python -m venv .venv
}

Write-Host "Atualizando dependências..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r $Requirements

Write-Host "Iniciando Gabriel Agent..." -ForegroundColor Green
& $VenvPython $MainPy

param(
    [string]$TaskName = "Gabriel Windows Agent"
)

$ErrorActionPreference = "Stop"

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $AgentDir ".venv\Scripts\python.exe"
$Requirements = Join-Path $AgentDir "requirements.txt"
$MainPy = Join-Path $AgentDir "main.py"
$Config = Join-Path $AgentDir "config.json"

function Test-Admin {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    throw "Execute este script no PowerShell como Administrador."
}

if (-not (Test-Path $Config)) {
    throw "Arquivo config.json não encontrado em $AgentDir. Copie config.example.json para config.json e configure antes de instalar."
}

Set-Location $AgentDir

if (-not (Test-Path $VenvPython)) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Yellow
    python -m venv .venv
}

Write-Host "Instalando dependências..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r $Requirements

Write-Host "Registrando tarefa agendada: $TaskName" -ForegroundColor Yellow

$Action = New-ScheduledTaskAction `
    -Execute $VenvPython `
    -Argument "`"$MainPy`"" `
    -WorkingDirectory $AgentDir

$TriggerStartup = New-ScheduledTaskTrigger -AtStartup

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DisallowStartIfOnBatteries:$false `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$Principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $TriggerStartup `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Tarefa instalada e iniciada com sucesso." -ForegroundColor Green
Write-Host "Nome da tarefa: $TaskName"
Write-Host "Pasta do agente: $AgentDir"
Write-Host "Log: $AgentDir\logs\agent.log"

param(
    [string]$InstallDir = "C:\agents\windows",

    [string]$TaskName = "Gabriel Windows Agent",

    [switch]$RemoveFiles
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

try {
    Write-Step "Parando tarefa do agente"
    schtasks /End /TN $TaskName 2>$null | Out-Null
    Write-Ok "Tarefa parada, se estava em execução"

    Write-Step "Removendo tarefa agendada"
    schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
    Write-Ok "Tarefa removida, se existia"

    if ($RemoveFiles) {
        Write-Step "Removendo arquivos do agente"
        if (Test-Path $InstallDir) {
            Remove-Item -Path $InstallDir -Recurse -Force
            Write-Ok "Arquivos removidos: $InstallDir"
        } else {
            Write-Ok "Diretório não encontrado: $InstallDir"
        }
    } else {
        Write-Host ""
        Write-Host "Arquivos mantidos em: $InstallDir"
        Write-Host "Para remover tudo:"
        Write-Host ".\uninstall_agent.ps1 -RemoveFiles"
    }

    Write-Host ""
    Write-Host "Desinstalação concluída."
} catch {
    Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

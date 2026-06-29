param(
    [string]$TaskName = "Gabriel Windows Agent"
)

$ErrorActionPreference = "Stop"

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false

Write-Host "Tarefa removida: $TaskName" -ForegroundColor Green

param(
    [string]$TaskName = "Gabriel Windows Agent"
)

Stop-ScheduledTask -TaskName $TaskName
Write-Host "Tarefa parada: $TaskName" -ForegroundColor Yellow

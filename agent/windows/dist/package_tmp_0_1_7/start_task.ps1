param(
    [string]$TaskName = "Gabriel Windows Agent"
)

Start-ScheduledTask -TaskName $TaskName
Write-Host "Tarefa iniciada: $TaskName" -ForegroundColor Green

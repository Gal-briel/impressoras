param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentId,

    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [string]$InstallDir = "C:\agents\windows",

    [string]$TaskName = "Gabriel Windows Agent",

    [int]$PollSeconds = 5,

    [string]$AgentVersion = "0.1.5"
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

function Write-Warn {
    param([string]$Message)
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[ERRO] $Message" -ForegroundColor Red
}

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este script como Administrador."
    }
}

function Get-PythonCommand {
    $candidates = @(
        "python",
        "py"
    )

    foreach ($candidate in $candidates) {
        try {
            $versionOutput = & $candidate --version 2>&1

            if ($LASTEXITCODE -eq 0 -and $versionOutput -match "Python") {
                return $candidate
            }
        } catch {
        }
    }

    throw "Python não encontrado. Instale Python 3.11+ antes de instalar o agente."
}

function Stop-ExistingTask {
    param([string]$Name)

    schtasks /End /TN $Name 2>$null | Out-Null
}

function Remove-ExistingTask {
    param([string]$Name)

    schtasks /Delete /TN $Name /F 2>$null | Out-Null
}

function Copy-AgentFiles {
    param(
        [string]$SourceDir,
        [string]$TargetDir
    )

    $requiredFiles = @(
        "main.py",
        "api_client.py",
        "command_runner.py"
    )

    foreach ($file in $requiredFiles) {
        $sourceFile = Join-Path $SourceDir $file

        if (-not (Test-Path $sourceFile)) {
            throw "Arquivo obrigatório não encontrado no pacote: $file"
        }
    }

    foreach ($file in $requiredFiles) {
        Copy-Item -Path (Join-Path $SourceDir $file) -Destination (Join-Path $TargetDir $file) -Force
    }

    $optionalFiles = @(
        "requirements.txt"
    )

    foreach ($file in $optionalFiles) {
        $sourceFile = Join-Path $SourceDir $file

        if (Test-Path $sourceFile) {
            Copy-Item -Path $sourceFile -Destination (Join-Path $TargetDir $file) -Force
        }
    }
}

function Write-AgentConfig {
    param(
        [string]$TargetDir,
        [string]$BaseUrl,
        [string]$AgentId,
        [string]$ApiKey,
        [int]$PollSeconds,
        [string]$AgentVersion
    )

    $normalizedBaseUrl = $BaseUrl.TrimEnd("/")

    $config = [ordered]@{
        base_url = $normalizedBaseUrl
        agent_id = $AgentId
        api_key = $ApiKey
        agent_version = $AgentVersion
        poll_seconds = $PollSeconds
        command_limit = 5
    }

    $configPath = Join-Path $TargetDir "config.json"

    $jsonText = $config | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($configPath, $jsonText, $utf8NoBom)
}

function Write-TaskLauncher {
    param([string]$TargetDir)

    $launcherPath = Join-Path $TargetDir "run_task.ps1"
    $pythonPath = Join-Path $TargetDir ".venv\Scripts\python.exe"
    $mainPath = Join-Path $TargetDir "main.py"
    $logDir = Join-Path $TargetDir "logs"
    $stdoutLog = Join-Path $logDir "task.stdout.log"
    $stderrLog = Join-Path $logDir "task.stderr.log"

    $content = @"
`$ErrorActionPreference = "Continue"

`$InstallDir = "$TargetDir"
`$PythonPath = "$pythonPath"
`$MainPath = "$mainPath"
`$LogDir = "$logDir"
`$StdoutLog = "$stdoutLog"
`$StderrLog = "$stderrLog"

if (-not (Test-Path `$LogDir)) {
    New-Item -ItemType Directory -Force -Path `$LogDir | Out-Null
}

Add-Content -Path `$StdoutLog -Value ("[{0}] Launcher iniciado." -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))

if (-not (Test-Path `$PythonPath)) {
    Add-Content -Path `$StderrLog -Value ("[{0}] Python da venv não encontrado: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), `$PythonPath)
    exit 1
}

if (-not (Test-Path `$MainPath)) {
    Add-Content -Path `$StderrLog -Value ("[{0}] main.py não encontrado: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), `$MainPath)
    exit 1
}

Set-Location `$InstallDir

& `$PythonPath `$MainPath >> `$StdoutLog 2>> `$StderrLog
"@

    Set-Content -Path $launcherPath -Value $content -Encoding UTF8
}

function Install-PythonEnvironment {
    param(
        [string]$PythonCommand,
        [string]$TargetDir
    )

    $venvDir = Join-Path $TargetDir ".venv"
    $pythonExe = Join-Path $venvDir "Scripts\python.exe"
    $requirementsPath = Join-Path $TargetDir "requirements.txt"

    if (-not (Test-Path $pythonExe)) {
        & $PythonCommand -m venv $venvDir
    }

    if (-not (Test-Path $pythonExe)) {
        throw "Não foi possível criar a venv em $venvDir"
    }

    & $pythonExe -m pip install --upgrade pip

    if (Test-Path $requirementsPath) {
        & $pythonExe -m pip install -r $requirementsPath
    } else {
        & $pythonExe -m pip install psutil requests httpx
    }
}

function Register-AgentTask {
    param(
        [string]$TaskName,
        [string]$TargetDir
    )

    $launcherPath = Join-Path $TargetDir "run_task.ps1"

    Remove-ExistingTask -Name $TaskName

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""

    $triggerStartup = New-ScheduledTaskTrigger -AtStartup

    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -RunLevel Highest

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $triggerStartup `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null
}

function Test-AgentApi {
    param(
        [string]$BaseUrl,
        [string]$AgentId,
        [string]$ApiKey
    )

    $normalizedBaseUrl = $BaseUrl.TrimEnd("/")
    $url = "$normalizedBaseUrl/agent/commands/pending"

    $headers = @{
        "Authorization" = "ApiKey $ApiKey"
        "x-agent-id" = $AgentId
    }

    try {
        Invoke-RestMethod -Method GET -Uri $url -Headers $headers -TimeoutSec 20 | Out-Null
        return $true
    } catch {
        Write-Warn "Falha no teste de API: $($_.Exception.Message)"
        Write-Warn "Isso pode acontecer se a URL do Codespace mudou, se a porta 8000 não está pública ou se a API está offline."
        return $false
    }
}

try {
    Assert-Admin

    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

    Write-Step "Preparando diretórios"
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "logs") | Out-Null
    Write-Ok "Diretório de instalação: $InstallDir"

    Write-Step "Parando instalação anterior, se existir"
    Stop-ExistingTask -Name $TaskName
    Write-Ok "Tarefa anterior parada, se estava em execução"

    Write-Step "Copiando arquivos do agente"
    Copy-AgentFiles -SourceDir $ScriptDir -TargetDir $InstallDir
    Write-Ok "Arquivos copiados"

    Write-Step "Gravando config.json"
    Write-AgentConfig `
        -TargetDir $InstallDir `
        -BaseUrl $BaseUrl `
        -AgentId $AgentId `
        -ApiKey $ApiKey `
        -PollSeconds $PollSeconds `
        -AgentVersion $AgentVersion
    Write-Ok "Configuração gravada"

    Write-Step "Criando launcher da tarefa"
    Write-TaskLauncher -TargetDir $InstallDir
    Write-Ok "Launcher criado"

    Write-Step "Localizando Python"
    $PythonCommand = Get-PythonCommand
    Write-Ok "Python encontrado: $PythonCommand"

    Write-Step "Criando ambiente Python"
    Install-PythonEnvironment -PythonCommand $PythonCommand -TargetDir $InstallDir
    Write-Ok "Ambiente Python instalado"

    Write-Step "Registrando tarefa agendada"
    Register-AgentTask -TaskName $TaskName -TargetDir $InstallDir
    Write-Ok "Tarefa registrada: $TaskName"

    Write-Step "Testando comunicação com API"
    $apiOk = Test-AgentApi -BaseUrl $BaseUrl -AgentId $AgentId -ApiKey $ApiKey

    if ($apiOk) {
        Write-Ok "API respondeu corretamente"
    } else {
        Write-Warn "Instalação continuou, mas o teste de API falhou"
    }

    Write-Step "Iniciando agente"
    schtasks /Run /TN $TaskName | Out-Null
    Start-Sleep -Seconds 3
    Write-Ok "Agente iniciado"

    Write-Step "Resumo"
    Write-Host "Instalação concluída."
    Write-Host "Diretório: $InstallDir"
    Write-Host "Tarefa: $TaskName"
    Write-Host "Config: $(Join-Path $InstallDir "config.json")"
    Write-Host "Logs:"
    Write-Host "  $(Join-Path $InstallDir "logs\task.stdout.log")"
    Write-Host "  $(Join-Path $InstallDir "logs\task.stderr.log")"
    Write-Host ""

    Write-Host "Para validar:"
    Write-Host "Get-ScheduledTask -TaskName `"$TaskName`""
    Write-Host "Get-Content `"$InstallDir\logs\task.stdout.log`" -Tail 80"
    Write-Host "Get-Content `"$InstallDir\logs\task.stderr.log`" -Tail 80"
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

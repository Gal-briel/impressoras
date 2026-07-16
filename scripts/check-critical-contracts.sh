#!/bin/bash
set -euo pipefail

echo "=== Verificando Contratos Críticos ==="

TARGET_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$TARGET_DIR"

ERROR=0

check_contract() {
    local name="$1"
    local failed="$2"
    local error_msg="$3"
    
    if [ "$failed" -eq 1 ]; then
        echo "ERRO: Contrato quebrado: $name"
        echo "      $error_msg"
        ERROR=1
    else
        echo "OK: $name"
    fi
}

# A) Segurança de API key
if [ -f "backend/app/core/security.py" ]; then
    failed=0
    if ! grep -q "secrets.compare_digest" "backend/app/core/security.py"; then
        check_contract "API Key Security (compare_digest)" 1 "backend/app/core/security.py não usa secrets.compare_digest."
    else
        check_contract "API Key Security (compare_digest)" 0 ""
    fi
    
    if grep -q -E "==.*api_key|api_key.*==" "backend/app/core/security.py"; then
        check_contract "API Key Security (== check)" 1 "backend/app/core/security.py usa comparação '==' direta e insegura."
    else
        check_contract "API Key Security (== check)" 0 ""
    fi
fi

# B) JWT
if [ -f "backend/app/core/config.py" ]; then
    if ! grep -Eq "JWT_SECRET_KEY|JWT_SIGNING_KEY" "backend/app/core/config.py"; then
         check_contract "JWT Security" 1 "backend/app/core/config.py não define JWT_SECRET_KEY/JWT_SIGNING_KEY."
    else
         check_contract "JWT Security" 0 ""
    fi
fi

# C) Download de pacote do agente
if [ -f "backend/app/main.py" ]; then
    if grep -q -E 'StaticFiles.*"/agent-packages"' "backend/app/main.py"; then
         check_contract "Agent Package Security" 1 "StaticFiles público montado em /agent-packages."
    elif ! grep -q "require_agent_auth" "backend/app/main.py"; then
         # We only fail if the route /agent-packages exists but auth is missing
         if grep -q "/agent-packages" "backend/app/main.py"; then
             check_contract "Agent Package Security" 1 "backend/app/main.py expõe rota sem require_agent_auth."
         else
             check_contract "Agent Package Security" 0 ""
         fi
    else
         check_contract "Agent Package Security" 0 ""
    fi
fi

# D) update_agent
if [ -f "backend/app/services/command_policy.py" ]; then
    if ! grep -q "package_url" "backend/app/services/command_policy.py" || ! grep -q "sha256" "backend/app/services/command_policy.py"; then
        check_contract "Update Agent Policy" 1 "update_agent policy não exige package_url ou sha256."
    else
        check_contract "Update Agent Policy" 0 ""
    fi
fi

if [ -f "agent/windows/command_runner.py" ]; then
    if ! grep -q -i "sha256" "agent/windows/command_runner.py"; then
        check_contract "Agent Windows Update (SHA256)" 1 "Agente Windows não valida sha256 do pacote."
    else
        check_contract "Agent Windows Update (SHA256)" 0 ""
    fi
    
    if ! grep -q -i "headers" "agent/windows/command_runner.py"; then
        check_contract "Agent Windows Update (Auth)" 1 "Agente Windows não envia headers de autenticação no download."
    else
        check_contract "Agent Windows Update (Auth)" 0 ""
    fi
fi

# E) Comandos remotos
if [ -f "backend/app/api/routes/commands.py" ]; then
    if ! grep -q "expire_stale_commands" "backend/app/api/routes/commands.py"; then
        check_contract "Pending Commands Expiration (Call)" 1 "Rota de comandos pendentes não chama expire_stale_commands."
    else
        check_contract "Pending Commands Expiration (Call)" 0 ""
    fi
    
    if ! grep -q "Command.expires_at >" "backend/app/api/routes/commands.py"; then
        check_contract "Pending Commands Expiration (Filter)" 1 "Rota não filtra Command.expires_at > now."
    else
        check_contract "Pending Commands Expiration (Filter)" 0 ""
    fi
fi

if [ -f "backend/app/services/command_service.py" ]; then
    if ! grep -q "terminal_statuses =" "backend/app/services/command_service.py" && ! grep -q "CommandStatus.SUCCESS" "backend/app/services/command_service.py"; then
         check_contract "Terminal State Override" 1 "command_service.py pode estar permitindo sobrescrita de estados terminais."
    else
         check_contract "Terminal State Override" 0 ""
    fi
    if ! grep -q "sanitize_command_output" "backend/app/services/command_service.py"; then
         check_contract "Output Sanitization" 1 "command_service.py não sanitiza output de comandos."
    else
         check_contract "Output Sanitization" 0 ""
    fi
fi

# F) Validações locais
if [ -f "scripts/check-backend.sh" ]; then
    if ! grep -q "agent/windows" "scripts/check-backend.sh"; then
        check_contract "Check Backend (Agent Validation)" 1 "scripts/check-backend.sh não valida sintaxe do agente Windows."
    else
        check_contract "Check Backend (Agent Validation)" 0 ""
    fi
fi

if [ -f "scripts/check-all.sh" ]; then
    if ! grep -q "test-check-secrets.sh" "scripts/check-all.sh" || \
       ! grep -q "check-secrets.sh" "scripts/check-all.sh" || \
       ! grep -q "check-critical-contracts.sh" "scripts/check-all.sh" || \
       ! grep -q "check-backend.sh" "scripts/check-all.sh" || \
       ! grep -q "check-frontend.sh" "scripts/check-all.sh"; then
        check_contract "Check All (Contracts)" 1 "scripts/check-all.sh não chama todos os scripts de verificação necessários."
    else
        check_contract "Check All (Contracts)" 0 ""
    fi
fi

# G) CI
if [ -f ".github/workflows/ci.yml" ]; then
    if ! grep -q "check-all.sh" ".github/workflows/ci.yml"; then
        check_contract "CI Pipeline (Check All)" 1 "CI não chama scripts/check-all.sh."
    else
        check_contract "CI Pipeline (Check All)" 0 ""
    fi
    
    if grep -q -i -E "postgres|redis|rabbitmq" ".github/workflows/ci.yml"; then
        check_contract "CI Pipeline (Services)" 1 "CI sobe serviços pesados (postgres, redis, rabbitmq)."
    else
        check_contract "CI Pipeline (Services)" 0 ""
    fi
    
    if grep -q -E "POSTGRES_PASSWORD|SECRET_KEY|JWT_SECRET_KEY|DATABASE_URL" ".github/workflows/ci.yml"; then
        check_contract "CI Pipeline (Secrets)" 1 "CI contém segredos hardcoded."
    else
        check_contract "CI Pipeline (Secrets)" 0 ""
    fi
fi

if [ "$ERROR" -eq 1 ]; then
    echo "=== ERRO: Verificação de Contratos Críticos falhou. ==="
    exit 1
fi

echo "=== OK: Todos os contratos críticos estão garantidos. ==="

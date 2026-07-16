#!/bin/bash
set -euo pipefail

echo "=== Iniciando Testes do check-critical-contracts.sh ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK_SCRIPT="$SCRIPT_DIR/check-critical-contracts.sh"

# Cria repositório temporário
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
cd "$TEST_DIR"
git init -q

run_check_fail() {
    if "$CHECK_SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
        echo "FALHA NO TESTE: Esperava falhar, mas passou. ($1)"
        exit 1
    fi
}

run_check_pass() {
    if ! "$CHECK_SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
        echo "FALHA NO TESTE: Esperava passar, mas falhou. ($1)"
        exit 1
    fi
}

setup_valid_contracts() {
    mkdir -p backend/app/core backend/app/services backend/app/api/routes agent/windows scripts .github/workflows
    
    # A
    echo "secrets.compare_digest(api_key, hash)" > backend/app/core/security.py
    # B
    echo "JWT_SECRET_KEY = 'secret'" > backend/app/core/config.py
    # C
    echo "require_agent_auth = True; /agent-packages" > backend/app/main.py
    # D
    echo "package_url sha256" > backend/app/services/command_policy.py
    echo "sha256 headers" > agent/windows/command_runner.py
    # E
    echo "expire_stale_commands Command.expires_at > now" > backend/app/api/routes/commands.py
    echo "CommandStatus.SUCCESS sanitize_command_output" > backend/app/services/command_service.py
    # F
    echo "agent/windows" > scripts/check-backend.sh
    echo "test-check-secrets.sh check-secrets.sh check-critical-contracts.sh check-backend.sh check-frontend.sh" > scripts/check-all.sh
    # G
    echo "check-all.sh" > .github/workflows/ci.yml
}

# Test 1: Contrato válido passa
setup_valid_contracts
run_check_pass "contrato válido"

# Test 2: Falta de compare_digest falha
echo "api_key == hash" > backend/app/core/security.py
run_check_fail "comparação direta =="

# Reseta válido
setup_valid_contracts

# Test 3: StaticFiles público em /agent-packages falha
echo 'app.mount("/agent-packages", StaticFiles(directory="agent-packages"), name="agent-packages")' > backend/app/main.py
run_check_fail "StaticFiles público"

setup_valid_contracts

# Test 4: CI com POSTGRES_PASSWORD hardcoded falha
echo "check-all.sh POSTGRES_PASSWORD='pass'" > .github/workflows/ci.yml
run_check_fail "CI com segredo hardcoded"

setup_valid_contracts

# Test 5: check-all sem check-critical-contracts falha
echo "test-check-secrets.sh check-secrets.sh check-backend.sh check-frontend.sh" > scripts/check-all.sh
run_check_fail "check-all sem check-critical-contracts"

echo "=== Todos os testes do check-critical-contracts.sh passaram com sucesso! ==="

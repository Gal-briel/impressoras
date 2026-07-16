#!/bin/bash
set -euo pipefail

echo "=== Iniciando Testes do check-secrets.sh ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK_SCRIPT="$SCRIPT_DIR/check-secrets.sh"

# Setup temporary test repository
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
cd "$TEST_DIR"
git init -q
git config user.name "Test"
git config user.email "test@example.com"

# Setup helper for expected failure
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

# Test 1: .env.example passa
touch .env.example
git add .env.example
run_check_pass ".env.example"

# Test 2: .env real falha
touch .env
git add .env
run_check_fail ".env real"
git rm -q -f .env

# Test 3: arquivo .pfx falha
touch certificado.pfx
git add certificado.pfx
run_check_fail ".pfx"
git rm -q -f certificado.pfx

# Test 4: frontend/node_modules/algum-arquivo falha
mkdir -p frontend/node_modules
touch frontend/node_modules/index.js
git add frontend/node_modules/index.js
run_check_fail "frontend/node_modules/"
git rm -q -rf frontend/node_modules

# Test 5: impressoras/clone.txt falha
mkdir -p impressoras
touch impressoras/clone.txt
git add impressoras/clone.txt
run_check_fail "impressoras/ clone aninhado"
git rm -q -rf impressoras

# Test 6: Arquivos com espaços (novo requerimento)
mkdir -p "frontend/node_modules"
touch "frontend/node_modules/file with space.js"
git add "frontend/node_modules/file with space.js"
run_check_fail "file with space in node_modules"
git rm -q -rf frontend/node_modules

echo "Todos os testes do check-secrets.sh passaram com sucesso!"

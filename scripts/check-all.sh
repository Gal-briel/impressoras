#!/bin/bash
set -euo pipefail

echo "=== Verificação Completa Iniciada ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--- Iniciando Teste de Check Secrets ---"
bash "$SCRIPT_DIR/test-check-secrets.sh"

echo "--- Iniciando Check Secrets ---"
bash "$SCRIPT_DIR/check-secrets.sh"

echo "--- Iniciando Check Backend ---"
bash "$SCRIPT_DIR/check-backend.sh"

echo "--- Iniciando Check Frontend ---"
bash "$SCRIPT_DIR/check-frontend.sh"

echo "=== Verificação Completa Concluída com Sucesso ==="

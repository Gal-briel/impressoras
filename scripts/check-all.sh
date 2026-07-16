#!/bin/bash
set -euo pipefail

echo "=== Verificação Completa Iniciada ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--- Iniciando Check Backend ---"
bash "$SCRIPT_DIR/check-backend.sh"

echo "--- Iniciando Check Frontend ---"
bash "$SCRIPT_DIR/check-frontend.sh"

echo "=== Verificação Completa Concluída com Sucesso ==="

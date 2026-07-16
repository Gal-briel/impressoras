#!/bin/bash
set -euo pipefail

echo "=== Verificando Frontend ==="

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$BASE_DIR/frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "Erro: Diretório frontend não encontrado."
    exit 1
fi

cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "Erro: dependências do frontend (node_modules) não encontradas."
    echo "Não instalaremos automaticamente. Por favor, execute npm install manualmente."
    exit 1
fi

echo "Rodando build do frontend (npm run build)..."
npm run build

echo "Verificação do frontend concluída com sucesso."

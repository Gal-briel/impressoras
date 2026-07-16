#!/bin/bash
set -euo pipefail

echo "=== Verificando Backend ==="

# Define o caminho base
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$BASE_DIR/backend"

if [ ! -d "$BACKEND_DIR" ]; then
    echo "Erro: Diretório backend não encontrado."
    exit 1
fi

cd "$BACKEND_DIR"

# Ativar virtual environment se existir
if [ -f ".venv/bin/activate" ]; then
    echo "Ativando ambiente virtual (.venv)..."
    source .venv/bin/activate
else
    echo "Aviso: .venv não encontrado. Executando comandos no ambiente atual."
fi

echo "Checando sintaxe com py_compile nos arquivos principais..."
# Compilar arquivos ignorando __pycache__ e dependências locais
find app -name "*.py" -exec python -m py_compile {} +

if command -v pytest >/dev/null 2>&1; then
    echo "Rodando pytest..."
    pytest
else
    echo "Aviso: pytest não está instalado no ambiente atual."
    echo "Não tentaremos instalar dependências automaticamente."
fi

echo "Verificação do backend concluída com sucesso."

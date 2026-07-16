#!/bin/bash
set -euo pipefail

echo "=== Verificando Segredos e Arquivos Proibidos ==="

TARGET_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$TARGET_DIR"

ERROR=0

check_forbidden_file() {
    local file="$1"
    # Regex para arquivos proibidos (arquivos ou pastas)
    if echo "$file" | grep -Eq '(^\.env$|^\.env\.[^.]+$|^backend/\.env$|^frontend/\.env\.local$|^agent/windows/config\.json$|^\.venv/|^backend/\.venv/|^node_modules/|^frontend/node_modules/|__pycache__/|\.pyc$|^impressoras/|\.key$|\.pem$|\.pfx$|\.p12$)'; then
        # Exceções (permitidas)
        if ! echo "$file" | grep -Eq '(\.example$)'; then
            echo "ERRO: Arquivo proibido encontrado: $file"
            ERROR=1
        fi
    fi
}

echo "Checando arquivos rastreados e não rastreados..."
while read -r -d '' file; do
    check_forbidden_file "$file"
done < <({ git ls-files -z; git ls-files --others --exclude-standard -z; } | sort -z -u)

echo "Checando padrões sensíveis em arquivos rastreados seguros..."
SENSITIVE_PATTERN="SECRET_KEY=|JWT_SECRET_KEY=|DATABASE_URL=|SYNC_DATABASE_URL=|API_KEY=|TOKEN=|PASSWORD=|PRIVATE KEY"

while read -r -d '' file; do
    # Verifica allowlist para não rodar grep de conteúdo
    if echo "$file" | grep -Eq '(^AGENTS\.md$|^README\.md$|\.example$)'; then
        continue
    fi
    
    if [ -f "$file" ]; then
        if grep -I -Eq "$SENSITIVE_PATTERN" "$file" 2>/dev/null; then
            echo "ERRO: Padrão sensível encontrado no arquivo rastreado: $file"
            ERROR=1
        fi
    fi
done < <(git ls-files -z)

if [ "$ERROR" -eq 1 ]; then
    echo "Verificação falhou."
    exit 1
fi

echo "OK"

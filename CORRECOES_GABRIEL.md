# Correções aplicadas no projeto Gabriel

## Backend

- `app/main.py` foi limpo e agora registra as rotas de forma centralizada, sem imports soltos no final do arquivo.
- Rotas usadas pelo agente Windows 0.1.x registradas:
  - `POST /api/v1/agent/check-in`
  - `POST /api/v1/agent/events`
  - `POST /api/v1/agent/printers/inventory`
  - `GET /api/v1/agent/commands/pending`
  - `POST /api/v1/agent/commands/{command_id}/status`
- `docker-compose.yml` agora inclui Redis, além de Postgres e RabbitMQ.
- Redis ficou opcional/resiliente para não quebrar `/api/v1/agents` com `500 Internal Server Error` quando estiver indisponível.
- WebSocket/broadcast via Redis também ficou resiliente.
- `require_agent_auth` foi unificado em uma única função.
- `agent_runtime.py` agora atualiza `last_seen`, além dos campos de compatibilidade.
- `agents.py` teve a rota duplicada `/agents/agents/check-in` removida.
- `agent_service.py` ficou mais seguro na serialização de status, enum e capabilities.
- `scripts/init_dev_db.py` foi ajustado para percorrer as tabelas reais do metadata.
- `scripts/seed_dev_data.py` agora recria/atualiza tenant, admin e agente dev fixo.
- Novo script `scripts/reset_dev_db.py` reseta o banco dev, cria schema e roda seed.

## Frontend

- Clientes HTTP agora aceitam `VITE_API_BASE_URL` ou `VITE_API_URL`.
- `httpClient` legado também usa o token salvo em `localStorage`.
- Tipos de agente foram ajustados para aceitar `last_seen` e `calculated_status` vindos do backend.
- Tela de agentes agora calcula online usando `last_seen` ou `last_seen_at`.
- Criada Sprint 18 inicial:
  - `/command-history`
  - API de histórico de comandos
  - hook React Query
  - página com filtros por agente, status, tipo e busca textual
  - cards de total, pendentes, sucesso e falhas
  - tabela com payload/resultado em detalhes
- Sidebar recebeu o item “Histórico de comandos”.
- Incluído `frontend/spa_server.py` para servir o build React com fallback SPA.

## Validação feita

- Backend compilado com `python -m compileall app scripts`.
- Rotas críticas confirmadas no app FastAPI.
- Frontend compilado com `npm run build`.

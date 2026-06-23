# Implementações aplicadas — 2026-06-23

## Backend

- Adicionados metadados de revogação em `Agent`:
  - `revoked_at`
  - `revoked_by`
  - `revoke_reason`
- Bloqueio de autenticação HTTP e WebSocket para agente revogado.
- Endpoint `PATCH /api/v1/agents/{agent_id}/revoke`.
- Sistema de Tags:
  - `AgentTag`
  - `AgentTagAssignment`
  - `GET/POST/DELETE /api/v1/agent-tags`
  - `GET/PUT /api/v1/agents/{agent_id}/tags`
- Sistema de Agent Groups:
  - CRUD em `/api/v1/agent-groups`
  - atribuição em `PUT /api/v1/agents/{agent_id}/group`
- Endpoint de atualização automática:
  - `GET /api/v1/agents/version`
  - entidade `AgentRelease`
- Correção do endpoint `/api/v1/agents/events` para usar tenant real do agente.
- Correção de dependência `get_agent_service` que era usada antes de existir.
- Correção de `get_command_service`, que instanciava `CommandService` sem `audit_repository`.
- Correção do registro de audit log de comandos, que tentava usar `BaseRepository.create(obj_in={})`.
- Listener do dashboard WebSocket iniciado no lifespan.

## Agente Windows

- Fila local offline em SQLite:
  - `outbox_messages`
  - `pending_commands`
- Persistência de comandos recebidos antes da execução.
- Persistência de resultados não enviados.
- Sincronização quando conexão retornar.
- Watchdog em thread separada:
  - detecta travamento do loop principal;
  - registra `AgentEvent`;
  - encerra processo para o Windows Service reiniciar.
- Configuração automática de recovery no Windows Service Control Manager.
- Auto-update:
  - consulta manifesto de versão;
  - baixa pacote;
  - valida SHA-256;
  - valida assinatura Authenticode por thumbprint;
  - executa helper isolado;
  - faz rollback em falha de instalação ou health-check.

## Frontend

- Modelo `Agent` atualizado com:
  - `group_id`
  - `revoked_at`
  - `revoked_by`
  - `revoke_reason`
  - `tags`
- Novos modelos:
  - `AgentTag`
  - `AgentGroup`
- Service atualizado com métodos para tags, grupos, revogação e rotação de chave.
- Hooks adicionados para tags, grupos, revogação e atribuição.

## Localhost

- Adicionado `docker-compose.local.yml`.
- Adicionado `backend/requirements.txt`.
- Adicionado `agent/requirements.txt`.
- Adicionado `backend/.env.example`.
- Adicionado `backend/scripts/init_dev_db.py`.
- Adicionado `backend/scripts/seed_dev_data.py`.
- Adicionado `backend/scripts/create_dev_token.py`.
- Adicionado `docs/LOCALHOST_TESTING.md`.

## Observações

- A migration inicial original do handoff ainda está resumida e não cria todas as tabelas.
- Para desenvolvimento local inicial, usar `backend/scripts/init_dev_db.py`.
- Para produção, a migration inicial deve ser substituída por uma migration completa antes do primeiro deploy real.

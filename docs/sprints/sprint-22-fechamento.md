# Sprint 22 — Alertas Operacionais e Central Operacional

## Status

Concluída.

## Branch

`sprint-22-alertas-operacionais-notificacoes`

## Escopo entregue

A Sprint 22 consolidou a base de alertas operacionais do Projeto Gabriel, integrando falhas de comando, agentes offline, alertas de segurança e mudanças de software em uma central única.

## Entregas concluídas

### Sprint 22.1
- Criada tabela `operational_alerts`.
- Criadas funções SQL:
  - `open_operational_alert`
  - `resolve_operational_alert_by_dedupe`

### Sprint 22.2
- Trigger em `commands` para gerar alerta operacional em falhas.
- Tipo criado: `command_failed`.
- Sucesso posterior resolve alerta automaticamente.

### Sprint 22.3
- Backend da central de alertas operacionais criado.
- Endpoints:
  - `GET /api/v1/operational-alerts/summary`
  - `GET /api/v1/operational-alerts`
  - `GET /api/v1/operational-alerts/{alert_id}`
  - `POST /api/v1/operational-alerts/{alert_id}/resolve`
  - `POST /api/v1/operational-alerts/{alert_id}/ignore`

### Sprint 22.4
- Frontend da página `/operational-alerts`.
- Filtros, listagem, resolver e ignorar alertas.

### Sprint 22.5
- Card de Alertas Operacionais no Dashboard.

### Sprint 22.6
- Detecção de agente offline via SQL.
- Tipo criado: `agent_offline`.
- Resolução automática quando agente volta.

### Sprint 22.7
- Função offline corrigida para respeitar `tenant_id`.
- Endpoint manual:
  - `POST /api/v1/operational-alerts/sync/offline-agents`

### Sprint 22.8
- Scheduler backend para sincronização periódica de agentes offline.
- Variáveis:
  - `OPERATIONAL_ALERTS_OFFLINE_SYNC_ENABLED`
  - `OPERATIONAL_ALERTS_OFFLINE_SYNC_INTERVAL_SECONDS`
  - `OPERATIONAL_ALERTS_OFFLINE_AFTER_MINUTES`

### Sprint 22.9
- Integração de `agent_security_alerts` com `operational_alerts`.
- Tipo criado: `security_alert`.
- Endpoint manual:
  - `POST /api/v1/operational-alerts/sync/security-alerts`

### Sprint 22.10
- Integração de `agent_software_inventory_changes` com `operational_alerts`.
- Tipo criado: `software_change`.
- Endpoint manual:
  - `POST /api/v1/operational-alerts/sync/software-changes`
- Botão no frontend:
  - Sincronizar software
- Validação visual em `/operational-alerts`.

### Sprint 22.11
- Consolidação da central operacional.
- Taxonomia oficial:
  - `command_failed`
  - `agent_offline`
  - `security_alert`
  - `software_change`
- Constraints de status, severidade e tipo.
- Limpeza de alertas antigos de teste.
- Endpoint geral:
  - `POST /api/v1/operational-alerts/sync/all`
- Botão no frontend:
  - Sincronizar tudo
- Labels centralizados no frontend.
- Card de alertas operacionais no detalhe do agente.
- Link do detalhe do agente para a central usando filtro `agent_id`.
- Scheduler consolidado para sincronizar:
  - agentes offline
  - alertas de segurança
  - mudanças de software

## Validações realizadas

- Migrations aplicadas com sucesso.
- Taxonomia do banco validada.
- `operational_alerts_invalid_taxonomy` sem registros.
- Endpoint `/sync/all` funcionando.
- Frontend `/operational-alerts` validado.
- Dashboard validado.
- Detalhe do agente validado.
- Resolução automática de alertas validada.
- `python -m py_compile` passou.
- `npx tsc --noEmit` passou.
- `npm run build` passou.

## Estado final da Sprint 22

A central operacional está pronta e consolidada para ser usada como base da Sprint 23, que iniciará a camada de notificações.

# Sprint 23 — Notificações

## Status

Concluída.

## Branch

`sprint-23-notificacoes`

## Objetivo

Criar a base de notificações persistidas do Projeto Gabriel, conectando eventos operacionais importantes a um histórico consultável no painel web.

## Entregas concluídas

### Sprint 23.1 — Base de notificações no banco

- Criada tabela `notifications`.
- Criada view `notifications_unread_summary`.
- Criadas funções:
  - `open_notification`
  - `mark_notification_read`
  - `archive_notification`
- Criados índices para consulta por tenant, usuário, status, origem e deduplicação.
- Criadas constraints para:
  - canal
  - tipo
  - severidade
  - status

### Sprint 23.2 — Backend de notificações

- Criada rota backend:
  - `backend/app/api/routes/notifications.py`
- Registrada no `main.py`.
- Endpoints criados:
  - `GET /api/v1/notifications/summary`
  - `GET /api/v1/notifications`
  - `POST /api/v1/notifications/{notification_id}/read`
  - `POST /api/v1/notifications/{notification_id}/archive`
  - `POST /api/v1/notifications/read-all`
- Ajustado comportamento para arquivar também marcar como lida.

### Sprint 23.3 — Notificações automáticas de alertas operacionais

- Criada integração entre `operational_alerts` e `notifications`.
- Criadas funções:
  - `build_operational_alert_notification_dedupe_key`
  - `build_operational_alert_notification_action_url`
  - `build_operational_alert_notification_title`
  - `sync_notification_from_operational_alert`
  - `sync_notifications_from_active_operational_alerts`
- Criados triggers:
  - criar/atualizar notificação quando alerta operacional está ativo;
  - arquivar notificação quando alerta operacional é resolvido, ignorado ou removido.
- Criado endpoint:
  - `POST /api/v1/notifications/sync/operational-alerts`

### Sprint 23.4 — Tela de notificações

- Criada página `/notifications`.
- Criada API frontend:
  - `frontend/src/features/notifications/api/notificationsApi.ts`
- Criados hooks:
  - `frontend/src/features/notifications/hooks/usePersistentNotifications.ts`
- Funcionalidades da tela:
  - listar notificações;
  - filtrar por status;
  - filtrar por severidade;
  - filtrar por tipo;
  - buscar por texto;
  - marcar como lida;
  - arquivar;
  - marcar todas como lidas;
  - sincronizar alertas operacionais.

### Sprint 23.5 — Integração com menu e Dashboard

- Adicionado item **Notificações** no menu lateral.
- Adicionado badge de notificações não lidas no menu.
- Criado card **Notificações recentes** no Dashboard.
- Card mostra:
  - não lidas;
  - atenção;
  - críticas;
  - últimas notificações não lidas;
  - link para abrir a origem.

### Sprint 23.6 — Scheduler consolidado

- Scheduler operacional passou a sincronizar também notificações persistidas.
- A reconciliação automática agora cobre:
  - agentes offline;
  - alertas de segurança;
  - mudanças de software;
  - notificações derivadas de alertas operacionais.

### Sprint 23.7 — Ciclo completo validado

- Teste controlado confirmou:
  - alerta operacional ativo cria notificação;
  - notificação nasce como `unread`;
  - alerta resolvido arquiva a notificação;
  - notificação arquivada recebe `read_at` e `archived_at`.

### Sprint 23.9 — Refinamento de abertura

- Clicar em **Abrir** na tela `/notifications` marca a notificação como lida e navega para a origem.
- Clicar em **Abrir** no card do Dashboard também marca como lida.
- Badge do menu lateral atualiza após leitura.

## Validações realizadas

- Migrations aplicadas com sucesso.
- Funções SQL testadas.
- Triggers testados.
- Endpoints testados via `curl`.
- Página `/notifications` validada visualmente.
- Badge no menu validado.
- Card do Dashboard validado.
- Fluxo `unread -> read -> archived` validado.
- `python -m py_compile` passou.
- `npx tsc --noEmit` passou.
- `npm run build` passou.

## Estado final

A Sprint 23 entregou a base persistida de notificações internas do Gabriel, integrada à central operacional e pronta para expansão futura com canais como e-mail, notificações por usuário, preferências e regras de entrega.

# Frontend — Sprints 1 a 10 implementadas

Este pacote consolida a produção das sprints do frontend com integração ao backend existente.

## Sprint 1 — Fundação Frontend

- React + TypeScript + Vite
- TailwindCSS
- React Router
- React Query
- Axios Client e interceptors
- Zustand para sessão
- Layout principal, sidebar, header e rotas protegidas
- Estrutura por camadas/features
- Tipos globais de API, Auth, RBAC, Agent, Printer, Command, Audit e Admin

## Sprint 2 — Autenticação

- Tela `/login`
- Login JWT real via `POST /api/v1/auth/login`
- Refresh token via `POST /api/v1/auth/refresh`
- Logout via `POST /api/v1/auth/logout`
- Bootstrap de sessão via `GET /api/v1/me`
- Persistência de sessão
- Proteção de rotas

## Sprint 3 — Dashboard Inicial

- Página `/dashboard`
- Cards de agentes online/offline, comandos pendentes e impressoras
- Últimos agentes e últimos comandos
- Invalidação por WebSocket

## Sprint 4 — Gestão de Agentes

- Página `/agents`
- Tabela de agentes com hostname, status, versão, último check-in, IP e tags
- Filtros por busca/status
- Exportação CSV
- Criação de tags e grupos
- Revogação de agente

## Sprint 5 — Detalhes do Agente

- Página `/agents/:id`
- Dados gerais
- Impressoras do agente
- Eventos do agente
- Histórico de comandos do agente

## Sprint 6 — Central de Comandos

- Página `/commands`
- Criação de comandos remotos
- Tipos suportados: restart_spooler, clear_print_queue, collect_inventory, install_printer, restart_service
- Histórico e status de comandos
- Exportação CSV

## Sprint 7 — Tempo Real e Auditoria

- Página `/audit`
- Filtros por usuário e ação
- WebSocketProvider preparado para agent_online, agent_offline, command_created e command_finished
- Invalidação de cache automática via React Query

## Sprint 8 — Impressoras

- Página `/printers`
- Tabela com nome, driver, porta, tipo, status e agente
- Filtros por busca/status
- Exportação CSV

## Sprint 9 — Administração

- Páginas `/settings`, `/settings/users`, `/settings/roles`, `/settings/tenants`
- Criação e ativação/desativação de usuários
- Visualização de roles/permissões
- Visualização de tenants

## Sprint 10 — Recursos Avançados

- Tema claro/escuro
- Exportação CSV
- Cards operacionais
- Estrutura pronta para gráficos e notificações

## Backend complementar

Foram adicionados endpoints de suporte para o frontend:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `GET /api/v1/commands`
- `GET /api/v1/commands/{id}`
- `GET /api/v1/agents/{id}/commands`
- `GET /api/v1/printers`
- `GET /api/v1/agents/{id}/printers`
- `GET /api/v1/agents/{id}/events`
- `GET /api/v1/audit`
- `GET /api/v1/audit/{id}`
- `GET /api/v1/settings/users`
- `POST /api/v1/settings/users`
- `PATCH /api/v1/settings/users/{id}`
- `GET /api/v1/settings/roles`
- `GET /api/v1/settings/tenants`

## Como validar

Backend:

```bash
cd backend
PYTHONPATH=. python scripts/init_dev_db.py
PYTHONPATH=. python scripts/seed_dev_data.py
PYTHONPATH=. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Login dev:

```text
admin@example.com
admin123
```

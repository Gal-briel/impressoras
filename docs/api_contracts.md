\# docs/api\_contracts.md



\## Auth



\### `POST /auth/login`

\- \*\*Request:\*\*

&#x20; - `email` (string, email)

&#x20; - `password` (string)

\- \*\*Response:\*\*

&#x20; - `access\_token` (string)

&#x20; - `refresh\_token` (string)

&#x20; - `expires\_in` (integer)

&#x20; - `token\_type` (string, "bearer")

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized` (Credenciais inválidas), `403 Forbidden` (Usuário inativo)

\- \*\*Permissões RBAC:\*\* Nenhuma (Público)

\- \*\*Eventos:\*\* `Audit\_Log(action="user\_login")`



\### `POST /auth/refresh`

\- \*\*Request:\*\*

&#x20; - `refresh\_token` (string)

\- \*\*Response:\*\*

&#x20; - `access\_token` (string)

&#x20; - `expires\_in` (integer)

&#x20; - `token\_type` (string, "bearer")

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized` (Token inválido ou expirado)

\- \*\*Permissões RBAC:\*\* Token de Refresh Válido

\- \*\*Eventos:\*\* Nenhum



\### `GET /me`

\- \*\*Request:\*\* Nenhum

\- \*\*Response:\*\*

&#x20; - `id` (uuid)

&#x20; - `tenant\_id` (uuid)

&#x20; - `email` (string)

&#x20; - `role` (object: `id`, `name`, `permissions` \[array de strings])

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`

\- \*\*Permissões RBAC:\*\* Autenticado

\- \*\*Eventos:\*\* Nenhum



\---



\## Tenants



\### `GET /tenants`

\- \*\*Request:\*\* - Query: `page` (int), `limit` (int), `active` (boolean)

\- \*\*Response:\*\*

&#x20; - `items` (array de Tenants)

&#x20; - `total` (integer)

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`

\- \*\*Permissões RBAC:\*\* `system:admin`

\- \*\*Eventos:\*\* Nenhum



\### `POST /tenants`

\- \*\*Request:\*\*

&#x20; - `name` (string)

\- \*\*Response:\*\*

&#x20; - `id` (uuid)

&#x20; - `name` (string)

&#x20; - `active` (boolean)

&#x20; - `created\_at` (datetime)

\- \*\*Status Codes:\*\* `201 Created`

\- \*\*Erros:\*\* `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (Nome já existe)

\- \*\*Permissões RBAC:\*\* `system:admin`

\- \*\*Eventos:\*\* `Audit\_Log(action="tenant\_created")`



\---



\## Agents



\### `POST /agents/enroll`

\- \*\*Request:\*\*

&#x20; - `enrollment\_token` (string)

&#x20; - `hostname` (string)

&#x20; - `mac\_address` (string)

&#x20; - `os\_version` (string)

&#x20; - `agent\_version` (string)

&#x20; - `capabilities` (array de strings)

\- \*\*Response:\*\*

&#x20; - `agent\_id` (uuid)

&#x20; - `api\_key` (string)

&#x20; - `tenant\_id` (uuid)

\- \*\*Status Codes:\*\* `201 Created`

\- \*\*Erros:\*\* `401 Unauthorized` (Token de enrollment inválido), `409 Conflict` (MAC Address já registrado neste tenant)

\- \*\*Permissões RBAC:\*\* Token de Enrollment Válido

\- \*\*Eventos:\*\* `Audit\_Log(action="agent\_enrolled")`, `Agent\_Event(event\_type="agent\_registered")`



\### `POST /agents/check-in`

\- \*\*Request:\*\*

&#x20; - `agent\_version` (string)

&#x20; - `internal\_ip` (string)

&#x20; - `uptime\_seconds` (integer)

\- \*\*Response:\*\* - `pending\_commands` (integer)

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized` (API Key inválida/revogada)

\- \*\*Permissões RBAC:\*\* Agente (API Key)

\- \*\*Eventos:\*\* Atualiza `last\_seen` e `last\_ip`. Dispara `Agent\_Event(event\_type="ip\_changed")` caso o IP seja alterado.



\### `GET /agents`

\- \*\*Request:\*\*

&#x20; - Query: `page` (int), `limit` (int), `group\_id` (uuid), `status` (string)

\- \*\*Response:\*\*

&#x20; - `items` (array de Agents, calculando `status` com base em `last\_seen`)

&#x20; - `total` (integer)

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`

\- \*\*Permissões RBAC:\*\* `agents:read`

\- \*\*Eventos:\*\* Nenhum



\### `GET /agents/{id}`

\- \*\*Request:\*\* Nenhum

\- \*\*Response:\*\*

&#x20; - Objeto Agent detalhado

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

\- \*\*Permissões RBAC:\*\* `agents:read`

\- \*\*Eventos:\*\* Nenhum



\### `PATCH /agents/{id}/revoke`

\- \*\*Request:\*\*

&#x20; - `reason` (string)

\- \*\*Response:\*\* `204 No Content`

\- \*\*Status Codes:\*\* `204 No Content`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

\- \*\*Permissões RBAC:\*\* `agents:manage`

\- \*\*Eventos:\*\* `Audit\_Log(action="agent\_revoked")`, `Agent\_Event(event\_type="access\_revoked")`



\---



\## Printers



\### `GET /agents/{id}/printers`

\- \*\*Request:\*\* Nenhum

\- \*\*Response:\*\*

&#x20; - `items` (array de Printers mapeadas)

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

\- \*\*Permissões RBAC:\*\* `agents:read`

\- \*\*Eventos:\*\* Nenhum



\---



\## Commands



\### `POST /agents/{id}/commands`

\- \*\*Request:\*\*

&#x20; - `command\_type` (enum: `restart\_spooler`, `clear\_print\_queue`, `collect\_inventory`, `list\_printers`, `install\_printer`, `restart\_service`, `run\_script\_approved`)

&#x20; - `payload` (JSON object)

&#x20; - `timeout\_seconds` (integer, default 60)

&#x20; - `idempotency\_key` (string)

\- \*\*Response:\*\*

&#x20; - Objeto Command (status: `QUEUED`)

\- \*\*Status Codes:\*\* `202 Accepted`

\- \*\*Erros:\*\* `400 Bad Request` (Payload inválido para o tipo), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (Agente não encontrado), `409 Conflict` (Idempotency Key já utilizada)

\- \*\*Permissões RBAC:\*\* `commands:execute`

\- \*\*Eventos:\*\* `Audit\_Log(action="command\_created")`



\### `GET /commands/{id}`

\- \*\*Request:\*\* Nenhum

\- \*\*Response:\*\*

&#x20; - Objeto Command (incluindo junção com `Command\_Result` se existente)

\- \*\*Status Codes:\*\* `200 OK`

\- \*\*Erros:\*\* `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

\- \*\*Permissões RBAC:\*\* `commands:read`

\- \*\*Eventos:\*\* Nenhum



\### `POST /commands/{id}/cancel`

\- \*\*Request:\*\* Nenhum

\- \*\*Response:\*\* `204 No Content`

\- \*\*Status Codes:\*\* `204 No Content`

\- \*\*Erros:\*\* `400 Bad Request` (Comando já executado/finalizado), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

\- \*\*Permissões RBAC:\*\* `commands:execute`

\- \*\*Eventos:\*\* `Audit\_Log(action="command\_cancelled")`



\---



\## WebSockets



\### `WS /agents/{id}/ws`

\- \*\*Request:\*\*

&#x20; - Headers: `Authorization: ApiKey <token>`

\- \*\*Response / Stream de Mensagens:\*\*

&#x20; - `agent -> server`: `{"type": "heartbeat", "timestamp": "..."}`

&#x20; - `server -> agent`: `{"type": "command\_dispatch", "data": {<Command>}}`

&#x20; - `agent -> server`: `{"type": "command\_ack", "command\_id": "...", "status": "ACKNOWLEDGED"}`

&#x20; - `agent -> server`: `{"type": "command\_started", "command\_id": "..."}`

&#x20; - `agent -> server`: `{"type": "command\_output", "command\_id": "...", "chunk": "..."}`

&#x20; - `agent -> server`: `{"type": "command\_finished", "command\_id": "...", "status": "SUCCESS|FAILED", "error\_code": "..."}`

\- \*\*Status Codes (Upgrade):\*\* `101 Switching Protocols`

\- \*\*Erros (Close Codes):\*\* `4001` (Unauthorized), `4003` (Forbidden/Revoked)

\- \*\*Permissões RBAC:\*\* Agente (API Key)

\- \*\*Eventos:\*\* `Agent\_Event(event\_type="websocket\_connected")`, `Agent\_Event(event\_type="websocket\_disconnected")`



\### `WS /dashboard/ws`

\- \*\*Request:\*\*

&#x20; - Headers: `Authorization: Bearer <jwt\_token>` ou via Query Param temporário validado.

\- \*\*Response / Stream de Mensagens:\*\*

&#x20; - `server -> client`: `{"type": "agent\_status\_changed", "agent\_id": "...", "status": "ONLINE|OFFLINE"}`

&#x20; - `server -> client`: `{"type": "command\_status\_changed", "command\_id": "...", "status": "...", "agent\_id": "..."}`

\- \*\*Status Codes (Upgrade):\*\* `101 Switching Protocols`

\- \*\*Erros (Close Codes):\*\* `4001` (Unauthorized), `4003` (Forbidden)

\- \*\*Permissões RBAC:\*\* `dashboard:read`

\- \*\*Eventos:\*\* Nenhum


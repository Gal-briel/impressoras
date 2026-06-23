# Teste local em localhost

Este projeto ainda veio do handoff sem `requirements.txt`, `docker-compose` e com migration inicial resumida. Para facilitar a primeira validação local, foram adicionados:

- `docker-compose.local.yml`
- `backend/requirements.txt`
- `agent/requirements.txt`
- `backend/.env.example`
- `backend/scripts/init_dev_db.py`
- `backend/scripts/create_dev_token.py`

## 1. Subir infraestrutura local

Na raiz do projeto:

```bash
docker compose -f docker-compose.local.yml up -d
```

Serviços:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672`
- RabbitMQ painel: `http://localhost:15672` usuário `guest`, senha `guest`

## 2. Preparar backend

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Instale dependências:

```bash
pip install -r requirements.txt
```

Crie `.env`:

```bash
cp .env.example .env
```

No Windows, copie manualmente `backend/.env.example` para `backend/.env` se não tiver `cp`.

## 3. Criar tabelas para desenvolvimento

Como a migration inicial do handoff veio resumida, use o script dev:

```bash
python scripts/init_dev_db.py
```

Esse script usa `Base.metadata.create_all()` e desliga RLS no ambiente local para facilitar os primeiros testes pelo Swagger.

## 4. Subir API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Acesse:

```text
http://localhost:8000/docs
```

## 5. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Acesse:

```text
http://localhost:5173
```

O frontend ainda tem login mockado no handoff. Para testar rotas administrativas agora, use o Swagger com um JWT gerado manualmente.

## 6. Criar dados dev e gerar token

Para popular tenant, usuário admin e agente de teste:

```bash
cd backend
python scripts/seed_dev_data.py
```

O script imprime:

- `Tenant ID`
- `User ID`
- `Agent ID`
- `Agent API Key`
- `JWT`

No Swagger, clique em **Authorize** e cole:

```text
Bearer <JWT_impresso>
```

Também deixei um gerador avulso, caso precise:

```bash
python scripts/create_dev_token.py <tenant_uuid> <user_uuid>
```

## 7. Testar autenticação do agente

As rotas do agente usam headers:

```text
Authorization: ApiKey <api_key>
X-Agent-ID: <agent_uuid>
```

Exemplo de check-in:

```bash
curl -X POST http://localhost:8000/api/v1/agents/check-in \
  -H "Authorization: ApiKey <api_key>" \
  -H "X-Agent-ID: <agent_uuid>" \
  -H "Content-Type: application/json" \
  -d '{"agent_version":"1.0.0","uptime_seconds":10}'
```

## 8. Testar WebSocket do dashboard

Use a URL:

```text
ws://localhost:8000/api/v1/dashboard/ws?token=<jwt>
```

## 9. Testar agente Windows local

Crie o arquivo:

```text
C:\ProgramData\SaaS_Agent\config.json
```

Exemplo:

```json
{
  "tenant_id": "<tenant_uuid>",
  "agent_id": "<agent_uuid>",
  "api_key": "<api_key>",
  "api_url": "http://localhost:8000/api/v1",
  "ws_url": "ws://localhost:8000/api/v1/agents"
}
```

Instale dependências do agente em ambiente Windows:

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Executar como serviço Windows exige PowerShell Administrador:

```powershell
python service.py install
python service.py start
```

Para parar:

```powershell
python service.py stop
```

Para remover:

```powershell
python service.py remove
```

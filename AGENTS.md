# PrinterBridge - IA/Antigravity Guide

Este documento serve como guia e conjunto de regras absolutas para IAs e desenvolvedores trabalhando no projeto PrinterBridge.

## 1. Contexto do Projeto
- **Caminho correto do projeto**: `~/impressoras`
- **Branch esperada**: `sprint-26-release-candidate` (ou a branch corrente autorizada). Não trabalhar em clones aninhados (ex: `~/impressoras/impressoras`).
- **Stack do Projeto**:
  - Backend: FastAPI/Python (`backend/`)
  - Frontend: React/Vite/TypeScript (`frontend/`)
  - Banco de Dados: PostgreSQL/Supabase
  - Agente Windows: Python/InnoSetup (`agent/windows/`)
  - Infra Local: Redis, RabbitMQ

## 2. Regras de Segurança (MUITO IMPORTANTE)
- **É estritamente proibido** ler, imprimir, modificar ou versionar os seguintes arquivos:
  - Arquivos `.env` e `.env.*` reais (exceto `.env.example`).
  - `config.json` do agente ou qualquer arquivo contendo secrets, tokens, senhas ou API keys reais.
  - Histórico de comandos (ex: `.bash_history`).
- **NUNCA** envie dados do cliente ou do projeto para URLs/serviços externos de forma arbitrária (exceto conexões locais como `127.0.0.1` para validação de dev).

## 3. Comandos Proibidos
Os seguintes comandos não devem ser executados **sem autorização explícita** do usuário humano:
- `git add`, `git commit`, `git push`, `git reset`, `git reset --hard`, `git clean`, `git rebase`
- `rm -rf` indiscriminado.
- Scripts destrutivos no banco de dados (`alembic downgrade`, `alembic upgrade` sem revisão).
- Comandos com elevação de privilégio (`sudo`).
- Instalação autônoma de pacotes (ex: `npm install`, `pip install`) a não ser que especificamente solicitado.

## 4. Resumo de Correções Recentes (Contexto)
Para evitar regressões, respeite o que já foi estabelecido:
- Autenticação segura do agente por ApiKey hash.
- Isolamento multi-tenant (nunca pule a filtragem por tenant).
- RBAC e política de comandos remotos.
- Auditoria de comandos e ações sensíveis.
- Normalização de domínio/MAC/hostname.
- CORS configurável. Rate limit em login/refresh/enrollment.
- Enrollment seguro de agentes e bloqueio de configs inseguras em produção.
- `update_agent` endurecido (SHA obrigatório, download autenticado, tracking success/failed, e cycle audit).
- Payload de comando validado, com sanitização de output.
- Comandos estagnados expiram automaticamente e frontend exibe expires timeout corretamente.
- Uso de serviço centralizado de idempotência e status.
- Estados terminais não podem ser sobrescritos.

## 5. Padrão de Desenvolvimento & Definition of Done
Antes de entregar uma alteração, certifique-se de realizar o checklist:
1. Inspecionar o código existente (não duplicar serviço central).
2. Fazer a menor alteração segura possível, preservando multi-tenancy, audit log, e websocket.
3. Não criar novas migrations sem necessidade absoluta.
4. Modificar apenas as camadas requeridas pela tarefa.
5. **Ao finalizar a tarefa, a IA deve entregar obrigatoriamente**:
   - Resumo do problema e da solução criados.
   - Lista de arquivos alterados e diff stat.
   - Trechos principais do diff.
   - Resultados reais das validações locais.
   - Riscos residuais / revisão manual necessária.
   - Confirmação de que NÃO leu/alterou segredos, e que NÃO executou `git add/commit/push`.
   - Saída de `git diff --name-status`.

## 6. Scripts de Validação (scripts/)
Toda alteração deve ser validada localmente com scripts idempotentes que falham (exit != 0) caso haja erro:
- `./scripts/check-secrets.sh` (Validação anti-segredos e anti-arquivos proibidos)
- `./scripts/check-backend.sh`
- `./scripts/check-frontend.sh`
- `./scripts/check-all.sh`

## 7. Regras Anti-Regressão para IAs

Antes de alterar arquivos existentes, principalmente workflows, scripts, serviços centrais, autenticação, comandos remotos ou agente Windows:

1. Verifique se o arquivo já existe no Git:
   - `git ls-files <arquivo>`
   - `git diff -- <arquivo>`

2. Nunca substitua um arquivo inteiro sem listar o que será removido.

3. Sempre compare comportamento antigo vs. novo:
   - O que o código antigo fazia?
   - O que o novo código deixará de fazer?
   - Qual teste/script cobre a funcionalidade removida?

4. Se remover validações, serviços, jobs de CI, comandos de segurança, auditoria, websocket ou filtros multi-tenant, pare e peça revisão humana.

5. Ao alterar CI ou scripts de validação, preservar obrigatoriamente:
   - validação do backend;
   - testes automatizados;
   - build do frontend;
   - validação sintática do agente Windows;
   - `git diff --check`.
   - **Nota de Segurança:** Qualquer alteração em scripts de segurança ou validação de segredos precisa ter um teste próprio que garanta a detecção de falsos positivos e negativos.

6. No relatório final, sempre informar:
   - arquivos novos;
   - arquivos modificados;
   - arquivos removidos;
   - funcionalidades removidas;
   - justificativa para cada remoção.

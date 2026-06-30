# Sprint 18 — Operação e histórico de comandos

## Objetivo
Consolidar a operação de comandos remotos, histórico, filtros, comandos em massa e acompanhamento de execução dos agentes.

## Escopo principal

### Backend
- Criar/estabilizar endpoint global de comandos: GET /api/v1/commands
- Criar filtros por agente, status, tipo e limite
- Garantir retorno padronizado: { items, total }
- Garantir histórico por agente: GET /api/v1/agents/{agent_id}/commands
- Padronizar status dos comandos
- Melhorar tratamento de erro nos comandos
- Criar endpoint de resumo operacional: GET /api/v1/dashboard/summary

### Frontend
- Validar tela Histórico de comandos
- Validar tela Comandos em massa
- Validar cards do dashboard
- Ajustar mensagens de erro
- Garantir que todas as telas usem a API atual do Codespace

### Agente Windows
- Confirmar envio e execução dos comandos
- Confirmar retorno de status: queued, executing, success, failed, timed_out
- Confirmar coleta de diagnóstico e inventário

## Critérios de aceite
- Login funcionando
- Dashboard carregando sem erro crítico
- Tela Agentes listando agentes reais
- Tela Histórico de comandos listando comandos reais
- Tela Comandos em massa enviando comando para mais de um agente
- Comando enviado aparece no histórico
- Agente executa comando e atualiza status

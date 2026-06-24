# Sprint 2.5 — UI Foundation

## Objetivo

Melhorar a fundação visual do frontend antes da evolução das telas de negócio.

## Entregas

- Tema base com TailwindCSS aplicado de forma consistente.
- Tela de login profissional com layout dividido, fundo escuro e formulário em card.
- Sidebar com navegação, estado ativo, ícones simples e área de contexto de segurança.
- Header com informações de tenant, usuário, role, botão de tema e logout.
- Componentes base revisados:
  - Button
  - Input
  - Card
  - Badge
  - PageHeader
  - StatCard
- Ajustes globais de CSS:
  - fonte do sistema
  - anti-aliasing
  - dark mode
  - background padrão
  - utilitários `glass-panel` e `focus-ring`

## Arquivos impactados

- frontend/src/index.css
- frontend/tailwind.config.js
- frontend/src/components/ui/Button.tsx
- frontend/src/components/ui/Input.tsx
- frontend/src/components/ui/Card.tsx
- frontend/src/components/ui/Badge.tsx
- frontend/src/components/ui/PageHeader.tsx
- frontend/src/components/ui/StatCard.tsx
- frontend/src/layouts/AuthLayout.tsx
- frontend/src/layouts/MainLayout.tsx
- frontend/src/components/navigation/Sidebar.tsx
- frontend/src/components/navigation/Header.tsx
- frontend/src/pages/LoginPage.tsx

## Validação

Executado:

```bash
cd frontend
npm run build
```

Resultado: build concluído com sucesso.

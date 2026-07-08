INSERT INTO public.permissions (id, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'dashboard:read', 'Visualizar dashboard', now(), now()),
  (gen_random_uuid(), 'commands:read', 'Visualizar comandos', now(), now()),
  (gen_random_uuid(), 'operational-alerts:read', 'Visualizar alertas operacionais', now(), now()),
  (gen_random_uuid(), 'operational-alerts:write', 'Gerenciar alertas operacionais', now(), now()),
  (gen_random_uuid(), 'notifications:read', 'Visualizar notificações', now(), now()),
  (gen_random_uuid(), 'notifications:write', 'Gerenciar notificações', now(), now()),
  (gen_random_uuid(), 'reports:read', 'Visualizar relatórios', now(), now()),
  (gen_random_uuid(), 'reports:export', 'Exportar relatórios', now(), now()),
  (gen_random_uuid(), 'audit:read', 'Visualizar auditoria', now(), now()),
  (gen_random_uuid(), 'settings:read', 'Visualizar configurações', now(), now()),
  (gen_random_uuid(), 'users:manage', 'Gerenciar usuários', now(), now())
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Admin Dev'
ON CONFLICT DO NOTHING;

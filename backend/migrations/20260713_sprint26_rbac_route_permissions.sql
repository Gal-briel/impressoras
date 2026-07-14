INSERT INTO permissions (id, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'printers:write', 'Gerenciar inventário de impressoras', now(), now()),
  (gen_random_uuid(), 'security-alerts:read', 'Visualizar alertas de segurança', now(), now()),
  (gen_random_uuid(), 'security-alerts:write', 'Gerenciar alertas de segurança', now(), now()),
  (gen_random_uuid(), 'software-inventory:read', 'Visualizar mudanças de softwares', now(), now())
ON CONFLICT (name) DO NOTHING;

-- Permissões de leitura para papéis que já podem ler agentes/inventário.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_new.id
FROM role_permissions rp
JOIN permissions p_existing ON p_existing.id = rp.permission_id
JOIN permissions p_new ON p_new.name IN (
  'security-alerts:read',
  'software-inventory:read'
)
WHERE p_existing.name IN ('agents:read', 'inventory:read')
ON CONFLICT DO NOTHING;

-- Permissões de escrita para papéis administrativos/operacionais.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_new.id
FROM role_permissions rp
JOIN permissions p_existing ON p_existing.id = rp.permission_id
JOIN permissions p_new ON p_new.name IN (
  'printers:write',
  'security-alerts:write'
)
WHERE p_existing.name IN ('users:manage', 'agents:write', 'operational-alerts:write')
ON CONFLICT DO NOTHING;

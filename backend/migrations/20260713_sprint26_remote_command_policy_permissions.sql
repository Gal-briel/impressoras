INSERT INTO permissions (id, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'commands:system', 'Executar comandos sensíveis de sistema', now(), now())
ON CONFLICT (name) DO NOTHING;

-- Apenas papéis com gestão de usuários recebem comandos sensíveis automaticamente.
-- Demais cargos precisam receber essa permissão manualmente pelo editor de cargos.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_new.id
FROM role_permissions rp
JOIN permissions p_existing ON p_existing.id = rp.permission_id
JOIN permissions p_new ON p_new.name = 'commands:system'
WHERE p_existing.name IN ('users:manage')
ON CONFLICT DO NOTHING;

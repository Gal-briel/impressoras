CREATE OR REPLACE FUNCTION persist_security_alerts_from_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    firewall_disabled_profiles text[];
    firewall_disabled_count integer := 0;
    bitlocker_unprotected_count integer := 0;
    admin_enabled_count integer := 0;
    local_admin_count integer := 0;
BEGIN
    DELETE FROM agent_security_alerts
    WHERE snapshot_id = NEW.id;

    IF COALESCE((NEW.defender ->> 'available')::boolean, false) = false THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'critical',
            'Microsoft Defender indisponível',
            'Não foi possível confirmar o status do Microsoft Defender.',
            'defender',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    IF COALESCE((NEW.defender ->> 'antivirus_enabled')::boolean, true) = false THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'critical',
            'Antivírus desativado',
            'O Microsoft Defender aparece com antivírus desativado.',
            'antivirus',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    IF COALESCE((NEW.defender ->> 'real_time_protection_enabled')::boolean, true) = false THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'warning',
            'Proteção em tempo real desativada',
            'A proteção em tempo real do Microsoft Defender não está ativa.',
            'defender',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    IF jsonb_array_length(COALESCE(NEW.antivirus, '[]'::jsonb)) = 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'critical',
            'Nenhum antivírus detectado',
            'Nenhum produto antivírus foi retornado pelo Security Center.',
            'antivirus',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    SELECT
        COUNT(*),
        ARRAY_AGG(profile_item ->> 'name')
    INTO
        firewall_disabled_count,
        firewall_disabled_profiles
    FROM jsonb_array_elements(COALESCE(NEW.firewall, '[]'::jsonb)) AS profile_item
    WHERE lower(COALESCE(profile_item ->> 'enabled', 'false')) NOT IN ('true', '1', 'enabled');

    IF firewall_disabled_count > 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'warning',
            'Perfil de firewall desativado',
            'Perfis afetados: ' || array_to_string(firewall_disabled_profiles, ', ') || '.',
            'firewall',
            jsonb_build_object('profiles', firewall_disabled_profiles),
            NEW.collected_at
        );
    END IF;

    SELECT COUNT(*)
    INTO bitlocker_unprotected_count
    FROM jsonb_array_elements(COALESCE(NEW.bitlocker, '[]'::jsonb)) AS volume_item
    WHERE upper(COALESCE(volume_item ->> 'mount_point', '')) LIKE 'C:%'
      AND lower(COALESCE(volume_item ->> 'protection_status', 'off')) IN ('off', 'false', '0', 'disabled');

    IF bitlocker_unprotected_count > 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'warning',
            'BitLocker desprotegido no disco do sistema',
            'O volume C: não aparece com proteção ativa do BitLocker.',
            'bitlocker',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    SELECT COUNT(*)
    INTO admin_enabled_count
    FROM jsonb_array_elements(COALESCE(NEW.local_users, '[]'::jsonb)) AS user_item
    WHERE lower(COALESCE(user_item ->> 'name', '')) IN ('administrador', 'administrator')
      AND lower(COALESCE(user_item ->> 'enabled', 'false')) IN ('true', '1', 'enabled');

    IF admin_enabled_count > 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'warning',
            'Administrador local padrão habilitado',
            'A conta Administrador/Administrator está habilitada.',
            'local_users',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    IF jsonb_array_length(COALESCE(NEW.hotfixes, '[]'::jsonb)) = 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'warning',
            'Hotfixes não encontrados',
            'A coleta não retornou atualizações instaladas.',
            'updates',
            '{}'::jsonb,
            NEW.collected_at
        );
    END IF;

    local_admin_count := jsonb_array_length(COALESCE(NEW.local_administrators, '[]'::jsonb));

    IF local_admin_count > 0 THEN
        INSERT INTO agent_security_alerts (
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            collected_at
        )
        VALUES (
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            NEW.command_id,
            'info',
            'Administradores locais detectados',
            local_admin_count || ' membro(s) encontrado(s) no grupo Administradores.',
            'local_administrators',
            jsonb_build_object('count', local_admin_count),
            NEW.collected_at
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persist_security_alerts_from_snapshot ON agent_security_snapshots;

CREATE TRIGGER trg_persist_security_alerts_from_snapshot
AFTER INSERT OR UPDATE
ON agent_security_snapshots
FOR EACH ROW
EXECUTE FUNCTION persist_security_alerts_from_snapshot();

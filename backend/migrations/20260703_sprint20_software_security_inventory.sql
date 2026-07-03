BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_software_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid NULL,
    name text NOT NULL,
    version text NULL,
    publisher text NULL,
    install_date text NULL,
    estimated_size_mb numeric NULL,
    install_location text NULL,
    uninstall_string text NULL,
    registry_key text NULL,
    source text NULL,
    user_sid text NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_agent_id
ON agent_software_inventory(agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_name
ON agent_software_inventory(name);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_source
ON agent_software_inventory(source);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_tenant_agent
ON agent_software_inventory(tenant_id, agent_id);

CREATE TABLE IF NOT EXISTS agent_security_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid NULL,
    defender jsonb NULL,
    antivirus jsonb NULL,
    bitlocker jsonb NULL,
    firewall jsonb NULL,
    hotfixes jsonb NULL,
    update_services jsonb NULL,
    local_users jsonb NULL,
    local_groups jsonb NULL,
    local_administrators jsonb NULL,
    usb_devices jsonb NULL,
    monitors jsonb NULL,
    recent_software jsonb NULL,
    security_score integer NULL,
    critical_alerts integer DEFAULT 0,
    warning_alerts integer DEFAULT 0,
    info_alerts integer DEFAULT 0,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_security_snapshots_agent_id
ON agent_security_snapshots(agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_security_snapshots_collected_at
ON agent_security_snapshots(collected_at DESC);

CREATE INDEX IF NOT EXISTS ix_agent_security_snapshots_tenant_agent
ON agent_security_snapshots(tenant_id, agent_id);

COMMIT;
CREATE OR REPLACE FUNCTION public.persist_agent_inventory_from_command()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    data jsonb;
    critical_count integer := 0;
    warning_count integer := 0;
    info_count integer := 0;
    calculated_score integer := 100;
    firewall_disabled_count integer := 0;
    bitlocker_unprotected_count integer := 0;
    admin_enabled_count integer := 0;
BEGIN
    IF NEW.status <> 'success' THEN
        RETURN NEW;
    END IF;

    IF NEW.output IS NULL OR btrim(NEW.output) = '' THEN
        RETURN NEW;
    END IF;

    IF NEW.command_type NOT IN ('collect_software_inventory', 'collect_security_inventory') THEN
        RETURN NEW;
    END IF;

    BEGIN
        data := NEW.output::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    IF NEW.command_type = 'collect_software_inventory' THEN
        DELETE FROM agent_software_inventory
        WHERE agent_id = NEW.agent_id;

        INSERT INTO agent_software_inventory (
            id,
            tenant_id,
            agent_id,
            command_id,
            name,
            version,
            publisher,
            install_date,
            estimated_size_mb,
            install_location,
            uninstall_string,
            registry_key,
            source,
            user_sid,
            collected_at,
            created_at
        )
        SELECT
            gen_random_uuid(),
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            item ->> 'name',
            item ->> 'version',
            item ->> 'publisher',
            item ->> 'install_date',
            CASE
                WHEN item ->> 'estimated_size_mb' ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (item ->> 'estimated_size_mb')::numeric
                ELSE NULL
            END,
            item ->> 'install_location',
            item ->> 'uninstall_string',
            item ->> 'registry_key',
            COALESCE(item ->> 'source', 'unknown'),
            item ->> 'user_sid',
            COALESCE(NEW.finished_at, now()),
            now()
        FROM jsonb_array_elements(COALESCE(data -> 'items', '[]'::jsonb)) AS item
        WHERE COALESCE(item ->> 'name', '') <> '';

        RETURN NEW;
    END IF;

    IF NEW.command_type = 'collect_security_inventory' THEN
        DELETE FROM agent_security_snapshots
        WHERE command_id = NEW.id;

        IF COALESCE((data -> 'defender' ->> 'available')::boolean, false) = false THEN
            critical_count := critical_count + 1;
        END IF;

        IF COALESCE((data -> 'defender' ->> 'antivirus_enabled')::boolean, true) = false THEN
            critical_count := critical_count + 1;
        END IF;

        IF COALESCE((data -> 'defender' ->> 'real_time_protection_enabled')::boolean, true) = false THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'antivirus', '[]'::jsonb)) = 0 THEN
            critical_count := critical_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO firewall_disabled_count
        FROM jsonb_array_elements(COALESCE(data -> 'firewall', '[]'::jsonb)) AS firewall_item
        WHERE lower(COALESCE(firewall_item ->> 'enabled', 'false')) NOT IN ('true', '1', 'enabled');

        IF firewall_disabled_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO bitlocker_unprotected_count
        FROM jsonb_array_elements(COALESCE(data -> 'bitlocker', '[]'::jsonb)) AS bitlocker_item
        WHERE upper(COALESCE(bitlocker_item ->> 'mount_point', '')) LIKE 'C:%'
          AND lower(COALESCE(bitlocker_item ->> 'protection_status', 'off')) IN ('off', 'false', '0', 'disabled');

        IF bitlocker_unprotected_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO admin_enabled_count
        FROM jsonb_array_elements(COALESCE(data -> 'local_users', '[]'::jsonb)) AS user_item
        WHERE lower(COALESCE(user_item ->> 'name', '')) IN ('administrador', 'administrator')
          AND lower(COALESCE(user_item ->> 'enabled', 'false')) IN ('true', '1', 'enabled');

        IF admin_enabled_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'hotfixes', '[]'::jsonb)) = 0 THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'local_administrators', '[]'::jsonb)) > 0 THEN
            info_count := info_count + 1;
        END IF;

        calculated_score := GREATEST(0, 100 - (critical_count * 30) - (warning_count * 15));

        INSERT INTO agent_security_snapshots (
            id,
            tenant_id,
            agent_id,
            command_id,
            defender,
            antivirus,
            bitlocker,
            firewall,
            hotfixes,
            update_services,
            local_users,
            local_groups,
            local_administrators,
            usb_devices,
            monitors,
            recent_software,
            security_score,
            critical_alerts,
            warning_alerts,
            info_alerts,
            collected_at,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            COALESCE(data -> 'defender', '{}'::jsonb),
            COALESCE(data -> 'antivirus', '[]'::jsonb),
            COALESCE(data -> 'bitlocker', '[]'::jsonb),
            COALESCE(data -> 'firewall', '[]'::jsonb),
            COALESCE(data -> 'hotfixes', '[]'::jsonb),
            COALESCE(data -> 'update_services', '[]'::jsonb),
            COALESCE(data -> 'local_users', '[]'::jsonb),
            COALESCE(data -> 'local_groups', '[]'::jsonb),
            COALESCE(data -> 'local_administrators', '[]'::jsonb),
            COALESCE(data -> 'usb_devices', '[]'::jsonb),
            COALESCE(data -> 'monitors', '[]'::jsonb),
            COALESCE(data -> 'recent_software', '[]'::jsonb),
            calculated_score,
            critical_count,
            warning_count,
            info_count,
            COALESCE(NEW.finished_at, now()),
            now()
        );

        RETURN NEW;
    END IF;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_persist_agent_inventory_from_command ON commands;

CREATE TRIGGER trg_persist_agent_inventory_from_command
AFTER INSERT OR UPDATE OF status, output, finished_at
ON commands
FOR EACH ROW
EXECUTE FUNCTION persist_agent_inventory_from_command();

CREATE OR REPLACE FUNCTION persist_agent_inventory_from_command()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    data jsonb;
    critical_count integer := 0;
    warning_count integer := 0;
    info_count integer := 0;
    calculated_score integer := 100;
    firewall_disabled_count integer := 0;
    bitlocker_unprotected_count integer := 0;
    admin_enabled_count integer := 0;
    software_items jsonb := '[]'::jsonb;
    current_snapshot_id uuid;
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
        software_items := CASE
            WHEN jsonb_typeof(data -> 'items') = 'array'
            THEN data -> 'items'
            ELSE '[]'::jsonb
        END;

        DELETE FROM agent_software_inventory
        WHERE agent_id = NEW.agent_id;

        DELETE FROM agent_software_inventory_snapshots
        WHERE command_id = NEW.id;

        INSERT INTO agent_software_inventory_snapshots (
            id,
            tenant_id,
            agent_id,
            command_id,
            total_items,
            sources,
            raw_counts,
            collection_mode,
            collected_at,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            jsonb_array_length(software_items),
            COALESCE(data -> 'sources', '[]'::jsonb),
            COALESCE(data -> 'raw_counts', '{}'::jsonb),
            jsonb_build_object(
                'limit', data -> 'limit',
                'search', data -> 'search',
                'include_store_apps', COALESCE((data ->> 'include_store_apps')::boolean, false),
                'include_package_provider', COALESCE((data ->> 'include_package_provider')::boolean, false)
            ),
            COALESCE(NEW.finished_at, now()),
            now()
        )
        RETURNING id INTO current_snapshot_id;

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
        FROM jsonb_array_elements(software_items) AS item
        WHERE COALESCE(item ->> 'name', '') <> '';

        INSERT INTO agent_software_inventory_snapshot_items (
            id,
            snapshot_id,
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
            item_key,
            collected_at,
            created_at
        )
        SELECT
            gen_random_uuid(),
            current_snapshot_id,
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
            md5(lower(concat_ws(
                '|',
                COALESCE(item ->> 'name', ''),
                COALESCE(item ->> 'version', ''),
                COALESCE(item ->> 'publisher', ''),
                COALESCE(item ->> 'source', 'unknown'),
                COALESCE(item ->> 'user_sid', '')
            ))),
            COALESCE(NEW.finished_at, now()),
            now()
        FROM jsonb_array_elements(software_items) AS item
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
$$;

DROP TRIGGER IF EXISTS trg_persist_agent_inventory_from_command ON commands;

CREATE TRIGGER trg_persist_agent_inventory_from_command
AFTER INSERT OR UPDATE OF status, output, finished_at
ON commands
FOR EACH ROW
EXECUTE FUNCTION persist_agent_inventory_from_command();

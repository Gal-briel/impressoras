CREATE OR REPLACE FUNCTION build_software_change_operational_dedupe_key(
    p_agent_id uuid,
    p_change_type text,
    p_identity_key text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT concat(
        'software_change:',
        p_agent_id::text,
        ':',
        COALESCE(p_change_type, 'unknown'),
        ':',
        COALESCE(NULLIF(p_identity_key, ''), 'unknown')
    );
$$;


CREATE OR REPLACE FUNCTION classify_software_change_operational_severity(
    p_change_type text,
    p_publisher text,
    p_source text,
    p_previous_install_location text,
    p_latest_install_location text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_change_type = 'removed' THEN 'warning'
        WHEN p_change_type = 'added'
             AND NULLIF(trim(COALESCE(p_publisher, '')), '') IS NULL THEN 'warning'
        WHEN p_change_type = 'changed'
             AND COALESCE(p_previous_install_location, '') <> COALESCE(p_latest_install_location, '') THEN 'warning'
        ELSE 'info'
    END;
$$;


CREATE OR REPLACE FUNCTION build_software_change_operational_title(
    p_change_type text,
    p_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_change_type = 'added' THEN concat('Software instalado: ', COALESCE(NULLIF(p_name, ''), 'desconhecido'))
        WHEN p_change_type = 'removed' THEN concat('Software removido: ', COALESCE(NULLIF(p_name, ''), 'desconhecido'))
        WHEN p_change_type = 'changed' THEN concat('Software alterado: ', COALESCE(NULLIF(p_name, ''), 'desconhecido'))
        ELSE concat('Mudança de software: ', COALESCE(NULLIF(p_name, ''), 'desconhecido'))
    END;
$$;


CREATE OR REPLACE FUNCTION build_software_change_operational_description(
    p_change_type text,
    p_name text,
    p_publisher text,
    p_source text,
    p_previous_version text,
    p_latest_version text,
    p_previous_install_date text,
    p_latest_install_date text,
    p_previous_install_location text,
    p_latest_install_location text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_change_type = 'added' THEN
            concat(
                'O agente detectou a instalação do software ', COALESCE(NULLIF(p_name, ''), 'desconhecido'), '.',
                CASE WHEN NULLIF(p_latest_version, '') IS NOT NULL THEN concat(' Versão: ', p_latest_version, '.') ELSE '' END,
                CASE WHEN NULLIF(p_publisher, '') IS NOT NULL THEN concat(' Publicador: ', p_publisher, '.') ELSE '' END,
                CASE WHEN NULLIF(p_source, '') IS NOT NULL THEN concat(' Origem: ', p_source, '.') ELSE '' END,
                CASE WHEN NULLIF(p_latest_install_date, '') IS NOT NULL THEN concat(' Data de instalação: ', p_latest_install_date, '.') ELSE '' END
            )
        WHEN p_change_type = 'removed' THEN
            concat(
                'O agente detectou a remoção do software ', COALESCE(NULLIF(p_name, ''), 'desconhecido'), '.',
                CASE WHEN NULLIF(p_previous_version, '') IS NOT NULL THEN concat(' Versão anterior: ', p_previous_version, '.') ELSE '' END,
                CASE WHEN NULLIF(p_publisher, '') IS NOT NULL THEN concat(' Publicador: ', p_publisher, '.') ELSE '' END,
                CASE WHEN NULLIF(p_source, '') IS NOT NULL THEN concat(' Origem: ', p_source, '.') ELSE '' END
            )
        WHEN p_change_type = 'changed' THEN
            concat(
                'O agente detectou alteração no software ', COALESCE(NULLIF(p_name, ''), 'desconhecido'), '.',
                CASE
                    WHEN COALESCE(p_previous_version, '') <> COALESCE(p_latest_version, '')
                        THEN concat(' Versão anterior: ', COALESCE(NULLIF(p_previous_version, ''), '—'), '; versão atual: ', COALESCE(NULLIF(p_latest_version, ''), '—'), '.')
                    ELSE ''
                END,
                CASE
                    WHEN COALESCE(p_previous_install_location, '') <> COALESCE(p_latest_install_location, '')
                        THEN concat(' Local anterior: ', COALESCE(NULLIF(p_previous_install_location, ''), '—'), '; local atual: ', COALESCE(NULLIF(p_latest_install_location, ''), '—'), '.')
                    ELSE ''
                END,
                CASE
                    WHEN COALESCE(p_previous_install_date, '') <> COALESCE(p_latest_install_date, '')
                        THEN concat(' Instalação anterior: ', COALESCE(NULLIF(p_previous_install_date, ''), '—'), '; instalação atual: ', COALESCE(NULLIF(p_latest_install_date, ''), '—'), '.')
                    ELSE ''
                END
            )
        ELSE
            concat('O agente detectou uma mudança de software para ', COALESCE(NULLIF(p_name, ''), 'desconhecido'), '.')
    END;
$$;


CREATE OR REPLACE FUNCTION sync_operational_alert_from_software_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    software_record record;
    v_dedupe_key text;
    v_should_resolve boolean := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_active = true THEN
            v_dedupe_key := build_software_change_operational_dedupe_key(
                OLD.agent_id,
                OLD.change_type,
                OLD.identity_key
            );

            PERFORM resolve_operational_alert_by_dedupe(
                OLD.tenant_id,
                v_dedupe_key
            );
        END IF;

        RETURN OLD;
    END IF;

    software_record := NEW;

    v_dedupe_key := build_software_change_operational_dedupe_key(
        software_record.agent_id,
        software_record.change_type,
        software_record.identity_key
    );

    IF software_record.is_active = true THEN
        PERFORM open_operational_alert(
            software_record.tenant_id,
            software_record.agent_id,
            'software_change',
            classify_software_change_operational_severity(
                software_record.change_type,
                software_record.publisher,
                software_record.source,
                software_record.previous_install_location,
                software_record.latest_install_location
            ),
            build_software_change_operational_title(
                software_record.change_type,
                software_record.name
            ),
            build_software_change_operational_description(
                software_record.change_type,
                software_record.name,
                software_record.publisher,
                software_record.source,
                software_record.previous_version,
                software_record.latest_version,
                software_record.previous_install_date,
                software_record.latest_install_date,
                software_record.previous_install_location,
                software_record.latest_install_location
            ),
            'agent_software_inventory_change',
            software_record.id,
            v_dedupe_key,
            jsonb_build_object(
                'software_change_id', software_record.id,
                'snapshot_id', software_record.snapshot_id,
                'previous_snapshot_id', software_record.previous_snapshot_id,
                'command_id', software_record.command_id,
                'change_type', software_record.change_type,
                'identity_key', software_record.identity_key,
                'item_key', software_record.item_key,
                'name', software_record.name,
                'publisher', software_record.publisher,
                'source', software_record.source,
                'previous_version', software_record.previous_version,
                'latest_version', software_record.latest_version,
                'previous_install_date', software_record.previous_install_date,
                'latest_install_date', software_record.latest_install_date,
                'previous_install_location', software_record.previous_install_location,
                'latest_install_location', software_record.latest_install_location,
                'collected_at', software_record.collected_at
            ) || COALESCE(software_record.metadata, '{}'::jsonb)
        );

        RETURN NEW;
    END IF;

    v_should_resolve := TG_OP = 'INSERT' OR COALESCE(OLD.is_active, false) = true;

    IF v_should_resolve THEN
        PERFORM resolve_operational_alert_by_dedupe(
            software_record.tenant_id,
            v_dedupe_key
        );
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_sync_operational_alert_from_software_change
ON agent_software_inventory_changes;

CREATE TRIGGER trg_sync_operational_alert_from_software_change
AFTER INSERT OR UPDATE OF
    is_active,
    change_type,
    identity_key,
    name,
    publisher,
    source,
    previous_version,
    latest_version,
    previous_install_date,
    latest_install_date,
    previous_install_location,
    latest_install_location
ON agent_software_inventory_changes
FOR EACH ROW
EXECUTE FUNCTION sync_operational_alert_from_software_change();


DROP TRIGGER IF EXISTS trg_resolve_operational_alert_from_deleted_software_change
ON agent_software_inventory_changes;

CREATE TRIGGER trg_resolve_operational_alert_from_deleted_software_change
AFTER DELETE
ON agent_software_inventory_changes
FOR EACH ROW
EXECUTE FUNCTION sync_operational_alert_from_software_change();


CREATE OR REPLACE FUNCTION sync_operational_alerts_from_active_software_changes(
    p_tenant_id uuid
)
RETURNS TABLE (
    opened_or_refreshed integer,
    resolved integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    software_record record;
    operational_record record;
    v_opened integer := 0;
    v_resolved integer := 0;
    v_dedupe_key text;
BEGIN
    FOR software_record IN
        SELECT
            id,
            tenant_id,
            agent_id,
            snapshot_id,
            previous_snapshot_id,
            command_id,
            change_type,
            identity_key,
            item_key,
            name,
            publisher,
            source,
            previous_version,
            latest_version,
            previous_install_date,
            latest_install_date,
            previous_install_location,
            latest_install_location,
            metadata,
            is_active,
            collected_at
        FROM agent_software_inventory_changes
        WHERE tenant_id = p_tenant_id
          AND is_active = true
    LOOP
        v_dedupe_key := build_software_change_operational_dedupe_key(
            software_record.agent_id,
            software_record.change_type,
            software_record.identity_key
        );

        PERFORM open_operational_alert(
            software_record.tenant_id,
            software_record.agent_id,
            'software_change',
            classify_software_change_operational_severity(
                software_record.change_type,
                software_record.publisher,
                software_record.source,
                software_record.previous_install_location,
                software_record.latest_install_location
            ),
            build_software_change_operational_title(
                software_record.change_type,
                software_record.name
            ),
            build_software_change_operational_description(
                software_record.change_type,
                software_record.name,
                software_record.publisher,
                software_record.source,
                software_record.previous_version,
                software_record.latest_version,
                software_record.previous_install_date,
                software_record.latest_install_date,
                software_record.previous_install_location,
                software_record.latest_install_location
            ),
            'agent_software_inventory_change',
            software_record.id,
            v_dedupe_key,
            jsonb_build_object(
                'software_change_id', software_record.id,
                'snapshot_id', software_record.snapshot_id,
                'previous_snapshot_id', software_record.previous_snapshot_id,
                'command_id', software_record.command_id,
                'change_type', software_record.change_type,
                'identity_key', software_record.identity_key,
                'item_key', software_record.item_key,
                'name', software_record.name,
                'publisher', software_record.publisher,
                'source', software_record.source,
                'previous_version', software_record.previous_version,
                'latest_version', software_record.latest_version,
                'previous_install_date', software_record.previous_install_date,
                'latest_install_date', software_record.latest_install_date,
                'previous_install_location', software_record.previous_install_location,
                'latest_install_location', software_record.latest_install_location,
                'collected_at', software_record.collected_at
            ) || COALESCE(software_record.metadata, '{}'::jsonb)
        );

        v_opened := v_opened + 1;
    END LOOP;

    FOR operational_record IN
        SELECT
            id,
            tenant_id,
            agent_id,
            dedupe_key
        FROM operational_alerts
        WHERE tenant_id = p_tenant_id
          AND alert_type = 'software_change'
          AND status = 'active'
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM agent_software_inventory_changes software_changes
            WHERE software_changes.tenant_id = operational_record.tenant_id
              AND software_changes.agent_id = operational_record.agent_id
              AND software_changes.is_active = true
              AND build_software_change_operational_dedupe_key(
                    software_changes.agent_id,
                    software_changes.change_type,
                    software_changes.identity_key
                  ) = operational_record.dedupe_key
        ) THEN
            v_resolved := v_resolved + resolve_operational_alert_by_dedupe(
                operational_record.tenant_id,
                operational_record.dedupe_key
            );
        END IF;
    END LOOP;

    opened_or_refreshed := v_opened;
    resolved := v_resolved;

    RETURN NEXT;
END;
$$;

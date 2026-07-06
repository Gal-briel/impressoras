CREATE OR REPLACE FUNCTION build_operational_alert_notification_dedupe_key(
    p_operational_alert_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT concat('operational_alert:', p_operational_alert_id::text);
$$;


CREATE OR REPLACE FUNCTION build_operational_alert_notification_action_url(
    p_agent_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_agent_id IS NOT NULL THEN concat('/operational-alerts?agent_id=', p_agent_id::text)
        ELSE '/operational-alerts'
    END;
$$;


CREATE OR REPLACE FUNCTION build_operational_alert_notification_title(
    p_alert_type text,
    p_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_alert_type = 'command_failed' THEN concat('Falha em comando: ', COALESCE(NULLIF(p_title, ''), 'alerta operacional'))
        WHEN p_alert_type = 'agent_offline' THEN concat('Agente offline: ', COALESCE(NULLIF(p_title, ''), 'alerta operacional'))
        WHEN p_alert_type = 'security_alert' THEN concat('Alerta de segurança: ', COALESCE(NULLIF(p_title, ''), 'alerta operacional'))
        WHEN p_alert_type = 'software_change' THEN concat('Mudança de software: ', COALESCE(NULLIF(p_title, ''), 'alerta operacional'))
        ELSE concat('Alerta operacional: ', COALESCE(NULLIF(p_title, ''), 'alerta operacional'))
    END;
$$;


CREATE OR REPLACE FUNCTION sync_notification_from_operational_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    alert_record record;
    v_dedupe_key text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE notifications
        SET
            status = 'archived',
            read_at = COALESCE(read_at, now()),
            archived_at = COALESCE(archived_at, now()),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'operational_alert_deleted', true,
                'archived_reason', 'operational_alert_deleted'
            )
        WHERE tenant_id = OLD.tenant_id
          AND source_type = 'operational_alert'
          AND source_id = OLD.id
          AND deleted_at IS NULL
          AND status <> 'archived';

        RETURN OLD;
    END IF;

    alert_record := NEW;
    v_dedupe_key := build_operational_alert_notification_dedupe_key(alert_record.id);

    IF alert_record.status = 'active' THEN
        PERFORM open_notification(
            alert_record.tenant_id,
            NULL,
            'in_app',
            'operational_alert',
            alert_record.severity,
            build_operational_alert_notification_title(
                alert_record.alert_type,
                alert_record.title
            ),
            alert_record.description,
            build_operational_alert_notification_action_url(alert_record.agent_id),
            'operational_alert',
            alert_record.id,
            v_dedupe_key,
            jsonb_build_object(
                'operational_alert_id', alert_record.id,
                'agent_id', alert_record.agent_id,
                'alert_type', alert_record.alert_type,
                'alert_status', alert_record.status,
                'source_type', alert_record.source_type,
                'source_id', alert_record.source_id,
                'dedupe_key', alert_record.dedupe_key,
                'first_seen_at', alert_record.first_seen_at,
                'last_seen_at', alert_record.last_seen_at
            ) || COALESCE(alert_record.metadata, '{}'::jsonb)
        );

        RETURN NEW;
    END IF;

    UPDATE notifications
    SET
        status = 'archived',
        read_at = COALESCE(read_at, now()),
        archived_at = COALESCE(archived_at, now()),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'operational_alert_status', alert_record.status,
            'archived_reason', 'operational_alert_inactive'
        )
    WHERE tenant_id = alert_record.tenant_id
      AND source_type = 'operational_alert'
      AND source_id = alert_record.id
      AND deleted_at IS NULL
      AND status <> 'archived';

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_sync_notification_from_operational_alert
ON operational_alerts;

CREATE TRIGGER trg_sync_notification_from_operational_alert
AFTER INSERT OR UPDATE OF
    status,
    severity,
    title,
    description,
    last_seen_at,
    resolved_at,
    ignored_at
ON operational_alerts
FOR EACH ROW
EXECUTE FUNCTION sync_notification_from_operational_alert();


DROP TRIGGER IF EXISTS trg_archive_notification_from_deleted_operational_alert
ON operational_alerts;

CREATE TRIGGER trg_archive_notification_from_deleted_operational_alert
AFTER DELETE
ON operational_alerts
FOR EACH ROW
EXECUTE FUNCTION sync_notification_from_operational_alert();


CREATE OR REPLACE FUNCTION sync_notifications_from_active_operational_alerts(
    p_tenant_id uuid
)
RETURNS TABLE (
    opened_or_refreshed integer,
    archived integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    alert_record record;
    notification_record record;
    v_opened integer := 0;
    v_archived integer := 0;
BEGIN
    FOR alert_record IN
        SELECT *
        FROM operational_alerts
        WHERE tenant_id = p_tenant_id
          AND status = 'active'
    LOOP
        PERFORM open_notification(
            alert_record.tenant_id,
            NULL,
            'in_app',
            'operational_alert',
            alert_record.severity,
            build_operational_alert_notification_title(
                alert_record.alert_type,
                alert_record.title
            ),
            alert_record.description,
            build_operational_alert_notification_action_url(alert_record.agent_id),
            'operational_alert',
            alert_record.id,
            build_operational_alert_notification_dedupe_key(alert_record.id),
            jsonb_build_object(
                'operational_alert_id', alert_record.id,
                'agent_id', alert_record.agent_id,
                'alert_type', alert_record.alert_type,
                'alert_status', alert_record.status,
                'source_type', alert_record.source_type,
                'source_id', alert_record.source_id,
                'dedupe_key', alert_record.dedupe_key,
                'first_seen_at', alert_record.first_seen_at,
                'last_seen_at', alert_record.last_seen_at
            ) || COALESCE(alert_record.metadata, '{}'::jsonb)
        );

        v_opened := v_opened + 1;
    END LOOP;

    FOR notification_record IN
        SELECT
            notifications.id,
            notifications.tenant_id,
            notifications.source_id
        FROM notifications
        WHERE notifications.tenant_id = p_tenant_id
          AND notifications.notification_type = 'operational_alert'
          AND notifications.source_type = 'operational_alert'
          AND notifications.status <> 'archived'
          AND notifications.deleted_at IS NULL
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM operational_alerts alerts
            WHERE alerts.tenant_id = notification_record.tenant_id
              AND alerts.id = notification_record.source_id
              AND alerts.status = 'active'
        ) THEN
            UPDATE notifications
            SET
                status = 'archived',
                read_at = COALESCE(read_at, now()),
                archived_at = COALESCE(archived_at, now()),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'archived_reason', 'operational_alert_not_active'
                )
            WHERE id = notification_record.id;

            v_archived := v_archived + 1;
        END IF;
    END LOOP;

    opened_or_refreshed := v_opened;
    archived := v_archived;

    RETURN NEXT;
END;
$$;

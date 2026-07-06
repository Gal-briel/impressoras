CREATE OR REPLACE FUNCTION build_security_operational_dedupe_key(
    p_agent_id uuid,
    p_category text,
    p_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT concat(
        'security_alert:',
        p_agent_id::text,
        ':',
        COALESCE(p_category, 'unknown'),
        ':',
        md5(lower(COALESCE(p_title, '')))
    );
$$;


CREATE OR REPLACE FUNCTION sync_operational_alert_from_security_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_dedupe_key text;
    v_severity text;
BEGIN
    v_dedupe_key := build_security_operational_dedupe_key(
        NEW.agent_id,
        NEW.category,
        NEW.title
    );

    v_severity := CASE
        WHEN NEW.severity IN ('critical', 'warning', 'info') THEN NEW.severity
        ELSE 'info'
    END;

    IF NEW.is_active = true THEN
        PERFORM open_operational_alert(
            NEW.tenant_id,
            NEW.agent_id,
            'security_alert',
            v_severity,
            NEW.title,
            NEW.description,
            'agent_security_alert',
            NEW.id,
            v_dedupe_key,
            jsonb_build_object(
                'security_alert_id', NEW.id,
                'snapshot_id', NEW.snapshot_id,
                'command_id', NEW.command_id,
                'category', NEW.category,
                'severity', NEW.severity,
                'collected_at', NEW.collected_at
            ) || COALESCE(NEW.metadata, '{}'::jsonb)
        );

        RETURN NEW;
    END IF;

    PERFORM resolve_operational_alert_by_dedupe(
        NEW.tenant_id,
        v_dedupe_key
    );

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_sync_operational_alert_from_security_alert
ON agent_security_alerts;

CREATE TRIGGER trg_sync_operational_alert_from_security_alert
AFTER INSERT OR UPDATE OF is_active, severity, title, description, category
ON agent_security_alerts
FOR EACH ROW
EXECUTE FUNCTION sync_operational_alert_from_security_alert();


CREATE OR REPLACE FUNCTION sync_operational_alerts_from_active_security_alerts(
    p_tenant_id uuid
)
RETURNS TABLE (
    opened_or_refreshed integer,
    resolved integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    security_record record;
    operational_record record;
    v_opened integer := 0;
    v_resolved integer := 0;
    v_dedupe_key text;
BEGIN
    FOR security_record IN
        SELECT
            id,
            tenant_id,
            agent_id,
            snapshot_id,
            command_id,
            severity,
            title,
            description,
            category,
            metadata,
            is_active,
            collected_at
        FROM agent_security_alerts
        WHERE tenant_id = p_tenant_id
          AND is_active = true
    LOOP
        v_dedupe_key := build_security_operational_dedupe_key(
            security_record.agent_id,
            security_record.category,
            security_record.title
        );

        PERFORM open_operational_alert(
            security_record.tenant_id,
            security_record.agent_id,
            'security_alert',
            CASE
                WHEN security_record.severity IN ('critical', 'warning', 'info') THEN security_record.severity
                ELSE 'info'
            END,
            security_record.title,
            security_record.description,
            'agent_security_alert',
            security_record.id,
            v_dedupe_key,
            jsonb_build_object(
                'security_alert_id', security_record.id,
                'snapshot_id', security_record.snapshot_id,
                'command_id', security_record.command_id,
                'category', security_record.category,
                'severity', security_record.severity,
                'collected_at', security_record.collected_at
            ) || COALESCE(security_record.metadata, '{}'::jsonb)
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
          AND alert_type = 'security_alert'
          AND status = 'active'
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM agent_security_alerts security_alerts
            WHERE security_alerts.tenant_id = operational_record.tenant_id
              AND security_alerts.agent_id = operational_record.agent_id
              AND security_alerts.is_active = true
              AND build_security_operational_dedupe_key(
                    security_alerts.agent_id,
                    security_alerts.category,
                    security_alerts.title
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

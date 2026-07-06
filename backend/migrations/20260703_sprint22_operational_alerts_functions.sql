CREATE OR REPLACE FUNCTION open_operational_alert(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_alert_type text,
    p_severity text,
    p_title text,
    p_description text,
    p_source_type text,
    p_source_id uuid,
    p_dedupe_key text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_alert_id uuid;
BEGIN
    INSERT INTO operational_alerts (
        tenant_id,
        agent_id,
        alert_type,
        severity,
        status,
        title,
        description,
        source_type,
        source_id,
        dedupe_key,
        metadata,
        first_seen_at,
        last_seen_at
    )
    VALUES (
        p_tenant_id,
        p_agent_id,
        p_alert_type,
        p_severity,
        'active',
        p_title,
        p_description,
        p_source_type,
        p_source_id,
        p_dedupe_key,
        COALESCE(p_metadata, '{}'::jsonb),
        now(),
        now()
    )
    ON CONFLICT (tenant_id, dedupe_key)
    WHERE status = 'active'
    DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        metadata = COALESCE(operational_alerts.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        last_seen_at = now()
    RETURNING id INTO v_alert_id;

    RETURN v_alert_id;
END;
$$;


CREATE OR REPLACE FUNCTION resolve_operational_alert_by_dedupe(
    p_tenant_id uuid,
    p_dedupe_key text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE operational_alerts
    SET
        status = 'resolved',
        resolved_at = now(),
        last_seen_at = now()
    WHERE tenant_id = p_tenant_id
      AND dedupe_key = p_dedupe_key
      AND status = 'active';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$;

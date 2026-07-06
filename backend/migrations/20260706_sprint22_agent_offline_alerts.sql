CREATE OR REPLACE FUNCTION sync_operational_alerts_for_offline_agents(
    p_offline_after_minutes integer DEFAULT 15
)
RETURNS TABLE (
    opened_or_refreshed integer,
    resolved integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    agent_record record;
    v_opened integer := 0;
    v_resolved integer := 0;
    v_dedupe_key text;
BEGIN
    FOR agent_record IN
        SELECT
            id,
            tenant_id,
            hostname,
            agent_version,
            last_seen
        FROM agents
        WHERE deleted_at IS NULL
          AND revoked_at IS NULL
    LOOP
        v_dedupe_key := concat('agent_offline:', agent_record.id::text);

        IF agent_record.last_seen IS NULL
           OR agent_record.last_seen < now() - make_interval(mins => p_offline_after_minutes)
        THEN
            PERFORM open_operational_alert(
                agent_record.tenant_id,
                agent_record.id,
                'agent_offline',
                'warning',
                concat('Agente offline: ', COALESCE(agent_record.hostname, agent_record.id::text)),
                concat(
                    'O agente ',
                    COALESCE(agent_record.hostname, agent_record.id::text),
                    ' está sem comunicação há mais de ',
                    p_offline_after_minutes,
                    ' minuto(s). Último check-in: ',
                    COALESCE(agent_record.last_seen::text, 'nunca')
                ),
                'agent',
                agent_record.id,
                v_dedupe_key,
                jsonb_build_object(
                    'hostname', agent_record.hostname,
                    'agent_version', agent_record.agent_version,
                    'last_seen', agent_record.last_seen,
                    'offline_after_minutes', p_offline_after_minutes
                )
            );

            v_opened := v_opened + 1;
        ELSE
            v_resolved := v_resolved + resolve_operational_alert_by_dedupe(
                agent_record.tenant_id,
                v_dedupe_key
            );
        END IF;
    END LOOP;

    opened_or_refreshed := v_opened;
    resolved := v_resolved;

    RETURN NEXT;
END;
$$;

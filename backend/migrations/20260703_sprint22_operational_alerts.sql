BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operational_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id uuid NOT NULL,
    agent_id uuid NULL,

    alert_type text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),

    title text NOT NULL,
    description text NULL,

    source_type text NULL,
    source_id uuid NULL,

    dedupe_key text NOT NULL,
    metadata jsonb NULL,

    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),

    resolved_at timestamptz NULL,
    ignored_at timestamptz NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_operational_alerts_active_dedupe
ON operational_alerts(tenant_id, dedupe_key)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_operational_alerts_tenant_status
ON operational_alerts(tenant_id, status);

CREATE INDEX IF NOT EXISTS ix_operational_alerts_tenant_agent
ON operational_alerts(tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS ix_operational_alerts_type
ON operational_alerts(alert_type);

CREATE INDEX IF NOT EXISTS ix_operational_alerts_severity
ON operational_alerts(severity);

CREATE INDEX IF NOT EXISTS ix_operational_alerts_last_seen
ON operational_alerts(last_seen_at DESC);

CREATE OR REPLACE FUNCTION set_operational_alerts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_operational_alerts_updated_at
ON operational_alerts;

CREATE TRIGGER trg_set_operational_alerts_updated_at
BEFORE UPDATE ON operational_alerts
FOR EACH ROW
EXECUTE FUNCTION set_operational_alerts_updated_at();

COMMIT;

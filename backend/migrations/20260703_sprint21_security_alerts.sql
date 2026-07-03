BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_security_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    command_id uuid NULL,
    severity text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    metadata jsonb NULL,
    is_active boolean NOT NULL DEFAULT true,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_tenant_agent
ON agent_security_alerts(tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_snapshot_id
ON agent_security_alerts(snapshot_id);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_severity
ON agent_security_alerts(severity);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_category
ON agent_security_alerts(category);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_active
ON agent_security_alerts(is_active);

CREATE INDEX IF NOT EXISTS ix_agent_security_alerts_collected_at
ON agent_security_alerts(collected_at DESC);

COMMIT;

CREATE OR REPLACE FUNCTION deactivate_previous_security_alerts_for_agent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE agent_security_alerts
    SET is_active = false
    WHERE tenant_id = NEW.tenant_id
      AND agent_id = NEW.agent_id
      AND snapshot_id <> NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_previous_security_alerts_for_agent ON agent_security_snapshots;

CREATE TRIGGER trg_deactivate_previous_security_alerts_for_agent
AFTER INSERT
ON agent_security_snapshots
FOR EACH ROW
EXECUTE FUNCTION deactivate_previous_security_alerts_for_agent();

UPDATE agent_security_alerts
SET is_active = false;

WITH latest_snapshots AS (
    SELECT DISTINCT ON (tenant_id, agent_id)
        id,
        tenant_id,
        agent_id
    FROM agent_security_snapshots
    ORDER BY tenant_id, agent_id, collected_at DESC, created_at DESC
)
UPDATE agent_security_alerts alerts
SET is_active = true
FROM latest_snapshots latest
WHERE alerts.snapshot_id = latest.id
  AND alerts.tenant_id = latest.tenant_id
  AND alerts.agent_id = latest.agent_id;

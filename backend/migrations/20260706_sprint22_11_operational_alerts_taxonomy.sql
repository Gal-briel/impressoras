ALTER TABLE operational_alerts
DROP CONSTRAINT IF EXISTS chk_operational_alerts_status;

ALTER TABLE operational_alerts
ADD CONSTRAINT chk_operational_alerts_status
CHECK (status IN ('active', 'resolved', 'ignored'))
NOT VALID;


ALTER TABLE operational_alerts
DROP CONSTRAINT IF EXISTS chk_operational_alerts_severity;

ALTER TABLE operational_alerts
ADD CONSTRAINT chk_operational_alerts_severity
CHECK (severity IN ('critical', 'warning', 'info'))
NOT VALID;


ALTER TABLE operational_alerts
DROP CONSTRAINT IF EXISTS chk_operational_alerts_alert_type;

ALTER TABLE operational_alerts
ADD CONSTRAINT chk_operational_alerts_alert_type
CHECK (
    alert_type IN (
        'command_failed',
        'agent_offline',
        'security_alert',
        'software_change'
    )
)
NOT VALID;


ALTER TABLE operational_alerts
VALIDATE CONSTRAINT chk_operational_alerts_status;

ALTER TABLE operational_alerts
VALIDATE CONSTRAINT chk_operational_alerts_severity;


CREATE OR REPLACE VIEW operational_alerts_invalid_taxonomy AS
SELECT
    id,
    tenant_id,
    agent_id,
    alert_type,
    severity,
    status,
    title,
    source_type,
    dedupe_key,
    created_at,
    updated_at,
    alert_type NOT IN (
        'command_failed',
        'agent_offline',
        'security_alert',
        'software_change'
    ) AS invalid_alert_type,
    severity NOT IN (
        'critical',
        'warning',
        'info'
    ) AS invalid_severity,
    status NOT IN (
        'active',
        'resolved',
        'ignored'
    ) AS invalid_status
FROM operational_alerts
WHERE alert_type NOT IN (
        'command_failed',
        'agent_offline',
        'security_alert',
        'software_change'
    )
   OR severity NOT IN (
        'critical',
        'warning',
        'info'
    )
   OR status NOT IN (
        'active',
        'resolved',
        'ignored'
    );


COMMENT ON CONSTRAINT chk_operational_alerts_status
ON operational_alerts
IS 'Sprint 22.11: garante status operacional padronizado.';

COMMENT ON CONSTRAINT chk_operational_alerts_severity
ON operational_alerts
IS 'Sprint 22.11: garante severidade operacional padronizada.';

COMMENT ON CONSTRAINT chk_operational_alerts_alert_type
ON operational_alerts
IS 'Sprint 22.11: impede novos tipos fora da central operacional oficial.';

COMMENT ON VIEW operational_alerts_invalid_taxonomy
IS 'Sprint 22.11: lista alertas operacionais antigos ou inconsistentes fora da taxonomia oficial.';

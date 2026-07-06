DELETE FROM operational_alerts
WHERE alert_type = 'manual_test'
  AND title IN (
    'Teste visual Sprint 22.4',
    'Teste API resolve',
    'Teste API ignore'
  );

DELETE FROM operational_alerts
WHERE alert_type = 'test_alert'
  AND title = 'Teste de alerta operacional';

ALTER TABLE operational_alerts
VALIDATE CONSTRAINT chk_operational_alerts_alert_type;

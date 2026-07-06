CREATE OR REPLACE FUNCTION sync_operational_alert_from_command()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
    v_command_type text;
    v_dedupe_key text;
    v_title text;
    v_description text;
    v_error_details text;
BEGIN
    v_status := lower(COALESCE(NEW.status::text, ''));
    v_command_type := COALESCE(NEW.command_type::text, 'unknown');

    v_error_details := NULLIF(
        trim(
            concat_ws(
                ' ',
                NULLIF(COALESCE(NEW.error_code::text, ''), ''),
                NULLIF(COALESCE(NEW.output::text, ''), '')
            )
        ),
        ''
    );

    v_dedupe_key := concat(
        'command_failed:',
        NEW.agent_id::text,
        ':',
        v_command_type
    );

    IF v_status IN ('failed', 'failure', 'error', 'timeout', 'cancelled', 'canceled') THEN
        v_title := concat('Falha no comando: ', v_command_type);

        v_description := concat(
            'O agente registrou falha ao executar o comando ',
            v_command_type,
            '.',
            CASE
                WHEN v_error_details IS NOT NULL
                    THEN concat(' Detalhes: ', left(v_error_details, 500))
                ELSE ''
            END
        );

        PERFORM open_operational_alert(
            NEW.tenant_id,
            NEW.agent_id,
            'command_failed',
            'warning',
            v_title,
            v_description,
            'command',
            NEW.id,
            v_dedupe_key,
            jsonb_build_object(
                'command_id', NEW.id,
                'command_type', v_command_type,
                'status', NEW.status,
                'error_code', NEW.error_code,
                'output', left(COALESCE(NEW.output::text, ''), 1000),
                'created_at', NEW.created_at,
                'started_at', NEW.started_at,
                'finished_at', NEW.finished_at
            )
        );

        RETURN NEW;
    END IF;

    IF v_status IN ('completed', 'success', 'succeeded', 'done') THEN
        PERFORM resolve_operational_alert_by_dedupe(
            NEW.tenant_id,
            v_dedupe_key
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_sync_operational_alert_from_command
ON commands;

CREATE TRIGGER trg_sync_operational_alert_from_command
AFTER INSERT OR UPDATE OF status
ON commands
FOR EACH ROW
EXECUTE FUNCTION sync_operational_alert_from_command();

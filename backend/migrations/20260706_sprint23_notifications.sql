CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,

    channel text NOT NULL DEFAULT 'in_app',
    notification_type text NOT NULL,
    severity text NOT NULL DEFAULT 'info',
    status text NOT NULL DEFAULT 'unread',

    title text NOT NULL,
    message text,
    action_url text,

    source_type text,
    source_id uuid,
    dedupe_key text NOT NULL,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,

    CONSTRAINT chk_notifications_channel
        CHECK (channel IN ('in_app')),

    CONSTRAINT chk_notifications_type
        CHECK (
            notification_type IN (
                'operational_alert',
                'system'
            )
        ),

    CONSTRAINT chk_notifications_severity
        CHECK (
            severity IN (
                'critical',
                'warning',
                'info',
                'success'
            )
        ),

    CONSTRAINT chk_notifications_status
        CHECK (
            status IN (
                'unread',
                'read',
                'archived'
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_active_dedupe
ON notifications (
    tenant_id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_key
)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notifications_tenant_status_created
ON notifications(tenant_id, status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notifications_user_status_created
ON notifications(user_id, status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notifications_source
ON notifications(source_type, source_id)
WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_notifications_updated_at
ON notifications;

CREATE TRIGGER trg_set_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION set_notifications_updated_at();


CREATE OR REPLACE FUNCTION open_notification(
    p_tenant_id uuid,
    p_user_id uuid,
    p_channel text,
    p_notification_type text,
    p_severity text,
    p_title text,
    p_message text,
    p_action_url text,
    p_source_type text,
    p_source_id uuid,
    p_dedupe_key text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_notification_id uuid;
BEGIN
    INSERT INTO notifications (
        tenant_id,
        user_id,
        channel,
        notification_type,
        severity,
        status,
        title,
        message,
        action_url,
        source_type,
        source_id,
        dedupe_key,
        metadata,
        created_at,
        updated_at
    )
    VALUES (
        p_tenant_id,
        p_user_id,
        COALESCE(p_channel, 'in_app'),
        p_notification_type,
        p_severity,
        'unread',
        p_title,
        p_message,
        p_action_url,
        p_source_type,
        p_source_id,
        p_dedupe_key,
        COALESCE(p_metadata, '{}'::jsonb),
        now(),
        now()
    )
    ON CONFLICT (
        tenant_id,
        COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        dedupe_key
    )
    WHERE deleted_at IS NULL
    DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        action_url = EXCLUDED.action_url,
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        metadata = COALESCE(notifications.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        updated_at = now()
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;


CREATE OR REPLACE FUNCTION mark_notification_read(
    p_tenant_id uuid,
    p_notification_id uuid
)
RETURNS notifications
LANGUAGE plpgsql
AS $$
DECLARE
    v_notification notifications;
BEGIN
    UPDATE notifications
    SET
        status = 'read',
        read_at = COALESCE(read_at, now())
    WHERE tenant_id = p_tenant_id
      AND id = p_notification_id
      AND deleted_at IS NULL
    RETURNING * INTO v_notification;

    RETURN v_notification;
END;
$$;


CREATE OR REPLACE FUNCTION archive_notification(
    p_tenant_id uuid,
    p_notification_id uuid
)
RETURNS notifications
LANGUAGE plpgsql
AS $$
DECLARE
    v_notification notifications;
BEGIN
    UPDATE notifications
    SET
        status = 'archived',
        read_at = COALESCE(read_at, now()),
        archived_at = COALESCE(archived_at, now())
    WHERE tenant_id = p_tenant_id
      AND id = p_notification_id
      AND deleted_at IS NULL
    RETURNING * INTO v_notification;

    RETURN v_notification;
END;
$$;


CREATE OR REPLACE VIEW notifications_unread_summary AS
SELECT
    tenant_id,
    user_id,
    count(*) AS unread_total,
    count(*) FILTER (WHERE severity = 'critical') AS unread_critical,
    count(*) FILTER (WHERE severity = 'warning') AS unread_warning,
    count(*) FILTER (WHERE severity = 'info') AS unread_info,
    max(created_at) AS last_notification_at
FROM notifications
WHERE status = 'unread'
  AND deleted_at IS NULL
GROUP BY tenant_id, user_id;

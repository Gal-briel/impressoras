CREATE OR REPLACE FUNCTION persist_software_inventory_changes_for_snapshot(p_snapshot_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    current_snapshot agent_software_inventory_snapshots%ROWTYPE;
    previous_snapshot agent_software_inventory_snapshots%ROWTYPE;
    v_tenant_id uuid;
    v_agent_id uuid;
    v_snapshot_id uuid;
    v_previous_snapshot_id uuid;
    v_command_id uuid;
    v_collected_at timestamptz;
BEGIN
    SELECT *
    INTO current_snapshot
    FROM agent_software_inventory_snapshots
    WHERE id = p_snapshot_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT *
    INTO previous_snapshot
    FROM agent_software_inventory_snapshots
    WHERE tenant_id = current_snapshot.tenant_id
      AND agent_id = current_snapshot.agent_id
      AND id <> current_snapshot.id
      AND collected_at <= current_snapshot.collected_at
    ORDER BY collected_at DESC, created_at DESC
    LIMIT 1;

    DELETE FROM agent_software_inventory_changes
    WHERE snapshot_id = current_snapshot.id;

    UPDATE agent_software_inventory_changes
    SET is_active = false
    WHERE tenant_id = current_snapshot.tenant_id
      AND agent_id = current_snapshot.agent_id;

    IF previous_snapshot.id IS NULL THEN
        RETURN;
    END IF;

    v_tenant_id := current_snapshot.tenant_id;
    v_agent_id := current_snapshot.agent_id;
    v_snapshot_id := current_snapshot.id;
    v_previous_snapshot_id := previous_snapshot.id;
    v_command_id := current_snapshot.command_id;
    v_collected_at := current_snapshot.collected_at;

    WITH latest AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_snapshot_id
    ),
    previous AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_previous_snapshot_id
    )
    INSERT INTO agent_software_inventory_changes (
        tenant_id,
        agent_id,
        snapshot_id,
        previous_snapshot_id,
        command_id,
        change_type,
        identity_key,
        item_key,
        name,
        publisher,
        source,
        previous_version,
        latest_version,
        previous_install_date,
        latest_install_date,
        previous_install_location,
        latest_install_location,
        metadata,
        is_active,
        collected_at
    )
    SELECT
        v_tenant_id,
        v_agent_id,
        v_snapshot_id,
        v_previous_snapshot_id,
        v_command_id,
        'added',
        l.identity_key,
        l.item_key,
        l.name,
        l.publisher,
        l.source,
        NULL,
        l.version,
        NULL,
        l.install_date,
        NULL,
        l.install_location,
        jsonb_build_object('latest_item_key', l.item_key),
        true,
        v_collected_at
    FROM latest l
    LEFT JOIN previous p
        ON p.identity_key = l.identity_key
    WHERE p.id IS NULL;

    WITH latest AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_snapshot_id
    ),
    previous AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_previous_snapshot_id
    )
    INSERT INTO agent_software_inventory_changes (
        tenant_id,
        agent_id,
        snapshot_id,
        previous_snapshot_id,
        command_id,
        change_type,
        identity_key,
        item_key,
        name,
        publisher,
        source,
        previous_version,
        latest_version,
        previous_install_date,
        latest_install_date,
        previous_install_location,
        latest_install_location,
        metadata,
        is_active,
        collected_at
    )
    SELECT
        v_tenant_id,
        v_agent_id,
        v_snapshot_id,
        v_previous_snapshot_id,
        v_command_id,
        'removed',
        p.identity_key,
        p.item_key,
        p.name,
        p.publisher,
        p.source,
        p.version,
        NULL,
        p.install_date,
        NULL,
        p.install_location,
        NULL,
        jsonb_build_object('previous_item_key', p.item_key),
        true,
        v_collected_at
    FROM previous p
    LEFT JOIN latest l
        ON l.identity_key = p.identity_key
    WHERE l.id IS NULL;

    WITH latest AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_snapshot_id
    ),
    previous AS (
        SELECT
            *,
            md5(lower(concat_ws(
                '|',
                COALESCE(name, ''),
                COALESCE(publisher, ''),
                COALESCE(source, 'unknown'),
                COALESCE(user_sid, '')
            ))) AS identity_key
        FROM agent_software_inventory_snapshot_items
        WHERE snapshot_id = v_previous_snapshot_id
    )
    INSERT INTO agent_software_inventory_changes (
        tenant_id,
        agent_id,
        snapshot_id,
        previous_snapshot_id,
        command_id,
        change_type,
        identity_key,
        item_key,
        name,
        publisher,
        source,
        previous_version,
        latest_version,
        previous_install_date,
        latest_install_date,
        previous_install_location,
        latest_install_location,
        metadata,
        is_active,
        collected_at
    )
    SELECT
        v_tenant_id,
        v_agent_id,
        v_snapshot_id,
        v_previous_snapshot_id,
        v_command_id,
        'changed',
        l.identity_key,
        l.item_key,
        l.name,
        l.publisher,
        l.source,
        p.version,
        l.version,
        p.install_date,
        l.install_date,
        p.install_location,
        l.install_location,
        jsonb_build_object(
            'previous_item_key', p.item_key,
            'latest_item_key', l.item_key
        ),
        true,
        v_collected_at
    FROM latest l
    INNER JOIN previous p
        ON p.identity_key = l.identity_key
    WHERE
        COALESCE(l.version, '') <> COALESCE(p.version, '')
        OR COALESCE(l.install_date, '') <> COALESCE(p.install_date, '')
        OR COALESCE(l.install_location, '') <> COALESCE(p.install_location, '');

END;
$$;


CREATE OR REPLACE FUNCTION persist_software_inventory_changes_from_snapshot_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    snapshot_id_value uuid;
BEGIN
    FOR snapshot_id_value IN
        SELECT DISTINCT snapshot_id
        FROM new_snapshot_items
    LOOP
        PERFORM persist_software_inventory_changes_for_snapshot(snapshot_id_value);
    END LOOP;

    RETURN NULL;
END;
$$;


DROP TRIGGER IF EXISTS trg_persist_software_inventory_changes_from_items
ON agent_software_inventory_snapshot_items;

CREATE TRIGGER trg_persist_software_inventory_changes_from_items
AFTER INSERT
ON agent_software_inventory_snapshot_items
REFERENCING NEW TABLE AS new_snapshot_items
FOR EACH STATEMENT
EXECUTE FUNCTION persist_software_inventory_changes_from_snapshot_items();

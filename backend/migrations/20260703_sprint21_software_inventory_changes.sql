BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_software_inventory_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    snapshot_id uuid NOT NULL REFERENCES agent_software_inventory_snapshots(id) ON DELETE CASCADE,
    previous_snapshot_id uuid NULL REFERENCES agent_software_inventory_snapshots(id) ON DELETE SET NULL,
    command_id uuid NULL,
    change_type text NOT NULL CHECK (change_type IN ('added', 'removed', 'changed')),
    identity_key text NOT NULL,
    item_key text NULL,
    name text NOT NULL,
    publisher text NULL,
    source text NULL,
    previous_version text NULL,
    latest_version text NULL,
    previous_install_date text NULL,
    latest_install_date text NULL,
    previous_install_location text NULL,
    latest_install_location text NULL,
    metadata jsonb NULL,
    is_active boolean NOT NULL DEFAULT true,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_tenant_agent
ON agent_software_inventory_changes(tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_snapshot_id
ON agent_software_inventory_changes(snapshot_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_previous_snapshot_id
ON agent_software_inventory_changes(previous_snapshot_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_change_type
ON agent_software_inventory_changes(change_type);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_source
ON agent_software_inventory_changes(source);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_active
ON agent_software_inventory_changes(is_active);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_changes_collected_at
ON agent_software_inventory_changes(collected_at DESC);

COMMIT;

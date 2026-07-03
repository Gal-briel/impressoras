BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_software_inventory_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid NULL,
    total_items integer NOT NULL DEFAULT 0,
    sources jsonb NULL,
    raw_counts jsonb NULL,
    collection_mode jsonb NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshots_tenant_agent
ON agent_software_inventory_snapshots(tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshots_collected_at
ON agent_software_inventory_snapshots(collected_at DESC);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshots_command_id
ON agent_software_inventory_snapshots(command_id);

CREATE TABLE IF NOT EXISTS agent_software_inventory_snapshot_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id uuid NOT NULL REFERENCES agent_software_inventory_snapshots(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid NULL,
    name text NOT NULL,
    version text NULL,
    publisher text NULL,
    install_date text NULL,
    estimated_size_mb numeric NULL,
    install_location text NULL,
    uninstall_string text NULL,
    registry_key text NULL,
    source text NULL,
    user_sid text NULL,
    item_key text NOT NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshot_items_snapshot_id
ON agent_software_inventory_snapshot_items(snapshot_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshot_items_tenant_agent
ON agent_software_inventory_snapshot_items(tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshot_items_item_key
ON agent_software_inventory_snapshot_items(item_key);

CREATE INDEX IF NOT EXISTS ix_agent_software_inventory_snapshot_items_source
ON agent_software_inventory_snapshot_items(source);

COMMIT;

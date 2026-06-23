"""agent management extensions

Revision ID: 20260623_agent_mgmt_ext
Revises: 1a2b3c4d5e6f
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260623_agent_mgmt_ext"
down_revision = "1a2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS revoked_by UUID;")
    op.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS revoke_reason TEXT;")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agents_revoked_by_users') THEN
                ALTER TABLE agents
                ADD CONSTRAINT fk_agents_revoked_by_users
                FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_tenant_revoked ON agents (tenant_id, revoked_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_revoked_by ON agents (revoked_by);")

    op.create_table(
        "agent_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "normalized_name", name="uq_agent_tag_tenant_normalized_name"),
    )
    op.create_index("idx_agent_tag_tenant_name", "agent_tags", ["tenant_id", "name"])
    op.create_index("idx_agent_tag_tenant_normalized", "agent_tags", ["tenant_id", "normalized_name"])

    op.create_table(
        "agent_tag_assignments",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["agent_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("agent_id", "tag_id"),
    )
    op.create_index("idx_agent_tag_assignment_tenant_agent", "agent_tag_assignments", ["tenant_id", "agent_id"])
    op.create_index("idx_agent_tag_assignment_tenant_tag", "agent_tag_assignments", ["tenant_id", "tag_id"])

    op.create_table(
        "agent_releases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("platform", sa.String(length=50), nullable=False, server_default="windows"),
        sa.Column("channel", sa.String(length=50), nullable=False, server_default="stable"),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("package_url", sa.Text(), nullable=False),
        sa.Column("package_sha256", sa.String(length=128), nullable=False),
        sa.Column("signature_thumbprint", sa.String(length=128), nullable=False),
        sa.Column("rollback_package_url", sa.Text(), nullable=True),
        sa.Column("rollback_package_sha256", sa.String(length=128), nullable=True),
        sa.Column("min_supported_version", sa.String(length=50), nullable=True),
        sa.Column("rollout_percentage", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("mandatory", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_agent_release_lookup", "agent_releases", ["tenant_id", "platform", "channel", "is_active"])
    op.create_index("idx_agent_release_version", "agent_releases", ["platform", "channel", "version"])

    for table in ["agent_tags", "agent_tag_assignments"]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation_policy ON {table}
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
            """
        )


def downgrade():
    for table in ["agent_tag_assignments", "agent_tags"]:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    op.drop_index("idx_agent_release_version", table_name="agent_releases")
    op.drop_index("idx_agent_release_lookup", table_name="agent_releases")
    op.drop_table("agent_releases")

    op.drop_index("idx_agent_tag_assignment_tenant_tag", table_name="agent_tag_assignments")
    op.drop_index("idx_agent_tag_assignment_tenant_agent", table_name="agent_tag_assignments")
    op.drop_table("agent_tag_assignments")

    op.drop_index("idx_agent_tag_tenant_normalized", table_name="agent_tags")
    op.drop_index("idx_agent_tag_tenant_name", table_name="agent_tags")
    op.drop_table("agent_tags")

    op.execute("DROP INDEX IF EXISTS idx_agent_revoked_by;")
    op.execute("DROP INDEX IF EXISTS idx_agent_tenant_revoked;")
    op.execute("ALTER TABLE agents DROP CONSTRAINT IF EXISTS fk_agents_revoked_by_users;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS revoke_reason;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS revoked_by;")

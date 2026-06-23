# backend/alembic/versions/2026_06_22_initial_rls_policies.py
"""initial and rls policies

Revision ID: 1a2b3c4d5e6f
Revises: 
Create Date: 2026-06-22 10:55:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '1a2b3c4d5e6f'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Alembic auto-generated schema creation goes here (omitted for brevity)
    # op.create_table(...)

    # Enable Row Level Security (RLS) on tenant-aware tables
    tables = [
        "roles", "users", "agent_groups", "agents", "printers", 
        "commands", "command_results", "audit_logs", "agent_events"
    ]
    
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        # Example policy: Ensure current_setting('app.current_tenant_id') matches tenant_id
        op.execute(f"""
            CREATE POLICY tenant_isolation_policy ON {table}
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
        """)

def downgrade():
    tables = [
        "roles", "users", "agent_groups", "agents", "printers", 
        "commands", "command_results", "audit_logs", "agent_events"
    ]
    
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    
    # op.drop_table(...)
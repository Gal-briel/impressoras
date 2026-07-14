CREATE TABLE IF NOT EXISTS agent_enrollment_tokens (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash varchar(255) NOT NULL UNIQUE,
    name varchar(120) NULL,
    expires_at timestamptz NOT NULL,
    max_uses integer NOT NULL DEFAULT 1,
    used_count integer NOT NULL DEFAULT 0,
    revoked_at timestamptz NULL,
    created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_agent_enrollment_tokens_max_uses_positive CHECK (max_uses > 0),
    CONSTRAINT ck_agent_enrollment_tokens_used_count_non_negative CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_enrollment_tokens_tenant
ON agent_enrollment_tokens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_agent_enrollment_tokens_hash
ON agent_enrollment_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_agent_enrollment_tokens_expiry
ON agent_enrollment_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_agent_enrollment_tokens_active
ON agent_enrollment_tokens(tenant_id, revoked_at, expires_at);

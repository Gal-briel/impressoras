ALTER TABLE agents
ADD COLUMN IF NOT EXISTS domain_name varchar(255);

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS grouping_source varchar(50) NOT NULL DEFAULT 'unknown';

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS grouping_status varchar(50) NOT NULL DEFAULT 'unassigned';

CREATE INDEX IF NOT EXISTS idx_agents_tenant_domain
ON agents (tenant_id, domain_name);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_grouping_status
ON agents (tenant_id, grouping_status);

CREATE OR REPLACE FUNCTION normalize_agent_domain_from_hostname(p_hostname text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_hostname text;
    v_domain text;
BEGIN
    v_hostname := lower(trim(coalesce(p_hostname, '')));
    v_hostname := regexp_replace(v_hostname, '\.$', '');

    IF v_hostname = '' THEN
        RETURN NULL;
    END IF;

    -- Não tenta extrair domínio de IPv4.
    IF v_hostname ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
        RETURN NULL;
    END IF;

    -- Hostname simples, sem domínio.
    IF position('.' in v_hostname) = 0 THEN
        RETURN NULL;
    END IF;

    -- FQDN: remove o primeiro label.
    v_domain := substring(v_hostname from position('.' in v_hostname) + 1);
    v_domain := nullif(trim(v_domain), '');

    RETURN v_domain;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_agent_group(
    p_tenant_id uuid,
    p_name text,
    p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_name text;
    v_group_id uuid;
BEGIN
    v_name := left(nullif(trim(coalesce(p_name, '')), ''), 100);

    IF v_name IS NULL THEN
        v_name := 'Sem domínio';
    END IF;

    SELECT id
    INTO v_group_id
    FROM agent_groups
    WHERE tenant_id = p_tenant_id
      AND lower(name) = lower(v_name)
    LIMIT 1;

    IF v_group_id IS NOT NULL THEN
        UPDATE agent_groups
        SET
            deleted_at = NULL,
            description = coalesce(p_description, description),
            updated_at = now()
        WHERE id = v_group_id;

        RETURN v_group_id;
    END IF;

    INSERT INTO agent_groups (
        id,
        tenant_id,
        name,
        description,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        p_tenant_id,
        v_name,
        p_description,
        now(),
        now()
    )
    RETURNING id INTO v_group_id;

    RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_agent_grouping(p_agent_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_agent agents%ROWTYPE;
    v_domain text;
    v_group_name text;
    v_group_description text;
    v_group_id uuid;
    v_grouping_source text;
    v_grouping_status text;
BEGIN
    SELECT *
    INTO v_agent
    FROM agents
    WHERE id = p_agent_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_domain := normalize_agent_domain_from_hostname(v_agent.hostname);

    IF v_domain IS NOT NULL THEN
        v_group_name := left(v_domain, 100);
        v_group_description := 'Grupo criado automaticamente pelo domínio do agente.';
        v_grouping_source := 'domain';
        v_grouping_status := 'auto';
    ELSE
        -- Se já foi classificado manualmente, preserva o grupo escolhido.
        IF v_agent.group_id IS NOT NULL AND v_agent.grouping_source = 'manual' THEN
            UPDATE agents
            SET
                domain_name = NULL,
                grouping_status = 'manual',
                updated_at = now()
            WHERE id = v_agent.id;

            RETURN v_agent.group_id;
        END IF;

        v_group_name := 'Sem domínio';
        v_group_description := 'Agentes sem domínio detectado. Revisar e mover para uma empresa/grupo correto.';
        v_grouping_source := 'fallback';
        v_grouping_status := 'requires_review';
    END IF;

    v_group_id := ensure_agent_group(
        v_agent.tenant_id,
        v_group_name,
        v_group_description
    );

    UPDATE agents
    SET
        domain_name = v_domain,
        group_id = v_group_id,
        grouping_source = v_grouping_source,
        grouping_status = v_grouping_status,
        updated_at = now()
    WHERE id = v_agent.id;

    RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_agent_grouping()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM sync_agent_grouping(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agent_grouping ON agents;

CREATE TRIGGER trg_sync_agent_grouping
AFTER INSERT OR UPDATE OF hostname, tenant_id
ON agents
FOR EACH ROW
EXECUTE FUNCTION trg_sync_agent_grouping();

DO $$
DECLARE
    v_agent record;
BEGIN
    FOR v_agent IN
        SELECT id
        FROM agents
        WHERE deleted_at IS NULL
    LOOP
        PERFORM sync_agent_grouping(v_agent.id);
    END LOOP;
END;
$$;

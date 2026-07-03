--
-- PostgreSQL database dump
--

\restrict nKNBRk4aWQCnF7Qn6qjhqcDctqyZFbt3FmK3cuVEiHhiGtN72DZJNLNwWigZjNl

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: saas
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO saas;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: saas
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: persist_agent_inventory_from_command(); Type: FUNCTION; Schema: public; Owner: saas
--

CREATE FUNCTION public.persist_agent_inventory_from_command() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    data jsonb;
    critical_count integer := 0;
    warning_count integer := 0;
    info_count integer := 0;
    calculated_score integer := 100;
    firewall_disabled_count integer := 0;
    bitlocker_unprotected_count integer := 0;
    admin_enabled_count integer := 0;
BEGIN
    IF NEW.status <> 'success' THEN
        RETURN NEW;
    END IF;

    IF NEW.output IS NULL OR btrim(NEW.output) = '' THEN
        RETURN NEW;
    END IF;

    IF NEW.command_type NOT IN ('collect_software_inventory', 'collect_security_inventory') THEN
        RETURN NEW;
    END IF;

    BEGIN
        data := NEW.output::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    IF NEW.command_type = 'collect_software_inventory' THEN
        DELETE FROM agent_software_inventory
        WHERE agent_id = NEW.agent_id;

        INSERT INTO agent_software_inventory (
            id,
            tenant_id,
            agent_id,
            command_id,
            name,
            version,
            publisher,
            install_date,
            estimated_size_mb,
            install_location,
            uninstall_string,
            registry_key,
            source,
            user_sid,
            collected_at,
            created_at
        )
        SELECT
            gen_random_uuid(),
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            item ->> 'name',
            item ->> 'version',
            item ->> 'publisher',
            item ->> 'install_date',
            CASE
                WHEN item ->> 'estimated_size_mb' ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (item ->> 'estimated_size_mb')::numeric
                ELSE NULL
            END,
            item ->> 'install_location',
            item ->> 'uninstall_string',
            item ->> 'registry_key',
            COALESCE(item ->> 'source', 'unknown'),
            item ->> 'user_sid',
            COALESCE(NEW.finished_at, now()),
            now()
        FROM jsonb_array_elements(COALESCE(data -> 'items', '[]'::jsonb)) AS item
        WHERE COALESCE(item ->> 'name', '') <> '';

        RETURN NEW;
    END IF;

    IF NEW.command_type = 'collect_security_inventory' THEN
        DELETE FROM agent_security_snapshots
        WHERE command_id = NEW.id;

        IF COALESCE((data -> 'defender' ->> 'available')::boolean, false) = false THEN
            critical_count := critical_count + 1;
        END IF;

        IF COALESCE((data -> 'defender' ->> 'antivirus_enabled')::boolean, true) = false THEN
            critical_count := critical_count + 1;
        END IF;

        IF COALESCE((data -> 'defender' ->> 'real_time_protection_enabled')::boolean, true) = false THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'antivirus', '[]'::jsonb)) = 0 THEN
            critical_count := critical_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO firewall_disabled_count
        FROM jsonb_array_elements(COALESCE(data -> 'firewall', '[]'::jsonb)) AS firewall_item
        WHERE lower(COALESCE(firewall_item ->> 'enabled', 'false')) NOT IN ('true', '1', 'enabled');

        IF firewall_disabled_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO bitlocker_unprotected_count
        FROM jsonb_array_elements(COALESCE(data -> 'bitlocker', '[]'::jsonb)) AS bitlocker_item
        WHERE upper(COALESCE(bitlocker_item ->> 'mount_point', '')) LIKE 'C:%'
          AND lower(COALESCE(bitlocker_item ->> 'protection_status', 'off')) IN ('off', 'false', '0', 'disabled');

        IF bitlocker_unprotected_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        SELECT COUNT(*)
        INTO admin_enabled_count
        FROM jsonb_array_elements(COALESCE(data -> 'local_users', '[]'::jsonb)) AS user_item
        WHERE lower(COALESCE(user_item ->> 'name', '')) IN ('administrador', 'administrator')
          AND lower(COALESCE(user_item ->> 'enabled', 'false')) IN ('true', '1', 'enabled');

        IF admin_enabled_count > 0 THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'hotfixes', '[]'::jsonb)) = 0 THEN
            warning_count := warning_count + 1;
        END IF;

        IF jsonb_array_length(COALESCE(data -> 'local_administrators', '[]'::jsonb)) > 0 THEN
            info_count := info_count + 1;
        END IF;

        calculated_score := GREATEST(0, 100 - (critical_count * 30) - (warning_count * 15));

        INSERT INTO agent_security_snapshots (
            id,
            tenant_id,
            agent_id,
            command_id,
            defender,
            antivirus,
            bitlocker,
            firewall,
            hotfixes,
            update_services,
            local_users,
            local_groups,
            local_administrators,
            usb_devices,
            monitors,
            recent_software,
            security_score,
            critical_alerts,
            warning_alerts,
            info_alerts,
            collected_at,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            NEW.tenant_id,
            NEW.agent_id,
            NEW.id,
            COALESCE(data -> 'defender', '{}'::jsonb),
            COALESCE(data -> 'antivirus', '[]'::jsonb),
            COALESCE(data -> 'bitlocker', '[]'::jsonb),
            COALESCE(data -> 'firewall', '[]'::jsonb),
            COALESCE(data -> 'hotfixes', '[]'::jsonb),
            COALESCE(data -> 'update_services', '[]'::jsonb),
            COALESCE(data -> 'local_users', '[]'::jsonb),
            COALESCE(data -> 'local_groups', '[]'::jsonb),
            COALESCE(data -> 'local_administrators', '[]'::jsonb),
            COALESCE(data -> 'usb_devices', '[]'::jsonb),
            COALESCE(data -> 'monitors', '[]'::jsonb),
            COALESCE(data -> 'recent_software', '[]'::jsonb),
            calculated_score,
            critical_count,
            warning_count,
            info_count,
            COALESCE(NEW.finished_at, now()),
            now()
        );

        RETURN NEW;
    END IF;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$_$;


ALTER FUNCTION public.persist_agent_inventory_from_command() OWNER TO saas;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_events; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_events (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    event_type character varying(100) NOT NULL,
    message text NOT NULL,
    severity character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.agent_events OWNER TO saas;

--
-- Name: agent_groups; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_groups (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.agent_groups OWNER TO saas;

--
-- Name: agent_inventory_snapshots; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_inventory_snapshots (
    id text NOT NULL,
    tenant_id text NOT NULL,
    agent_id text NOT NULL,
    source_command_id text,
    inventory text NOT NULL,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_inventory_snapshots OWNER TO saas;

--
-- Name: agent_releases; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_releases (
    id uuid NOT NULL,
    tenant_id uuid,
    platform character varying(50) NOT NULL,
    channel character varying(50) NOT NULL,
    version character varying(50) NOT NULL,
    package_url text NOT NULL,
    package_sha256 character varying(128) NOT NULL,
    signature_thumbprint character varying(128) NOT NULL,
    rollback_package_url text,
    rollback_package_sha256 character varying(128),
    min_supported_version character varying(50),
    rollout_percentage integer NOT NULL,
    mandatory boolean NOT NULL,
    is_active boolean NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.agent_releases OWNER TO saas;

--
-- Name: agent_security_snapshots; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_security_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid,
    defender jsonb,
    antivirus jsonb,
    bitlocker jsonb,
    firewall jsonb,
    hotfixes jsonb,
    update_services jsonb,
    local_users jsonb,
    local_groups jsonb,
    local_administrators jsonb,
    usb_devices jsonb,
    monitors jsonb,
    recent_software jsonb,
    security_score integer,
    critical_alerts integer DEFAULT 0,
    warning_alerts integer DEFAULT 0,
    info_alerts integer DEFAULT 0,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_security_snapshots OWNER TO saas;

--
-- Name: agent_software_inventory; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_software_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    command_id uuid,
    name text NOT NULL,
    version text,
    publisher text,
    install_date text,
    estimated_size_mb numeric,
    install_location text,
    uninstall_string text,
    registry_key text,
    source text,
    user_sid text,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_software_inventory OWNER TO saas;

--
-- Name: agent_tag_assignments; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_tag_assignments (
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.agent_tag_assignments OWNER TO saas;

--
-- Name: agent_tags; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agent_tags (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    normalized_name character varying(100) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.agent_tags OWNER TO saas;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.agents (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    group_id uuid,
    hostname character varying(255) NOT NULL,
    mac_address character varying(17) NOT NULL,
    os_version character varying(100) NOT NULL,
    agent_version character varying(50) NOT NULL,
    last_ip character varying(45),
    enrollment_status character varying(50) NOT NULL,
    api_key_hash character varying(255),
    capabilities character varying[] NOT NULL,
    last_seen timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoke_reason text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.agents OWNER TO saas;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.audit_logs (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    target_type character varying(100) NOT NULL,
    target_id character varying(255) NOT NULL,
    metadata_payload jsonb NOT NULL,
    ip_address character varying(45),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO saas;

--
-- Name: command_results; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.command_results (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    command_id uuid NOT NULL,
    output text,
    error_code character varying(50),
    retry_count integer NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.command_results OWNER TO saas;

--
-- Name: commands; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.commands (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    user_id uuid NOT NULL,
    correlation_id character varying(255) NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    command_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(50) NOT NULL,
    timeout_seconds integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    retry_count integer NOT NULL,
    max_retries integer NOT NULL,
    output text,
    error_code character varying(100),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    dispatched_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone
);


ALTER TABLE public.commands OWNER TO saas;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.permissions (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.permissions OWNER TO saas;

--
-- Name: printers; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.printers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    driver character varying(255) NOT NULL,
    port character varying(255) NOT NULL,
    is_default boolean NOT NULL,
    status character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.printers OWNER TO saas;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO saas;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.roles OWNER TO saas;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.tenants OWNER TO saas;

--
-- Name: users; Type: TABLE; Schema: public; Owner: saas
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    status character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO saas;

--
-- Name: agent_events agent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_pkey PRIMARY KEY (id);


--
-- Name: agent_groups agent_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_groups
    ADD CONSTRAINT agent_groups_pkey PRIMARY KEY (id);


--
-- Name: agent_inventory_snapshots agent_inventory_snapshots_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_inventory_snapshots
    ADD CONSTRAINT agent_inventory_snapshots_agent_id_key UNIQUE (agent_id);


--
-- Name: agent_inventory_snapshots agent_inventory_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_inventory_snapshots
    ADD CONSTRAINT agent_inventory_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_releases agent_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_releases
    ADD CONSTRAINT agent_releases_pkey PRIMARY KEY (id);


--
-- Name: agent_security_snapshots agent_security_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_security_snapshots
    ADD CONSTRAINT agent_security_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_software_inventory agent_software_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_software_inventory
    ADD CONSTRAINT agent_software_inventory_pkey PRIMARY KEY (id);


--
-- Name: agent_tag_assignments agent_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tag_assignments
    ADD CONSTRAINT agent_tag_assignments_pkey PRIMARY KEY (agent_id, tag_id);


--
-- Name: agent_tags agent_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tags
    ADD CONSTRAINT agent_tags_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: command_results command_results_command_id_key; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.command_results
    ADD CONSTRAINT command_results_command_id_key UNIQUE (command_id);


--
-- Name: command_results command_results_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.command_results
    ADD CONSTRAINT command_results_pkey PRIMARY KEY (id);


--
-- Name: commands commands_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.commands
    ADD CONSTRAINT commands_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: printers printers_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_name_key; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_name_key UNIQUE (name);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: agent_tags uq_agent_tag_tenant_normalized_name; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tags
    ADD CONSTRAINT uq_agent_tag_tenant_normalized_name UNIQUE (tenant_id, normalized_name);


--
-- Name: agents uq_agent_tenant_mac; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT uq_agent_tenant_mac UNIQUE (tenant_id, mac_address);


--
-- Name: agent_groups uq_agentgroup_tenant_name; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_groups
    ADD CONSTRAINT uq_agentgroup_tenant_name UNIQUE (tenant_id, name);


--
-- Name: commands uq_command_agent_idempotency; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.commands
    ADD CONSTRAINT uq_command_agent_idempotency UNIQUE (agent_id, idempotency_key);


--
-- Name: printers uq_printer_agent_name; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT uq_printer_agent_name UNIQUE (agent_id, name);


--
-- Name: roles uq_role_tenant_name; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT uq_role_tenant_name UNIQUE (tenant_id, name);


--
-- Name: users uq_user_tenant_email; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_user_tenant_email UNIQUE (tenant_id, email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_agent_release_lookup; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_release_lookup ON public.agent_releases USING btree (tenant_id, platform, channel, is_active);


--
-- Name: idx_agent_release_version; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_release_version ON public.agent_releases USING btree (platform, channel, version);


--
-- Name: idx_agent_revoked_by; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_revoked_by ON public.agents USING btree (revoked_by);


--
-- Name: idx_agent_tag_assignment_tenant_agent; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tag_assignment_tenant_agent ON public.agent_tag_assignments USING btree (tenant_id, agent_id);


--
-- Name: idx_agent_tag_assignment_tenant_tag; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tag_assignment_tenant_tag ON public.agent_tag_assignments USING btree (tenant_id, tag_id);


--
-- Name: idx_agent_tag_tenant_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tag_tenant_name ON public.agent_tags USING btree (tenant_id, name);


--
-- Name: idx_agent_tag_tenant_normalized; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tag_tenant_normalized ON public.agent_tags USING btree (tenant_id, normalized_name);


--
-- Name: idx_agent_tenant_group; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tenant_group ON public.agents USING btree (tenant_id, group_id);


--
-- Name: idx_agent_tenant_last_seen; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tenant_last_seen ON public.agents USING btree (tenant_id, last_seen);


--
-- Name: idx_agent_tenant_mac; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tenant_mac ON public.agents USING btree (tenant_id, mac_address);


--
-- Name: idx_agent_tenant_revoked; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agent_tenant_revoked ON public.agents USING btree (tenant_id, revoked_at);


--
-- Name: idx_agentgroup_tenant_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_agentgroup_tenant_name ON public.agent_groups USING btree (tenant_id, name);


--
-- Name: idx_audit_tenant_created; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_audit_tenant_created ON public.audit_logs USING btree (tenant_id, created_at);


--
-- Name: idx_audit_tenant_user; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_audit_tenant_user ON public.audit_logs USING btree (tenant_id, user_id);


--
-- Name: idx_cmdresult_command_id; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_cmdresult_command_id ON public.command_results USING btree (command_id);


--
-- Name: idx_command_tenant_agent_status; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_command_tenant_agent_status ON public.commands USING btree (tenant_id, agent_id, status);


--
-- Name: idx_command_tenant_created_at; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_command_tenant_created_at ON public.commands USING btree (tenant_id, created_at);


--
-- Name: idx_event_tenant_agent_created; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_event_tenant_agent_created ON public.agent_events USING btree (tenant_id, agent_id, created_at);


--
-- Name: idx_event_tenant_severity; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_event_tenant_severity ON public.agent_events USING btree (tenant_id, severity);


--
-- Name: idx_permission_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_permission_name ON public.permissions USING btree (name);


--
-- Name: idx_printer_tenant_agent; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_printer_tenant_agent ON public.printers USING btree (tenant_id, agent_id);


--
-- Name: idx_role_tenant_id_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_role_tenant_id_name ON public.roles USING btree (tenant_id, name);


--
-- Name: idx_tenant_active; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_tenant_active ON public.tenants USING btree (active);


--
-- Name: idx_tenant_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_tenant_name ON public.tenants USING btree (name);


--
-- Name: idx_user_tenant_email; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX idx_user_tenant_email ON public.users USING btree (tenant_id, email);


--
-- Name: ix_agent_inventory_snapshots_agent_id; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_inventory_snapshots_agent_id ON public.agent_inventory_snapshots USING btree (agent_id);


--
-- Name: ix_agent_inventory_snapshots_tenant_id; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_inventory_snapshots_tenant_id ON public.agent_inventory_snapshots USING btree (tenant_id);


--
-- Name: ix_agent_security_snapshots_agent_id; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_security_snapshots_agent_id ON public.agent_security_snapshots USING btree (agent_id);


--
-- Name: ix_agent_security_snapshots_collected_at; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_security_snapshots_collected_at ON public.agent_security_snapshots USING btree (collected_at DESC);


--
-- Name: ix_agent_security_snapshots_tenant_agent; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_security_snapshots_tenant_agent ON public.agent_security_snapshots USING btree (tenant_id, agent_id);


--
-- Name: ix_agent_software_inventory_agent_id; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_software_inventory_agent_id ON public.agent_software_inventory USING btree (agent_id);


--
-- Name: ix_agent_software_inventory_name; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_software_inventory_name ON public.agent_software_inventory USING btree (name);


--
-- Name: ix_agent_software_inventory_source; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_software_inventory_source ON public.agent_software_inventory USING btree (source);


--
-- Name: ix_agent_software_inventory_tenant_agent; Type: INDEX; Schema: public; Owner: saas
--

CREATE INDEX ix_agent_software_inventory_tenant_agent ON public.agent_software_inventory USING btree (tenant_id, agent_id);


--
-- Name: commands trg_persist_agent_inventory_from_command; Type: TRIGGER; Schema: public; Owner: saas
--

CREATE TRIGGER trg_persist_agent_inventory_from_command AFTER INSERT OR UPDATE OF status, output, finished_at ON public.commands FOR EACH ROW EXECUTE FUNCTION public.persist_agent_inventory_from_command();


--
-- Name: agent_events agent_events_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_events agent_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_groups agent_groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_groups
    ADD CONSTRAINT agent_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_releases agent_releases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_releases
    ADD CONSTRAINT agent_releases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_tag_assignments agent_tag_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tag_assignments
    ADD CONSTRAINT agent_tag_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_tag_assignments agent_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tag_assignments
    ADD CONSTRAINT agent_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.agent_tags(id) ON DELETE CASCADE;


--
-- Name: agent_tag_assignments agent_tag_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tag_assignments
    ADD CONSTRAINT agent_tag_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_tags agent_tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agent_tags
    ADD CONSTRAINT agent_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agents agents_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.agent_groups(id) ON DELETE SET NULL;


--
-- Name: agents agents_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: agents agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: command_results command_results_command_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.command_results
    ADD CONSTRAINT command_results_command_id_fkey FOREIGN KEY (command_id) REFERENCES public.commands(id) ON DELETE CASCADE;


--
-- Name: command_results command_results_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.command_results
    ADD CONSTRAINT command_results_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: commands commands_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.commands
    ADD CONSTRAINT commands_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: commands commands_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.commands
    ADD CONSTRAINT commands_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: commands commands_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.commands
    ADD CONSTRAINT commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: printers printers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: printers printers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: saas
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict nKNBRk4aWQCnF7Qn6qjhqcDctqyZFbt3FmK3cuVEiHhiGtN72DZJNLNwWigZjNl


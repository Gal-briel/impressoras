import pytest
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from app.infrastructure.database.models import Command, Agent
from app.infrastructure.database.enums import CommandStatus
from app.schemas.command import CommandCreate
from app.services.command_policy import CommandPolicyViolation

@pytest.mark.asyncio
async def test_expire_stale_commands(command_service, mock_session, mocker):
    now = datetime.now(timezone.utc)
    mock_command = MagicMock(spec=Command)
    mock_command.id = uuid4()
    mock_command.agent_id = uuid4()
    mock_command.tenant_id = uuid4()
    mock_command.user_id = uuid4()
    mock_command.command_type = "collect_inventory"
    mock_command.status = CommandStatus.QUEUED
    mock_command.correlation_id = "test-corr"
    mock_command.idempotency_key = "test-idem"
    mock_command.expires_at = now - timedelta(seconds=10)
    mock_command.payload = {}
    mock_command.output = None

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [mock_command]
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    # Mock rabbitmq and websocket
    mocker.patch("app.services.command_service.websocket_manager.broadcast_event", new_callable=AsyncMock)

    expired_count = await command_service.expire_stale_commands(limit=10)

    assert expired_count == 1
    assert mock_command.status == CommandStatus.EXPIRED
    assert mock_command.error_code == "COMMAND_EXPIRED"
    assert mock_command.finished_at is not None
    assert mock_command.output is not None

    # Audit logic uses audit_repository.model and session.add
    command_service.audit_repository.model.assert_called_once()
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_dispatch_command_idempotency_same_payload(command_service, mock_session, base_ids):
    # Agent mock
    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = base_ids["tenant_id"]
    mock_agent.enrollment_status = "approved"
    mock_agent.is_online = True
    mock_agent.revoked_at = None

    # Existing command mock (same idempotency_key, same payload)
    mock_existing_command = MagicMock(spec=Command)
    mock_existing_command.idempotency_key = "idem-123"
    mock_existing_command.payload = {"message": "hello"}
    mock_existing_command.command_type = "collect_inventory"
    mock_existing_command.timeout_seconds = 60
    mock_existing_command.id = uuid4()
    mock_existing_command.tenant_id = base_ids["tenant_id"]
    mock_existing_command.agent_id = base_ids["agent_id"]
    mock_existing_command.user_id = base_ids["user_id"]
    mock_existing_command.correlation_id = "corr-1"
    mock_existing_command.status = "QUEUED"
    mock_existing_command.expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    # Setup execute returns
    # 1st call: agent query
    # 2nd call: idempotency query
    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent

    mock_idem_result = MagicMock()
    mock_idem_result.scalar_one_or_none.return_value = mock_existing_command

    mock_session.execute.side_effect = [mock_agent_result, mock_idem_result]

    command_in = CommandCreate(
        command_type="collect_inventory",
        payload={"message": "hello"},
        idempotency_key="idem-123"
    )

    response = await command_service.dispatch_command(
        tenant_id=base_ids["tenant_id"],
        agent_id=base_ids["agent_id"],
        user_id=base_ids["user_id"],
        command_in=command_in,
        user_permissions=["commands:execute"]
    )

    assert response.id == mock_existing_command.id
    mock_session.add.assert_not_called()  # Should not create a new one


@pytest.mark.asyncio
async def test_dispatch_command_idempotency_different_payload(command_service, mock_session, base_ids):
    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = base_ids["tenant_id"]
    mock_agent.enrollment_status = "approved"
    mock_agent.is_online = True
    mock_agent.revoked_at = None
    mock_agent.revoked_at = None

    mock_existing_command = MagicMock(spec=Command)
    mock_existing_command.idempotency_key = "idem-123"
    mock_existing_command.payload = {"message": "OLD MESSAGE"}

    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent

    mock_idem_result = MagicMock()
    mock_idem_result.scalar_one_or_none.return_value = mock_existing_command

    mock_session.execute.side_effect = [mock_agent_result, mock_idem_result]

    command_in = CommandCreate(
        command_type="collect_inventory",
        payload={"message": "NEW MESSAGE"},
        idempotency_key="idem-123"
    )

    with pytest.raises(Exception) as excinfo:
        await command_service.dispatch_command(
            tenant_id=base_ids["tenant_id"],
            agent_id=base_ids["agent_id"],
            user_id=base_ids["user_id"],
            command_in=command_in,
            user_permissions=["commands:execute"]
        )
    assert "payload" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_dispatch_command_cross_tenant_blocked(command_service, mock_session, base_ids):
    mock_agent = MagicMock(spec=Agent)
    # The agent belongs to a DIFFERENT tenant
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = uuid4()

    mock_agent_result = MagicMock()
    # It will return None because the query filters by both agent_id and tenant_id
    mock_agent_result.scalar_one_or_none.return_value = None

    mock_session.execute.return_value = mock_agent_result

    command_in = CommandCreate(
        command_type="collect_inventory",
        payload={"message": "hello"},
        idempotency_key="idem-999"
    )

    with pytest.raises(PermissionError) as excinfo:
        await command_service.dispatch_command(
            tenant_id=base_ids["tenant_id"],
            agent_id=base_ids["agent_id"],
            user_id=base_ids["user_id"],
            command_in=command_in,
            user_permissions=["commands:execute"]
        )
    assert "not found in current tenant" in str(excinfo.value).lower()

@pytest.mark.asyncio
async def test_expire_stale_commands_no_commands(command_service, mock_session):
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    count = await command_service.expire_stale_commands(limit=10)
    assert count == 0
    mock_session.add.assert_not_called()

@pytest.mark.asyncio
async def test_expire_stale_commands_websocket_and_params(command_service, mock_session, mocker):
    now = datetime.now(timezone.utc)
    mock_command = MagicMock(spec=Command)
    mock_command.id = uuid4()
    mock_command.agent_id = uuid4()
    mock_command.tenant_id = uuid4()
    mock_command.user_id = uuid4()
    mock_command.command_type = "collect_inventory"
    mock_command.status = CommandStatus.QUEUED
    mock_command.correlation_id = "test-corr"
    mock_command.idempotency_key = "test-idem"
    mock_command.expires_at = now - timedelta(seconds=10)
    mock_command.payload = {"password": "my_super_secret"}
    mock_command.output = None

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [mock_command]
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    mock_broadcast = mocker.patch("app.services.command_service.websocket_manager.broadcast_event", new_callable=AsyncMock)

    expired_count = await command_service.expire_stale_commands(agent_id=mock_command.agent_id, tenant_id=mock_command.tenant_id, limit=10)

    assert expired_count == 1

    # Websocket events for both command_finished and command_expired should be fired
    assert mock_broadcast.call_count == 2

    # Ensure sensitive payload was redacted in the audit model
    audit_kwargs = command_service.audit_repository.model.call_args.kwargs
    metadata = audit_kwargs.get("metadata_payload")
    assert metadata["payload"]["password"] == "[redacted]"

@pytest.mark.asyncio
async def test_dispatch_command_agent_revoked(command_service, mock_session, base_ids):
    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = base_ids["tenant_id"]
    mock_agent.enrollment_status = "revoked"
    mock_agent.revoked_at = None

    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent
    mock_session.execute.return_value = mock_agent_result

    command_in = CommandCreate(
        command_type="collect_inventory",
        payload={},
        idempotency_key="idem-revoked"
    )

    with pytest.raises(PermissionError, match="Agent revoked"):
        await command_service.dispatch_command(
            tenant_id=base_ids["tenant_id"],
            agent_id=base_ids["agent_id"],
            user_id=base_ids["user_id"],
            command_in=command_in,
            user_permissions=["commands:execute"]
        )

@pytest.mark.asyncio
async def test_dispatch_command_agent_not_approved(command_service, mock_session, base_ids):
    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = base_ids["tenant_id"]
    mock_agent.enrollment_status = "pending"
    mock_agent.revoked_at = None

    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent
    mock_session.execute.return_value = mock_agent_result

    command_in = CommandCreate(command_type="collect_inventory", payload={}, idempotency_key="idem-pending")

    with pytest.raises(PermissionError, match="Agent not approved"):
        await command_service.dispatch_command(
            tenant_id=base_ids["tenant_id"],
            agent_id=base_ids["agent_id"],
            user_id=base_ids["user_id"],
            command_in=command_in,
            user_permissions=["commands:execute"]
        )

@pytest.mark.asyncio
async def test_dispatch_command_success_publish(command_service, mock_session, base_ids, mocker):
    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = base_ids["agent_id"]
    mock_agent.tenant_id = base_ids["tenant_id"]
    mock_agent.enrollment_status = "approved"
    mock_agent.revoked_at = None

    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent

    mock_idem_result = MagicMock()
    mock_idem_result.scalar_one_or_none.return_value = None

    mock_session.execute.side_effect = [mock_agent_result, mock_idem_result]

    mock_command = MagicMock(spec=Command)
    mock_command.id = uuid4()
    mock_command.tenant_id = base_ids["tenant_id"]
    mock_command.agent_id = base_ids["agent_id"]
    mock_command.user_id = base_ids["user_id"]
    mock_command.command_type = "collect_inventory"
    mock_command.payload = {}
    mock_command.correlation_id = "corr"
    mock_command.idempotency_key = "idem-new"
    mock_command.status = "QUEUED"
    mock_command.timeout_seconds = 30
    now = datetime.now(timezone.utc)
    mock_command.created_at = now
    mock_command.expires_at = now + timedelta(minutes=5)
    command_service.repository.create = AsyncMock(return_value=mock_command)

    mock_publish = mocker.patch("app.services.command_service.rabbitmq_client.publish_command", new_callable=AsyncMock)
    mock_broadcast = mocker.patch("app.services.command_service.websocket_manager.broadcast_event", new_callable=AsyncMock)

    command_in = CommandCreate(command_type="collect_inventory", payload={}, idempotency_key="idem-new")

    resp = await command_service.dispatch_command(
        tenant_id=base_ids["tenant_id"],
        agent_id=base_ids["agent_id"],
        user_id=base_ids["user_id"],
        command_in=command_in,
        user_permissions=["commands:execute"]
    )

    assert resp.id == mock_command.id
    mock_publish.assert_called_once_with(routing_key=f"agent.{base_ids['agent_id']}.commands", payload=mocker.ANY)
    mock_broadcast.assert_called_once()

@pytest.mark.asyncio
async def test_dispatch_command_invalid_payload(command_service, mock_session, base_ids, mocker):
    mocker.patch(
        "app.services.command_service.validate_and_authorize_command",
        side_effect=CommandPolicyViolation("Invalid payload")
    )

    command_in = CommandCreate(command_type="collect_inventory", payload={"bad": "payload"}, idempotency_key="idem")

    with pytest.raises(CommandPolicyViolation, match="Invalid payload"):
        await command_service.dispatch_command(
            tenant_id=base_ids["tenant_id"],
            agent_id=base_ids["agent_id"],
            user_id=base_ids["user_id"],
            command_in=command_in,
            user_permissions=["commands:execute"]
        )

    # Assert DB queries for agent and idempotency were not even executed
    mock_session.execute.assert_not_called()


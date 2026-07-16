import pytest
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import require_agent_auth, get_db_session, get_command_service
from app.infrastructure.database.models import Command, Agent
from app.infrastructure.database.enums import CommandStatus

@pytest.fixture
def client():
    return TestClient(app)

def test_agent_list_pending_commands(client, mocker):
    agent_id = str(uuid4())
    tenant_id = uuid4()
    now = datetime.now(timezone.utc)

    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = agent_id
    mock_agent.tenant_id = tenant_id

    # 2 Commands: 1 Valid, 1 Expired
    valid_command = MagicMock(spec=Command)
    valid_command.id = uuid4()
    valid_command.agent_id = agent_id
    valid_command.tenant_id = tenant_id
    valid_command.command_type = "collect_inventory"
    valid_command.status = CommandStatus.QUEUED
    valid_command.expires_at = now + timedelta(minutes=5)
    valid_command.payload = {}
    valid_command.correlation_id = "corr-1"
    valid_command.timeout_seconds = 30

    expired_command = MagicMock(spec=Command)
    expired_command.id = uuid4()
    expired_command.agent_id = agent_id
    expired_command.tenant_id = tenant_id
    expired_command.command_type = "collect_inventory"
    expired_command.status = CommandStatus.QUEUED
    expired_command.expires_at = now - timedelta(minutes=5)
    expired_command.payload = {}
    expired_command.correlation_id = "corr-2"
    expired_command.timeout_seconds = 30

    mock_session = AsyncMock()
    # 1st query: Agent lookup
    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent

    # 2nd query: Pending Commands lookup
    mock_commands_result = MagicMock()
    mock_commands_scalars = MagicMock()

    # NOTE: The route logic has the filter Command.expires_at > now built into the query.
    # Because of that, the DB should actually ONLY return the valid command.
    # The expired command would NOT be returned by the DB select because of that filter.
    mock_commands_scalars.all.return_value = [valid_command]
    mock_commands_result.scalars.return_value = mock_commands_scalars

    mock_session.execute.side_effect = [mock_agent_result, mock_commands_result]

    mock_command_service = MagicMock()
    mock_command_service.expire_stale_commands = AsyncMock()
    mock_command_service.update_status_idempotent = AsyncMock()

    app.dependency_overrides[require_agent_auth] = lambda: agent_id
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[get_command_service] = lambda: mock_command_service

    response = client.get("/api/v1/agent/commands/pending?limit=25")

    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == str(valid_command.id)

    # Validate that expire_stale_commands was called correctly at the beginning of the route
    mock_command_service.expire_stale_commands.assert_called_once()
    kwargs = mock_command_service.expire_stale_commands.call_args.kwargs
    assert str(kwargs.get("agent_id")) == agent_id
    assert kwargs.get("limit") == 25

    app.dependency_overrides.clear()

def test_agent_list_pending_commands_query_filters(client, mocker):
    """
    Testa se a query realmente adiciona os filtros de status terminal e expires_at > now.
    """
    agent_id = str(uuid4())
    tenant_id = uuid4()

    mock_agent = MagicMock(spec=Agent)
    mock_agent.id = agent_id
    mock_agent.tenant_id = tenant_id

    mock_session = AsyncMock()
    mock_agent_result = MagicMock()
    mock_agent_result.scalar_one_or_none.return_value = mock_agent

    mock_commands_result = MagicMock()
    mock_commands_result.scalars.return_value.all.return_value = []

    mock_session.execute.side_effect = [mock_agent_result, mock_commands_result]

    mock_command_service = MagicMock()
    mock_command_service.expire_stale_commands = AsyncMock()

    app.dependency_overrides[require_agent_auth] = lambda: agent_id
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[get_command_service] = lambda: mock_command_service

    response = client.get("/api/v1/agent/commands/pending?limit=25")
    assert response.status_code == 200

    # O segundo execute é a query de comandos
    call_args = mock_session.execute.call_args_list[1]
    stmt = call_args[0][0]
    sql_str = str(stmt).lower()

    # Verifica se os filtros necessários estão na instrução SQL gerada (idempotência, status validos e expiração)
    assert "status in" in sql_str or "status IN" in str(stmt)
    assert "expires_at >" in sql_str

    app.dependency_overrides.clear()


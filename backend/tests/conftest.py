import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

# Mock classes for Repositories and Session
class MockSession:
    def __init__(self):
        self.add = MagicMock()
        self.commit = AsyncMock()
        self.execute = AsyncMock()
        self.flush = AsyncMock()

class MockCommandRepository:
    def __init__(self, session=None):
        self.session = session or MockSession()
        self.model = MagicMock()

class MockAuditRepository:
    def __init__(self, session=None):
        self.session = session or MockSession()
        self.model = MagicMock()

@pytest.fixture
def mock_session():
    return MockSession()

@pytest.fixture
def mock_command_repo(mock_session):
    return MockCommandRepository(mock_session)

@pytest.fixture
def mock_audit_repo(mock_session):
    return MockAuditRepository(mock_session)

@pytest.fixture
def command_service(mock_command_repo, mock_audit_repo):
    from app.services.command_service import CommandService
    return CommandService(
        repository=mock_command_repo,
        audit_repository=mock_audit_repo
    )

@pytest.fixture
def base_ids():
    return {
        "tenant_id": uuid4(),
        "agent_id": uuid4(),
        "user_id": uuid4()
    }

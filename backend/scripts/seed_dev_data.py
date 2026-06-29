"""Cria/atualiza dados mínimos para testar o Gabriel em desenvolvimento.

Uso:
    cd backend
    PYTHONPATH=. python scripts/seed_dev_data.py

Login:
    admin@example.com / admin123

Agente dev:
    id: 50ab54df-c4ca-4b1b-a7a6-e0940ec7b94a
    api key: dev-agent-api-key
"""

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, insert, select

from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token, get_api_key_hash, get_password_hash
from app.infrastructure.database.enums import EnrollmentStatus, UserStatus
from app.infrastructure.database.models import (
    Agent,
    Permission,
    Role,
    Tenant,
    User,
    role_permissions,
)

DEV_TENANT_NAME = "Tenant Dev"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
DEV_AGENT_ID = UUID("50ab54df-c4ca-4b1b-a7a6-e0940ec7b94a")
DEV_AGENT_API_KEY = "dev-agent-api-key"

PERMISSIONS = [
    "agents:read",
    "agents:write",
    "commands:execute",
    "agent-tags:write",
    "agent-groups:write",
    "printers:read",
    "inventory:read",
]

DEV_AGENT_CAPABILITIES = [
    "collect_hardware_inventory",
    "collect_diagnostics",
    "restart_spooler",
    "clear_print_queue",
    "update_agent",
    "printers",
    "commands",
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Tenant).where(Tenant.name == DEV_TENANT_NAME))
        tenant = result.scalars().first()

        if not tenant:
            tenant = Tenant(name=DEV_TENANT_NAME, active=True)
            session.add(tenant)
            await session.flush()
        else:
            tenant.active = True

        existing_permissions: dict[str, Permission] = {}
        for name in PERMISSIONS:
            result = await session.execute(select(Permission).where(Permission.name == name))
            permission = result.scalars().first()

            if not permission:
                permission = Permission(name=name, description=f"Dev permission {name}")
                session.add(permission)
                await session.flush()

            existing_permissions[name] = permission

        result = await session.execute(
            select(Role).where(Role.tenant_id == tenant.id, Role.name == "Admin Dev")
        )
        role = result.scalars().first()

        if not role:
            role = Role(tenant_id=tenant.id, name="Admin Dev", description="Perfil admin local")
            session.add(role)
            await session.flush()

        await session.execute(delete(role_permissions).where(role_permissions.c.role_id == role.id))

        await session.execute(
            insert(role_permissions),
            [
                {"role_id": role.id, "permission_id": permission.id}
                for permission in existing_permissions.values()
            ],
        )

        result = await session.execute(
            select(User).where(User.tenant_id == tenant.id, User.email == ADMIN_EMAIL)
        )
        user = result.scalars().first()

        if not user:
            user = User(
                tenant_id=tenant.id,
                role_id=role.id,
                email=ADMIN_EMAIL,
                password_hash=get_password_hash(ADMIN_PASSWORD),
                status=UserStatus.ACTIVE,
            )
            session.add(user)
            await session.flush()
        else:
            user.role_id = role.id
            user.password_hash = get_password_hash(ADMIN_PASSWORD)
            user.status = UserStatus.ACTIVE

        result = await session.execute(select(Agent).where(Agent.id == DEV_AGENT_ID))
        agent = result.scalars().first()

        now = datetime.now(timezone.utc)
        if not agent:
            agent = Agent(
                id=DEV_AGENT_ID,
                tenant_id=tenant.id,
                hostname="Gabriel-Windows-Agent",
                mac_address="00:00:00:00:00:00",
                os_version="Windows 11",
                agent_version="0.1.5",
                last_ip="127.0.0.1",
                enrollment_status=EnrollmentStatus.APPROVED,
                api_key_hash=get_api_key_hash(DEV_AGENT_API_KEY),
                capabilities=DEV_AGENT_CAPABILITIES,
                last_seen=now,
            )
            session.add(agent)
            await session.flush()
        else:
            agent.tenant_id = tenant.id
            agent.hostname = agent.hostname or "Gabriel-Windows-Agent"
            agent.mac_address = agent.mac_address or "00:00:00:00:00:00"
            agent.os_version = agent.os_version or "Windows 11"
            agent.agent_version = agent.agent_version or "0.1.5"
            agent.last_ip = agent.last_ip or "127.0.0.1"
            agent.enrollment_status = EnrollmentStatus.APPROVED
            agent.api_key_hash = get_api_key_hash(DEV_AGENT_API_KEY)
            agent.capabilities = list(agent.capabilities or DEV_AGENT_CAPABILITIES)
            agent.last_seen = agent.last_seen or now

        await session.commit()

        token = create_access_token(str(user.id), str(tenant.id), PERMISSIONS)

    print("Tenant ID:", tenant.id)
    print("Admin:", ADMIN_EMAIL, "/", ADMIN_PASSWORD)
    print("User ID:", user.id)
    print("Agent ID:", agent.id)
    print("Agent API Key:", DEV_AGENT_API_KEY)
    print("JWT:", token)


if __name__ == "__main__":
    asyncio.run(main())

"""Cria dados mínimos para testar o backend local.

Uso:
    cd backend
    PYTHONPATH=. python scripts/seed_dev_data.py

Login administrativo:
    admin@example.com / admin123

O script também imprime um JWT e uma API Key de agente para testes via Swagger/curl.
"""

import asyncio

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


PERMISSIONS = [
    "agents:read",
    "agents:write",
    "commands:execute",
    "commands:approve",
    "agent-tags:write",
    "agent-groups:write",
    "printers.read",
    "audit.read",
    "settings.read",
    "users.manage",
]


async def main() -> None:
    api_key = "dev-agent-api-key"

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Tenant).where(Tenant.name == "Tenant Dev")
        )
        tenant = result.scalars().first()

        if not tenant:
            tenant = Tenant(
                name="Tenant Dev",
                active=True,
            )
            session.add(tenant)
            await session.flush()

        existing_permissions: dict[str, Permission] = {}

        for name in PERMISSIONS:
            result = await session.execute(
                select(Permission).where(Permission.name == name)
            )
            permission = result.scalars().first()

            if not permission:
                permission = Permission(
                    name=name,
                    description=f"Dev permission {name}",
                )
                session.add(permission)
                await session.flush()

            existing_permissions[name] = permission

        result = await session.execute(
            select(Role).where(
                Role.tenant_id == tenant.id,
                Role.name == "Admin Dev",
            )
        )
        role = result.scalars().first()

        if not role:
            role = Role(
                tenant_id=tenant.id,
                name="Admin Dev",
                description="Perfil admin local",
            )
            session.add(role)
            await session.flush()

        # Evita lazy loading async em role.permissions.
        # Não use: role.permissions = [...]
        await session.execute(
            delete(role_permissions).where(
                role_permissions.c.role_id == role.id,
            )
        )

        permission_rows = [
            {
                "role_id": role.id,
                "permission_id": permission.id,
            }
            for permission in existing_permissions.values()
        ]

        if permission_rows:
            await session.execute(
                insert(role_permissions),
                permission_rows,
            )

        result = await session.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.email == "admin@example.com",
            )
        )
        user = result.scalars().first()

        if not user:
            user = User(
                tenant_id=tenant.id,
                role_id=role.id,
                email="admin@example.com",
                password_hash=get_password_hash("admin123"),
                status=UserStatus.ACTIVE,
            )
            session.add(user)
            await session.flush()
        else:
            user.role_id = role.id
            user.status = UserStatus.ACTIVE
            session.add(user)
            await session.flush()

        result = await session.execute(
            select(Agent).where(
                Agent.tenant_id == tenant.id,
                Agent.hostname == "DEV-AGENT-01",
            )
        )
        agent = result.scalars().first()

        if not agent:
            agent = Agent(
                tenant_id=tenant.id,
                hostname="DEV-AGENT-01",
                mac_address="00:11:22:33:44:55",
                os_version="Windows 11 Pro",
                agent_version="1.0.0",
                last_ip="127.0.0.1",
                enrollment_status=EnrollmentStatus.APPROVED,
                api_key_hash=get_api_key_hash(api_key),
                capabilities=[
                    "commands",
                    "printers",
                    "watchdog",
                    "auto_update",
                ],
            )
            session.add(agent)
            await session.flush()
        else:
            agent.enrollment_status = EnrollmentStatus.APPROVED
            agent.api_key_hash = get_api_key_hash(api_key)
            agent.capabilities = [
                "commands",
                "printers",
                "watchdog",
                "auto_update",
            ]
            session.add(agent)
            await session.flush()

        await session.commit()

        token = create_access_token(
            str(user.id),
            str(tenant.id),
            PERMISSIONS,
        )

    print("Tenant ID:", tenant.id)
    print("User ID:", user.id)
    print("Agent ID:", agent.id)
    print("Agent API Key:", api_key)
    print("JWT:", token)


if __name__ == "__main__":
    asyncio.run(main())

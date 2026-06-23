# app/repositories/command_repository.py
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.infrastructure.database.models import Command
from app.schemas.command import CommandCreate

class CommandRepository(BaseRepository[Command, CommandCreate, CommandCreate]):
    def __init__(self, session: AsyncSession):
        super().__init__(Command, session)
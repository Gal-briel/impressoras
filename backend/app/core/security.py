# app/core/security.py
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from jose import jwt
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: str, tenant_id: str, permissions: list[str], expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {"exp": expire, "sub": str(subject), "tenant_id": str(tenant_id), "permissions": permissions}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def generate_api_key() -> str:
    """Gera uma API Key de alta entropia para novos agentes."""
    return secrets.token_urlsafe(32)

def get_api_key_hash(api_key: str) -> str:
    """Gera o hash SHA-256 da API Key."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()

def verify_api_key(plain_api_key: str, hashed_api_key: str) -> bool:
    """Compara o hash SHA-256."""
    return get_api_key_hash(plain_api_key) == hashed_api_key
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# Connection pool tuned for real networks, SSH tunnels, and idle disconnects:
# - pool_pre_ping: test each connection before use (avoids "connection closed" errors after idle drops)
# - pool_recycle: drop connections periodically so NAT/tunnel timeouts don't leave stale sockets
# - connect timeout: fail fast instead of hanging when the DB or tunnel is unreachable
_ASYNCPG_CONNECT = {
    "timeout": 30,
    "server_settings": {"application_name": "acknowledge_api"},
}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_recycle=280,
    pool_size=5,
    max_overflow=10,
    connect_args=_ASYNCPG_CONNECT,
)

# Create the session factory
SessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()

# Dependency for routes
async def get_db():
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

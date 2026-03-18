"""
Database connection and session management.
Uses SQLAlchemy 2.0 with connection pooling.
"""

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# Naming convention for consistent constraint names
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


# Base class for models (SQLAlchemy 2.0 style)
class Base(DeclarativeBase):
    """Base class for all models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# Create engine with connection pooling
engine = create_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo=settings.is_development,  # Log SQL in development
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Used with FastAPI's Depends().

    Yields:
        Session: SQLAlchemy session that auto-closes after request
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions.
    Use in non-request contexts (workers, scripts).

    Example:
        with get_db_context() as db:
            db.query(User).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Initialize database - create all tables.
    Called on application startup in development.
    In production, use Alembic migrations.
    """
    Base.metadata.create_all(bind=engine)


# Test database support
_test_engine = None
_test_session_local = None


def get_test_db() -> Generator[Session, None, None]:
    """
    Dependency for test database sessions.
    Uses separate test database.
    """
    global _test_engine, _test_session_local

    if _test_engine is None:
        if not settings.test_database_url:
            raise ValueError("TEST_DATABASE_URL not configured")

        _test_engine = create_engine(
            settings.test_database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
        )
        _test_session_local = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=_test_engine,
        )

    db = _test_session_local()
    try:
        yield db
    finally:
        db.close()

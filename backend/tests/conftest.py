"""
Pytest configuration and fixtures for Vibe Platform tests.

IMPORTANT: Tests use Postgres, not SQLite.
Our models use Postgres-specific features (UUID, ENUM, JSONB, pgvector).
"""

import os
from typing import Generator
from uuid import uuid4

import pytest
import redis
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

# Set test environment before importing app
os.environ["ENVIRONMENT"] = "test"

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models import Organization, OrganizationUser, OrganizationUserRole, User

# =============================================================================
# Redis Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """
    Clear Redis rate limit keys before each test.

    This ensures tests don't interfere with each other through
    accumulated rate limit counts.
    """
    try:
        r = redis.from_url(settings.redis_url)
        # Delete all rate limit keys
        for key in r.scan_iter("rate_limit:*"):
            r.delete(key)
    except redis.RedisError:
        # If Redis is unavailable, skip cleanup
        pass
    yield


# =============================================================================
# Database Fixtures
# =============================================================================


@pytest.fixture(scope="session")
def db_engine():
    """
    Create test database engine.

    IMPORTANT: Uses Postgres, not SQLite.
    Required for UUID, ENUM, JSONB, pgvector support.
    """
    test_db_url = settings.test_database_url
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL not configured")

    engine = create_engine(
        test_db_url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)

    yield engine

    # Cleanup - drop all tables
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(db_engine) -> Generator[Session, None, None]:
    """
    Provide a transactional database session for tests.

    Each test runs in its own transaction that is rolled back
    after the test completes, ensuring test isolation.
    """
    connection = db_engine.connect()
    transaction = connection.begin()

    session = sessionmaker(bind=connection)()

    # Begin a nested transaction (savepoint)
    nested = connection.begin_nested()

    # If the session would commit, restart the savepoint instead
    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.begin_nested()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """
    FastAPI test client with database session override.
    """

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


# =============================================================================
# Model Fixtures
# =============================================================================


@pytest.fixture
def test_org(db: Session) -> Organization:
    """Create a test organization."""
    org = Organization(
        name="Test Organization",
        slug=f"test-org-{uuid4().hex[:8]}",
        status="active",
        plan="free",
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@pytest.fixture
def test_user(db: Session, test_org: Organization) -> User:
    """Create a test user with organization membership."""
    user = User(
        firebase_uid=f"test-uid-{uuid4().hex[:8]}",
        email=f"test-{uuid4().hex[:8]}@example.com",
        name="Test User",
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create membership
    membership = OrganizationUser(
        organization_id=test_org.id,
        user_id=user.id,
        role=OrganizationUserRole.ADMIN,
    )
    db.add(membership)
    db.commit()

    return user


@pytest.fixture
def test_owner(db: Session, test_org: Organization) -> User:
    """Create a test user with owner role."""
    user = User(
        firebase_uid=f"owner-uid-{uuid4().hex[:8]}",
        email=f"owner-{uuid4().hex[:8]}@example.com",
        name="Test Owner",
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create owner membership
    membership = OrganizationUser(
        organization_id=test_org.id,
        user_id=user.id,
        role=OrganizationUserRole.OWNER,
    )
    db.add(membership)

    # Set as org creator
    test_org.created_by = user.id
    db.commit()

    return user


@pytest.fixture
def test_candidate(db: Session, test_org: Organization) -> User:
    """Create a test user with candidate role."""
    user = User(
        firebase_uid=f"candidate-uid-{uuid4().hex[:8]}",
        email=f"candidate-{uuid4().hex[:8]}@example.com",
        name="Test Candidate",
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create candidate membership
    membership = OrganizationUser(
        organization_id=test_org.id,
        user_id=user.id,
        role=OrganizationUserRole.CANDIDATE,
    )
    db.add(membership)
    db.commit()

    return user


# =============================================================================
# Auth Fixtures
# =============================================================================


def mock_firebase_token(user: User) -> str:
    """
    Generate a mock Firebase token for testing.

    In tests, we bypass actual Firebase verification.
    This returns a predictable token that the test auth override
    will recognize.
    """
    return f"mock-token-{user.firebase_uid}"


@pytest.fixture
def auth_headers(test_user: User, test_org: Organization) -> dict:
    """
    Auth headers with org context.

    REQUIRED for all API tests to enforce org context.
    """
    return {
        "Authorization": f"Bearer {mock_firebase_token(test_user)}",
        "X-Organization-Id": str(test_org.id),
    }


@pytest.fixture
def owner_auth_headers(test_owner: User, test_org: Organization) -> dict:
    """Auth headers for owner user."""
    return {
        "Authorization": f"Bearer {mock_firebase_token(test_owner)}",
        "X-Organization-Id": str(test_org.id),
    }


@pytest.fixture
def candidate_auth_headers(test_candidate: User, test_org: Organization) -> dict:
    """Auth headers for candidate user."""
    return {
        "Authorization": f"Bearer {mock_firebase_token(test_candidate)}",
        "X-Organization-Id": str(test_org.id),
    }


# =============================================================================
# Other Org Fixtures (for isolation tests)
# =============================================================================


@pytest.fixture
def other_org(db: Session) -> Organization:
    """Create another organization for cross-org isolation tests."""
    org = Organization(
        name="Other Organization",
        slug=f"other-org-{uuid4().hex[:8]}",
        status="active",
        plan="free",
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@pytest.fixture
def other_user(db: Session, other_org: Organization) -> User:
    """Create a user in another organization."""
    user = User(
        firebase_uid=f"other-uid-{uuid4().hex[:8]}",
        email=f"other-{uuid4().hex[:8]}@example.com",
        name="Other User",
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    membership = OrganizationUser(
        organization_id=other_org.id,
        user_id=user.id,
        role=OrganizationUserRole.ADMIN,
    )
    db.add(membership)
    db.commit()

    return user

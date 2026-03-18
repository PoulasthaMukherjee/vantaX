# Vibe Platform - Developer Implementation Guide

**For:** Dev Team (2 beginner developers)
**From:** Principal Engineer
**Last Updated:** December 2025

---

## How to Use This Document

This is your primary reference for building Vibe. Read it top-to-bottom once, then use it as a lookup guide while coding.

**Document Structure:**
1. Project Setup & Local Development
2. Sprint-by-Sprint Implementation Plan
3. Deep Dive: Backend Implementation
4. Deep Dive: Frontend Implementation
5. Deep Dive: Worker Implementation
6. Testing Requirements
7. Common Pitfalls & How to Avoid Them
8. Code Review Checklist

**Cross-References (all at repo root):**
- `architecture-decisions.md` - WHY we made each decision
- `database-schema.md` - Complete SQL schema
- `epics-user-stories.md` - Acceptance criteria for each feature

> **Note:** These docs live at the repository root, not in a `docs/` subfolder.

---

## Part 1: Project Setup & Local Development

### 1.1 Repository Structure

We're using a monorepo. Create this structure:

```
vibe/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app entry point
│   │   ├── config.py        # Settings & env vars
│   │   ├── database.py      # DB connection & session
│   │   ├── dependencies.py  # Shared FastAPI dependencies
│   │   │
│   │   ├── models/          # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── organization.py
│   │   │   ├── assessment.py
│   │   │   ├── submission.py
│   │   │   └── ...
│   │   │
│   │   ├── schemas/         # Pydantic schemas (request/response)
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── assessment.py
│   │   │   └── ...
│   │   │
│   │   ├── api/             # API routes
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py      # Main router that includes all sub-routers
│   │   │   │   ├── auth.py
│   │   │   │   ├── profile.py
│   │   │   │   ├── assessments.py
│   │   │   │   ├── submissions.py
│   │   │   │   └── admin/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── candidates.py
│   │   │   │       ├── assessments.py
│   │   │   │       └── ...
│   │   │
│   │   ├── services/        # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── profile.py
│   │   │   ├── assessment.py
│   │   │   ├── submission.py
│   │   │   ├── scoring.py
│   │   │   ├── points.py
│   │   │   ├── github.py
│   │   │   ├── email.py
│   │   │   └── llm.py
│   │   │
│   │   ├── worker/          # RQ worker code
│   │   │   ├── __init__.py
│   │   │   ├── main.py      # Worker entry point
│   │   │   ├── jobs.py      # Job definitions
│   │   │   └── tasks/
│   │   │       ├── clone.py
│   │   │       ├── score.py
│   │   │       └── cleanup.py
│   │   │
│   │   └── utils/           # Shared utilities
│   │       ├── __init__.py
│   │       ├── security.py
│   │       ├── pagination.py
│   │       └── exceptions.py
│   │
│   ├── tests/
│   │   ├── conftest.py      # Pytest fixtures
│   │   ├── test_auth.py
│   │   ├── test_submissions.py
│   │   └── ...
│   │
│   ├── alembic/             # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   │
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   └── pyproject.toml
│
├── frontend/                # React application
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── lib/
│   │   └── types/
│   │
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── architecture-decisions.md   # Architecture docs (at root)
├── database-schema.md
├── epics-user-stories.md
├── IMPLEMENTATION-GUIDE.md     # This file
├── DEV-CHECKLIST.md            # Quick reference checklists
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── docker-compose.yml       # Local development
├── .env.example
└── README.md
```

### 1.2 Local Development Setup

**Prerequisites:**
- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- Git

**Step 1: Clone and setup environment**

```bash
# Clone repo
git clone <repo-url>
cd vibe

# Copy environment file
cp .env.example .env
# Fill in the values (see below)
```

**Step 2: Create `.env` file**

```bash
# .env - Local Development

# Database
DATABASE_URL=postgresql://vibe:vibe@localhost:5432/vibe_dev

# Redis
REDIS_URL=redis://localhost:6379/0

# Firebase (get from Firebase Console)
FIREBASE_PROJECT_ID=vibe-dev
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}

# Groq (get from console.groq.com)
GROQ_API_KEY=gsk_xxxxxxxxxxxxx

# App settings
ENV=development
SECRET_KEY=dev-secret-key-change-in-prod
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# GCS (optional for local - can use local filesystem)
GCS_BUCKET_NAME=vibecoding-resumes-dev
GCS_CREDENTIALS_JSON={}
```

**Step 3: Start infrastructure with Docker Compose**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: vibe
      POSTGRES_PASSWORD: vibe
      POSTGRES_DB: vibe_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vibe"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

```bash
# Start Postgres and Redis
docker-compose up -d

# Verify they're running
docker-compose ps
```

**Step 4: Setup backend**

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run migrations
alembic upgrade head

# Seed initial data (we'll create this script)
python -m app.scripts.seed

# Start API server
uvicorn app.main:app --reload --port 8000
```

**Step 5: Setup frontend**

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Step 6: Start worker (separate terminal)**

```bash
cd backend
source venv/bin/activate

# Start RQ worker
python -m app.worker.main
```

**You should now have:**
- API running at http://localhost:8000
- Frontend at http://localhost:5173
- API docs at http://localhost:8000/docs

---

## Part 2: Sprint-by-Sprint Implementation Plan

We're doing 2-week sprints. Here's the breakdown with task ownership.

### Sprint 1: Foundation (Weeks 1-2)

**Goal:** Users can register, login, and view their empty dashboard.

> **IMPORTANT: Auth Architecture**
> - **Firebase handles ALL auth flows**: registration, login, password reset, email verification
> - **Backend does NOT have register/login endpoints** - it only verifies Firebase ID tokens
> - **Frontend uses Firebase SDK** for auth UI and token management
> - **Backend `/auth/me` endpoint**: verifies token, upserts user record, returns user info

| Task | Owner | Dependencies | Est. Hours |
|------|-------|--------------|------------|
| 1.1 Setup repo structure | Dev A | None | 4 |
| 1.2 Backend: Database models (users, orgs, memberships) | Dev A | 1.1 | 8 |
| 1.3 Backend: Alembic migrations setup | Dev A | 1.2 | 4 |
| 1.4 Backend: Firebase token verification service | Dev A | 1.2 | 6 |
| 1.5 Backend: `/auth/me` endpoint (verify token, upsert user) | Dev A | 1.4 | 4 |
| 1.6 Backend: Seed script (default org + admin user) | Dev A | 1.3 | 4 |
| 1.7 Frontend: Project setup (Vite, Tailwind, React Query) | Dev B | None | 4 |
| 1.8 Frontend: Firebase SDK setup & auth context | Dev B | 1.7 | 8 |
| 1.9 Frontend: Login & Register pages (Firebase UI) | Dev B | 1.8 | 6 |
| 1.10 Frontend: Protected routes & layout | Dev B | 1.9 | 6 |
| 1.11 Frontend: Empty dashboard page | Dev B | 1.10 | 4 |
| 1.12 Integration testing | Both | All above | 6 |

**Deliverable:** A user can register (Firebase), verify email (Firebase), login (Firebase), and see their dashboard.

---

### Sprint 2: Profile & Organizations (Weeks 3-4)

**Goal:** Multi-tenant org support. Users have profiles and can earn points.

| Task | Owner | Dependencies | Est. Hours |
|------|-------|--------------|------------|
| 2.1 Backend: Organization & membership models | Dev A | Sprint 1 | 6 |
| 2.2 Backend: Org context middleware (X-Organization-Id) | Dev A | 2.1 | 6 |
| 2.3 Backend: Candidate profile endpoints (GET/PUT) | Dev A | 2.2 | 6 |
| 2.4 Backend: Resume upload to GCS | Dev A | 2.3 | 6 |
| 2.5 Backend: Points service & logging | Dev A | 2.3 | 6 |
| 2.6 Frontend: Org switcher component | Dev B | 2.2 | 6 |
| 2.7 Frontend: Profile page (view & edit) | Dev B | 2.3 | 8 |
| 2.8 Frontend: Resume upload component | Dev B | 2.4 | 6 |
| 2.9 Frontend: Points display & history | Dev B | 2.5 | 4 |
| 2.10 Backend: Profile validation (GitHub URL check) | Dev A | 2.3 | 4 |
| 2.11 Integration testing | Both | All above | 6 |

**Deliverable:** Users belong to orgs. They can complete profiles and earn points.

---

### Sprint 3: Assessments (Weeks 5-6)

**Goal:** Admins can create assessments. Candidates can view them.

| Task | Owner | Dependencies | Est. Hours |
|------|-------|--------------|------------|
| 3.1 Backend: Assessment model with rubric weights | Dev A | Sprint 2 | 6 |
| 3.2 Backend: Admin assessment CRUD endpoints | Dev A | 3.1 | 8 |
| 3.3 Backend: Candidate assessment list endpoint | Dev A | 3.1 | 4 |
| 3.4 Backend: Assessment visibility logic | Dev A | 3.1 | 4 |
| 3.5 Backend: Assessment invite model & endpoints | Dev A | 3.4 | 6 |
| 3.6 Frontend: Admin layout & sidebar | Dev B | Sprint 2 | 6 |
| 3.7 Frontend: Admin assessment list page | Dev B | 3.2 | 6 |
| 3.8 Frontend: Admin assessment form (create/edit) | Dev B | 3.2 | 10 |
| 3.9 Frontend: Candidate assessment list page | Dev B | 3.3 | 6 |
| 3.10 Frontend: Assessment detail page | Dev B | 3.3 | 6 |
| 3.11 Integration testing | Both | All above | 6 |

**Deliverable:** Admins create assessments with custom rubrics. Candidates browse active assessments.

---

### Sprint 4: Submissions & Scoring (Weeks 7-8)

**Goal:** Core feature - candidates submit, worker scores.

| Task | Owner | Dependencies | Est. Hours |
|------|-------|--------------|------------|
| 4.1 Backend: Submission model & status enum | Dev A | Sprint 3 | 4 |
| 4.2 Backend: GitHub validation service | Dev A | 4.1 | 8 |
| 4.3 Backend: Submit endpoint (validate + enqueue) | Dev A | 4.2 | 8 |
| 4.4 Worker: RQ setup & job structure | Dev A | 4.3 | 6 |
| 4.5 Worker: GitHub clone task | Dev A | 4.4 | 8 |
| 4.6 Worker: File collection & filtering | Dev A | 4.5 | 6 |
| 4.7 Worker: LLM scoring service (Groq) | Dev A | 4.6 | 10 |
| 4.8 Worker: Score persistence & status updates | Dev A | 4.7 | 6 |
| 4.9 Frontend: Submit assessment form | Dev B | 4.3 | 8 |
| 4.10 Frontend: Submission status page (polling) | Dev B | 4.8 | 8 |
| 4.11 Frontend: Score display component | Dev B | 4.8 | 6 |
| 4.12 Integration & E2E testing | Both | All above | 10 |

**Deliverable:** End-to-end flow works. Candidate submits, worker scores, candidate sees result.

---

### Sprint 5: Admin Dashboard & Polish (Weeks 9-10)

**Goal:** Admin visibility. Error handling. Production readiness.

| Task | Owner | Dependencies | Est. Hours |
|------|-------|--------------|------------|
| 5.1 Backend: Admin candidates list endpoint | Dev A | Sprint 4 | 6 |
| 5.2 Backend: Admin submissions list + filters | Dev A | 5.1 | 6 |
| 5.3 Backend: Admin override/reset actions | Dev A | 5.2 | 6 |
| 5.4 Backend: Queue status endpoint | Dev A | 5.3 | 4 |
| 5.5 Backend: Activity & audit logging | Dev A | 5.4 | 6 |
| 5.6 Frontend: Admin dashboard stats cards | Dev B | 5.1 | 6 |
| 5.7 Frontend: Admin candidates page | Dev B | 5.1 | 8 |
| 5.8 Frontend: Admin submissions page | Dev B | 5.2 | 8 |
| 5.9 Frontend: Admin actions (override, reset) | Dev B | 5.3 | 6 |
| 5.10 Frontend: Error handling & toasts | Dev B | All | 6 |
| 5.11 Production deployment setup | Both | All | 8 |

**Deliverable:** Admins can manage candidates and submissions. App is production-ready.

---

## Part 3: Deep Dive - Backend Implementation

### 3.1 Database Models with SQLAlchemy

**Key Principles:**
1. Every model that belongs to a tenant has `organization_id`
2. Use UUID primary keys everywhere
3. Include `created_at` and `updated_at` on all models
4. Use enums from `database-schema.md`

**Example: User and Organization models**

```python
# app/models/user.py
from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.database import Base


class User(Base):
    """
    Global user identity. Linked to Firebase auth.
    Users can belong to multiple organizations via OrganizationUser.
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255))
    email_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization_memberships = relationship("OrganizationUser", back_populates="user")


# app/models/organization.py
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SQLEnum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.database import Base


class OrganizationStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class OrganizationPlan(str, enum.Enum):
    FREE = "free"
    PRO = "pro"


class Organization(Base):
    """
    Top-level tenant. All business data is scoped to an organization.
    """
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(SQLEnum(OrganizationStatus), default=OrganizationStatus.ACTIVE, nullable=False)
    plan = Column(SQLEnum(OrganizationPlan), default=OrganizationPlan.FREE, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    members = relationship("OrganizationUser", back_populates="organization")
    assessments = relationship("Assessment", back_populates="organization")
```

**Example: Organization Membership (junction table)**

```python
# app/models/organization_user.py
from sqlalchemy import Column, DateTime, ForeignKey, Enum as SQLEnum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class OrganizationUserRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    REVIEWER = "reviewer"
    CANDIDATE = "candidate"


class OrganizationUser(Base):
    """
    Membership linking users to organizations with a specific role.
    One user can be in multiple orgs. One org can have multiple users.
    """
    __tablename__ = "organization_users"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )
    role = Column(SQLEnum(OrganizationUserRole), default=OrganizationUserRole.CANDIDATE, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="organization_memberships")
```

---

### 3.2 Organization Context Middleware

This is CRITICAL for multi-tenancy. Every request must include which org the user is operating in.

```python
# app/dependencies.py
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.services.auth import get_current_user
from app.models.user import User


async def get_organization_id(
    x_organization_id: str = Header(..., description="Current organization context")
) -> UUID:
    """
    Extract organization ID from request header.
    This header is REQUIRED for all org-scoped endpoints.
    """
    try:
        return UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_ORG_ID", "message": "Invalid organization ID format"}
        )


async def get_current_org(
    org_id: UUID = Depends(get_organization_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Organization:
    """
    Validate that:
    1. Organization exists
    2. Organization is active
    3. Current user is a member of this organization

    Returns the Organization object for use in endpoints.
    """
    # Check membership
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == current_user.id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_ORG_MEMBER", "message": "You are not a member of this organization"}
        )

    # Get organization
    org = db.query(Organization).filter(Organization.id == org_id).first()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ORG_NOT_FOUND", "message": "Organization not found"}
        )

    if org.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ORG_SUSPENDED", "message": "This organization is suspended"}
        )

    return org


async def get_current_membership(
    org_id: UUID = Depends(get_organization_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> OrganizationUser:
    """
    Get the current user's membership in the organization.
    Useful when you need to check role.
    """
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == current_user.id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_ORG_MEMBER", "message": "You are not a member of this organization"}
        )

    return membership


def require_role(*allowed_roles: str):
    """
    Dependency factory that checks if user has one of the allowed roles.

    Usage:
        @router.post("/admin/assessments")
        async def create_assessment(
            membership: OrganizationUser = Depends(require_role("owner", "admin"))
        ):
            ...
    """
    async def role_checker(
        membership: OrganizationUser = Depends(get_current_membership)
    ) -> OrganizationUser:
        if membership.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_ROLE",
                    "message": f"This action requires one of these roles: {', '.join(allowed_roles)}"
                }
            )
        return membership

    return role_checker
```

**How to use in endpoints:**

```python
# app/api/v1/assessments.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org, require_role
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser

router = APIRouter(prefix="/assessments", tags=["assessments"])


@router.get("/")
async def list_assessments(
    org: Organization = Depends(get_current_org),  # Validates org context
    db: Session = Depends(get_db)
):
    """
    List all active assessments in the organization.
    Any org member can view.
    """
    assessments = db.query(Assessment).filter(
        Assessment.organization_id == org.id,  # ALWAYS filter by org!
        Assessment.status == "published"
    ).all()
    return {"success": True, "data": assessments}


@router.post("/")
async def create_assessment(
    data: AssessmentCreate,
    membership: OrganizationUser = Depends(require_role("owner", "admin")),  # Role check
    db: Session = Depends(get_db)
):
    """
    Create a new assessment. Only admins and owners can do this.
    """
    assessment = Assessment(
        organization_id=membership.organization_id,  # Use org from membership
        created_by=membership.user_id,
        **data.dict()
    )
    db.add(assessment)
    db.commit()
    return {"success": True, "data": assessment}
```

---

### 3.2.5 Database Seeding (Default Org & Admin)

> **IMPORTANT:** Every deployment needs a default organization and admin user.
> Tests also require org fixtures. This seed script must run after migrations.

```python
# app/scripts/seed.py
"""
Database seeding script. Run with: python -m app.scripts.seed

Creates:
1. Default organization
2. Initial admin user (linked to Firebase UID from env)
3. Test data for development (optional)
"""
import os
import sys
from uuid import uuid4

from app.database import SessionLocal, engine
from app.models import Base
from app.models.user import User
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_user import OrganizationUser, OrganizationUserRole


def seed_default_org(db):
    """Create default organization if it doesn't exist."""
    existing = db.query(Organization).filter(Organization.slug == "default").first()
    if existing:
        print(f"Default org already exists: {existing.id}")
        return existing

    org = Organization(
        id=uuid4(),
        name="Default Organization",
        slug="default",
        status=OrganizationStatus.ACTIVE,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    print(f"Created default org: {org.id}")
    return org


def seed_admin_user(db, org):
    """
    Create initial admin user.

    Requires SEED_ADMIN_FIREBASE_UID and SEED_ADMIN_EMAIL env vars.
    """
    firebase_uid = os.getenv("SEED_ADMIN_FIREBASE_UID")
    email = os.getenv("SEED_ADMIN_EMAIL")

    if not firebase_uid or not email:
        print("Skipping admin seed: SEED_ADMIN_FIREBASE_UID and SEED_ADMIN_EMAIL not set")
        return None

    # Check if user exists
    existing = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    if existing:
        print(f"Admin user already exists: {existing.id}")
        # Ensure they're org owner
        membership = db.query(OrganizationUser).filter(
            OrganizationUser.user_id == existing.id,
            OrganizationUser.organization_id == org.id
        ).first()
        if not membership:
            membership = OrganizationUser(
                organization_id=org.id,
                user_id=existing.id,
                role=OrganizationUserRole.OWNER
            )
            db.add(membership)
            db.commit()
        return existing

    # Create new admin user
    user = User(
        id=uuid4(),
        firebase_uid=firebase_uid,
        email=email,
        name="Admin",
        email_verified=True
    )
    db.add(user)
    db.commit()

    # Add as org owner
    membership = OrganizationUser(
        organization_id=org.id,
        user_id=user.id,
        role=OrganizationUserRole.OWNER
    )
    db.add(membership)
    db.commit()

    print(f"Created admin user: {user.id} ({email})")
    return user


def main():
    print("Starting database seed...")

    db = SessionLocal()
    try:
        # Create default org
        org = seed_default_org(db)

        # Create admin user
        seed_admin_user(db, org)

        print("Seed complete!")

    finally:
        db.close()


if __name__ == "__main__":
    main()
```

**Environment Variables for Seeding:**

```bash
# .env - Required for seed script
SEED_ADMIN_FIREBASE_UID=your-firebase-uid   # Get from Firebase Console > Users
SEED_ADMIN_EMAIL=admin@yourcompany.com
```

**Run seed after migrations:**

```bash
# After alembic upgrade head
python -m app.scripts.seed
```

**Test Fixtures Must Include Org:**

```python
# tests/conftest.py - All fixtures must have org context

@pytest.fixture
def test_org(db):
    """Create test org - REQUIRED for all org-scoped tests."""
    org = Organization(name="Test Org", slug=f"test-{uuid4().hex[:8]}")
    db.add(org)
    db.commit()
    return org

@pytest.fixture
def test_user_with_org(db, test_org):
    """Create user WITH org membership - use this, not bare test_user."""
    user = User(firebase_uid=f"test-{uuid4().hex}", email=f"test-{uuid4().hex}@test.com")
    db.add(user)
    db.commit()

    membership = OrganizationUser(
        organization_id=test_org.id,
        user_id=user.id,
        role=OrganizationUserRole.CANDIDATE
    )
    db.add(membership)
    db.commit()

    return user

@pytest.fixture
def auth_headers(test_user_with_org, test_org, mocker):
    """Auth headers WITH X-Organization-Id - ALWAYS use this."""
    mocker.patch(
        "app.services.auth.firebase_auth.verify_id_token",
        return_value={"uid": test_user_with_org.firebase_uid, "email": test_user_with_org.email}
    )
    return {
        "Authorization": "Bearer fake-token",
        "X-Organization-Id": str(test_org.id)  # REQUIRED for all org-scoped endpoints
    }
```

---

### 3.3 Firebase Authentication Service

```python
# app/services/auth.py
import os
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User


# Initialize Firebase Admin SDK (do this once at startup)
if not firebase_admin._apps:
    cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if cred_json:
        import json
        cred_dict = json.loads(cred_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    else:
        # For development, can use default credentials or project ID
        firebase_admin.initialize_app()


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Validate Firebase ID token and return the corresponding User.

    This is called on every authenticated request.
    """
    token = credentials.credentials

    try:
        # Verify the Firebase ID token
        decoded_token = firebase_auth.verify_id_token(token)
        firebase_uid = decoded_token["uid"]
        email = decoded_token.get("email")
        email_verified = decoded_token.get("email_verified", False)

    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_TOKEN_INVALID", "message": "Invalid authentication token"}
        )
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_TOKEN_EXPIRED", "message": "Token has expired, please login again"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_ERROR", "message": str(e)}
        )

    # Find or create user in our database
    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()

    if not user:
        # First time login - create user record
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            email_verified=email_verified
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update email_verified status if changed in Firebase
        if user.email_verified != email_verified:
            user.email_verified = email_verified
            db.commit()

    return user


async def get_current_verified_user(
    user: User = Depends(get_current_user)
) -> User:
    """
    Same as get_current_user but requires email to be verified.
    Use this for sensitive actions like submissions.
    """
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Please verify your email before continuing"}
        )
    return user
```

---

### 3.4 GitHub Validation Service

**Before accepting a submission, we validate the GitHub repo.**

Reference: `architecture-decisions.md` Section 4.

> **SECURITY: SSRF Protection**
> We MUST prevent Server-Side Request Forgery (SSRF) attacks where a malicious user could
> trick our server into making requests to internal services. Key protections:
> - Only accept `https://github.com/` URLs (enforced by regex)
> - Block any URL that resolves to private/internal IP ranges
> - Never follow redirects to non-GitHub hosts

```python
# app/services/github.py
import re
import httpx
import ipaddress
import socket
from typing import Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass
class GitHubRepoInfo:
    owner: str
    repo: str
    default_branch: str
    is_public: bool
    size_kb: int
    has_code_files: bool


class GitHubValidationError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


# Supported code file extensions (from architecture-decisions.md)
CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rb", ".php", ".cs"}

# GitHub URL pattern - MUST be https://github.com only
GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/(?P<owner>[a-zA-Z0-9_-]+)/(?P<repo>[a-zA-Z0-9_.-]+)/?$"
)

# SSRF Protection: Private/internal IP ranges to block
BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("10.0.0.0/8"),        # Private Class A
    ipaddress.ip_network("172.16.0.0/12"),     # Private Class B
    ipaddress.ip_network("192.168.0.0/16"),    # Private Class C
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 private
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
]


def is_safe_url(url: str) -> bool:
    """
    Check if URL is safe to fetch (not pointing to internal services).

    SSRF protection: reject URLs that could resolve to private IPs.
    """
    parsed = urlparse(url)

    # Must be HTTPS
    if parsed.scheme != "https":
        return False

    # Must be github.com
    if parsed.hostname != "github.com":
        return False

    # Resolve hostname and check IP isn't private
    try:
        ip_str = socket.gethostbyname(parsed.hostname)
        ip = ipaddress.ip_address(ip_str)

        for network in BLOCKED_IP_NETWORKS:
            if ip in network:
                return False
    except socket.gaierror:
        # DNS resolution failed - reject to be safe
        return False

    return True


async def validate_github_url(url: str) -> GitHubRepoInfo:
    """
    Validate a GitHub repository URL.

    Checks:
    1. URL format is valid (HTTPS github.com only)
    2. URL is safe (SSRF protection)
    3. Repository exists
    4. Repository is public
    5. Repository has supported code files

    Raises GitHubValidationError on failure.
    """
    # Step 0: SSRF protection - verify URL is safe before ANY network call
    if not is_safe_url(url):
        raise GitHubValidationError(
            "INVALID_REPO_URL",
            "URL must be a valid https://github.com repository URL"
        )

    # Step 1: Parse URL
    match = GITHUB_URL_PATTERN.match(url.rstrip("/"))
    if not match:
        raise GitHubValidationError(
            "INVALID_REPO_URL",
            "Invalid GitHub repository URL format. Expected: https://github.com/owner/repo"
        )

    owner = match.group("owner")
    repo = match.group("repo")

    # Remove .git suffix if present
    if repo.endswith(".git"):
        repo = repo[:-4]

    async with httpx.AsyncClient() as client:
        # Step 2: Check repo exists and get metadata
        try:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0
            )
        except httpx.TimeoutException:
            raise GitHubValidationError(
                "GITHUB_TIMEOUT",
                "Could not reach GitHub. Please try again."
            )

        if response.status_code == 404:
            raise GitHubValidationError(
                "REPO_NOT_FOUND",
                "Repository not found. Make sure the URL is correct and the repo is public."
            )

        if response.status_code == 403:
            raise GitHubValidationError(
                "GITHUB_RATE_LIMIT",
                "GitHub rate limit exceeded. Please try again in a few minutes."
            )

        if response.status_code != 200:
            raise GitHubValidationError(
                "GITHUB_ERROR",
                f"GitHub returned an error: {response.status_code}"
            )

        data = response.json()

        # Step 3: Check if public
        if data.get("private", True):
            raise GitHubValidationError(
                "REPO_NOT_PUBLIC",
                "Repository must be public. Private repositories are not supported."
            )

        # Step 4: Check repo size (soft limit 50MB, hard limit 100MB)
        size_kb = data.get("size", 0)
        if size_kb > 100_000:  # 100MB in KB
            raise GitHubValidationError(
                "REPO_TOO_LARGE",
                f"Repository is too large ({size_kb // 1000}MB). Maximum size is 100MB."
            )

        default_branch = data.get("default_branch", "main")

        # Step 5: Check for code files
        try:
            contents_response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0
            )
            contents = contents_response.json()

            has_code = False
            if isinstance(contents, list):
                for item in contents:
                    if item.get("type") == "file":
                        name = item.get("name", "")
                        ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
                        if ext.lower() in CODE_EXTENSIONS:
                            has_code = True
                            break
                    # If there are directories, assume there might be code inside
                    elif item.get("type") == "dir":
                        has_code = True  # We'll verify during clone
                        break

        except Exception:
            # If we can't list contents, we'll discover during clone
            has_code = True

        if not has_code:
            raise GitHubValidationError(
                "NO_CODE_FILES",
                f"No supported code files found. Supported: {', '.join(CODE_EXTENSIONS)}"
            )

        return GitHubRepoInfo(
            owner=owner,
            repo=repo,
            default_branch=default_branch,
            is_public=True,
            size_kb=size_kb,
            has_code_files=has_code
        )
```

---

### 3.5 Submission Endpoint

```python
# app/api/v1/submissions.py
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.dependencies import get_current_org, get_current_membership
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.submission import Submission, SubmissionStatus
from app.models.assessment import Assessment
from app.schemas.submission import SubmissionCreate, SubmissionResponse
from app.services.github import validate_github_url, GitHubValidationError
from app.services.auth import get_current_verified_user
from app.models.user import User
from app.worker.jobs import enqueue_scoring_job

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("/", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    data: SubmissionCreate,
    org: Organization = Depends(get_current_org),
    current_user: User = Depends(get_current_verified_user),  # Must verify email
    db: Session = Depends(get_db)
):
    """
    Submit a solution for an assessment.

    Flow:
    1. Validate assessment exists and is active
    2. Check user hasn't already submitted (one attempt rule)
    3. Validate GitHub URL (public, has code, not too large)
    4. Create submission record
    5. Enqueue scoring job
    """
    # Step 1: Check assessment exists and is accessible
    assessment = db.query(Assessment).filter(
        Assessment.id == data.assessment_id,
        Assessment.organization_id == org.id,
        Assessment.status == "published"
    ).first()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSESSMENT_NOT_FOUND", "message": "Assessment not found or not active"}
        )

    # Check visibility (invite-only requires invite)
    if assessment.visibility == "invite_only":
        # TODO: Check if user has invite - implement in Sprint 3
        pass

    # Step 2: Check for existing submission
    existing = db.query(Submission).filter(
        Submission.organization_id == org.id,
        Submission.candidate_id == current_user.id,
        Submission.assessment_id == data.assessment_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_SUBMITTED",
                "message": "You have already submitted for this assessment. Only one attempt is allowed."
            }
        )

    # Step 3: Validate GitHub URL
    try:
        repo_info = await validate_github_url(data.github_repo_url)
    except GitHubValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": e.code, "message": e.message}
        )

    # Step 4: Create submission
    submission = Submission(
        organization_id=org.id,
        candidate_id=current_user.id,
        assessment_id=data.assessment_id,
        github_repo_url=data.github_repo_url,
        explanation_text=data.explanation_text,
        status=SubmissionStatus.SUBMITTED
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Step 5: Enqueue scoring job
    job_id = enqueue_scoring_job(
        submission_id=str(submission.id),
        organization_id=str(org.id),
        assessment_id=str(data.assessment_id),
        github_repo_url=data.github_repo_url,
        explanation_text=data.explanation_text,
        # Include assessment context for worker efficiency
        assessment_context={
            "title": assessment.title,
            "problem_statement": assessment.problem_statement,
            "acceptance_criteria": assessment.acceptance_criteria,
            "weights": {
                "correctness": assessment.weight_correctness,
                "quality": assessment.weight_quality,
                "readability": assessment.weight_readability,
                "robustness": assessment.weight_robustness,
                "clarity": assessment.weight_clarity,
                "depth": assessment.weight_depth,
                "structure": assessment.weight_structure,
            }
        }
    )

    # Update submission with job info
    submission.job_id = job_id
    submission.status = SubmissionStatus.QUEUED
    db.commit()

    return {
        "success": True,
        "data": {
            "id": submission.id,
            "status": submission.status.value,
            "message": "Submission received. Scoring will begin shortly."
        }
    }


@router.get("/{submission_id}/status")
async def get_submission_status(
    submission_id: UUID,
    org: Organization = Depends(get_current_org),
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db)
):
    """
    Get current status of a submission. Used for polling during scoring.
    """
    submission = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.organization_id == org.id,
        Submission.candidate_id == current_user.id  # Only owner can check
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBMISSION_NOT_FOUND", "message": "Submission not found"}
        )

    response_data = {
        "status": submission.status.value,
    }

    # Add score if evaluated
    if submission.status == SubmissionStatus.EVALUATED:
        response_data["final_score"] = float(submission.final_score)
        response_data["passed"] = submission.final_score >= 70

    # Add error if failed
    if submission.status in [SubmissionStatus.CLONE_FAILED, SubmissionStatus.SCORE_FAILED]:
        response_data["error_message"] = submission.error_message

    return {"success": True, "data": response_data}
```

---

## Part 4: Deep Dive - Worker Implementation

The worker is the most complex part. It runs separately from the API.

### 4.1 Worker Entry Point

```python
# app/worker/main.py
"""
Worker entry point. Run with: python -m app.worker.main
"""
import os
import redis
from rq import Worker, Queue, Connection

from app.config import settings
from app.database import engine  # Import to initialize DB connection


def run_worker():
    """Start the RQ worker."""
    redis_conn = redis.from_url(settings.REDIS_URL)

    with Connection(redis_conn):
        queues = [Queue("scoring")]
        worker = Worker(queues)
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    print("Starting Vibe scoring worker...")
    run_worker()
```

### 4.2 Job Definitions

```python
# app/worker/jobs.py
from rq import Queue
import redis
from typing import Dict, Any
from uuid import uuid4

from app.config import settings


def get_queue():
    """Get the scoring queue."""
    redis_conn = redis.from_url(settings.REDIS_URL)
    return Queue("scoring", connection=redis_conn)


def enqueue_scoring_job(
    submission_id: str,
    organization_id: str,
    assessment_id: str,
    github_repo_url: str,
    explanation_text: str,
    assessment_context: Dict[str, Any]
) -> str:
    """
    Enqueue a scoring job for a submission.

    Returns the job ID.
    """
    queue = get_queue()

    job = queue.enqueue(
        "app.worker.tasks.score.score_submission",  # Function path
        kwargs={
            "submission_id": submission_id,
            "organization_id": organization_id,
            "assessment_id": assessment_id,
            "github_repo_url": github_repo_url,
            "explanation_text": explanation_text,
            "assessment_context": assessment_context,
        },
        job_id=str(uuid4()),
        job_timeout=180,  # 3 minutes max
        result_ttl=86400,  # Keep result for 24 hours
        failure_ttl=2592000,  # Keep failures for 30 days
    )

    return job.id
```

### 4.3 Scoring Task (Main Worker Logic)

This is the heart of the system. Reference `architecture-decisions.md` Section 5 and 6.

```python
# app/worker/tasks/score.py
"""
Main scoring task. This runs in the worker process.
"""
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import json

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.submission import Submission, SubmissionStatus
from app.models.ai_score import AIScore
from app.models.llm_usage_log import LLMUsageLog
from app.services.llm import call_groq_for_scoring, LLMError
from app.worker.tasks.clone import clone_repository, CloneError
from app.worker.tasks.files import collect_code_files, FileCollectionResult


# Configuration (from architecture-decisions.md)
MAX_FILES = 40
MAX_FILE_SIZE_KB = 200
CLONE_TIMEOUT = 45
JOB_TIMEOUT = 180

# Directories to ignore
IGNORE_DIRS = {
    "node_modules", "venv", ".git", "dist", "build", ".next",
    "__pycache__", ".idea", ".vscode", "coverage", ".nyc_output", "vendor"
}

# File extensions to include
CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rb", ".php", ".cs"}


def score_submission(
    submission_id: str,
    organization_id: str,
    assessment_id: str,
    github_repo_url: str,
    explanation_text: str,
    assessment_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Main scoring function. Called by RQ worker.

    Steps:
    1. Clone the repository
    2. Collect relevant code files
    3. Call LLM for scoring
    4. Save scores to database
    5. Update submission status
    6. Cleanup temporary files
    """
    db = SessionLocal()

    try:
        # Get submission record
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        # Update status to CLONING
        submission.status = SubmissionStatus.CLONING
        submission.clone_started_at = datetime.utcnow()
        db.commit()

        # Step 1: Clone repository
        try:
            clone_result = clone_repository(github_repo_url, timeout=CLONE_TIMEOUT)
            clone_path = clone_result.path
            submission.commit_sha = clone_result.commit_sha
            submission.clone_completed_at = datetime.utcnow()
            db.commit()
        except CloneError as e:
            submission.status = SubmissionStatus.CLONE_FAILED
            submission.error_message = str(e)
            submission.retry_count += 1
            db.commit()

            # Retry once for transient errors
            if submission.retry_count < 2 and e.is_retryable:
                raise  # RQ will retry
            return {"error": str(e), "status": "CLONE_FAILED"}

        # Step 2: Collect code files
        try:
            file_result = collect_code_files(
                clone_path,
                extensions=CODE_EXTENSIONS,
                ignore_dirs=IGNORE_DIRS,
                max_files=MAX_FILES,
                max_file_size_kb=MAX_FILE_SIZE_KB
            )
            submission.analyzed_files = json.dumps(file_result.files_analyzed)
            db.commit()
        finally:
            # Cleanup clone directory (always, even on error)
            if clone_path and os.path.exists(clone_path):
                shutil.rmtree(clone_path, ignore_errors=True)

        # Step 3: Update status to SCORING
        submission.status = SubmissionStatus.SCORING
        submission.job_started_at = datetime.utcnow()
        db.commit()

        # Step 4: Call LLM for scoring
        try:
            llm_result = call_groq_for_scoring(
                code_content=file_result.concatenated_content,
                explanation=explanation_text,
                assessment_context=assessment_context
            )
        except LLMError as e:
            submission.status = SubmissionStatus.SCORE_FAILED
            submission.error_message = str(e)
            submission.retry_count += 1
            db.commit()

            # Log LLM usage even on failure
            log_llm_usage(db, submission_id, organization_id, e.usage_info, success=False, error_type=e.error_type)

            if submission.retry_count < 3 and e.is_retryable:
                raise  # RQ will retry
            return {"error": str(e), "status": "SCORE_FAILED"}

        # Log successful LLM usage
        log_llm_usage(db, submission_id, organization_id, llm_result.usage_info, success=True)

        # Step 5: Save scores
        ai_score = AIScore(
            organization_id=organization_id,
            submission_id=submission_id,
            code_correctness=llm_result.scores["code_correctness"],
            code_quality=llm_result.scores["code_quality"],
            code_readability=llm_result.scores["code_readability"],
            code_robustness=llm_result.scores["code_robustness"],
            reasoning_clarity=llm_result.scores["reasoning_clarity"],
            reasoning_depth=llm_result.scores["reasoning_depth"],
            reasoning_structure=llm_result.scores["reasoning_structure"],
            overall_comment=llm_result.overall_comment,
            raw_response=llm_result.raw_response
        )
        db.add(ai_score)

        # Step 6: Calculate final score
        weights = assessment_context["weights"]
        final_score = calculate_final_score(llm_result.scores, weights)

        # Step 7: Update submission
        submission.status = SubmissionStatus.EVALUATED
        submission.final_score = final_score
        submission.evaluated_at = datetime.utcnow()
        submission.job_completed_at = datetime.utcnow()
        db.commit()

        # Step 8: Award points if passed
        if final_score >= 70:
            award_assessment_points(db, submission_id, organization_id, final_score)

        return {
            "status": "EVALUATED",
            "final_score": final_score,
            "submission_id": submission_id
        }

    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


def calculate_final_score(scores: Dict[str, int], weights: Dict[str, int]) -> float:
    """
    Calculate weighted final score.

    Each dimension score is 1-10.
    Each weight is a percentage (should sum to 100).

    Formula: sum((score / 10) * 100 * (weight / 100))
    Simplified: sum(score * weight) / 10
    """
    total = 0
    for dimension, weight_key in [
        ("code_correctness", "correctness"),
        ("code_quality", "quality"),
        ("code_readability", "readability"),
        ("code_robustness", "robustness"),
        ("reasoning_clarity", "clarity"),
        ("reasoning_depth", "depth"),
        ("reasoning_structure", "structure"),
    ]:
        score = scores.get(dimension, 5)  # Default to 5 if missing
        weight = weights.get(weight_key, 0)
        total += score * weight

    return round(total / 10, 2)  # Divide by 10 to get 0-100 scale


def log_llm_usage(
    db: Session,
    submission_id: str,
    organization_id: str,
    usage_info: Dict[str, Any],
    success: bool,
    error_type: Optional[str] = None
):
    """Log LLM API usage for cost tracking."""
    log = LLMUsageLog(
        organization_id=organization_id,
        submission_id=submission_id,
        model=usage_info.get("model", "unknown"),
        prompt_tokens=usage_info.get("prompt_tokens", 0),
        completion_tokens=usage_info.get("completion_tokens", 0),
        total_tokens=usage_info.get("total_tokens", 0),
        cost_usd=usage_info.get("cost_usd"),
        latency_ms=usage_info.get("latency_ms"),
        success=success,
        error_type=error_type
    )
    db.add(log)
    db.commit()


def award_assessment_points(db: Session, submission_id: str, organization_id: str, score: float):
    """Award points for passing an assessment."""
    # Import here to avoid circular imports
    from app.services.points import award_points

    points = 4 if score >= 70 else 0
    if score >= 85:
        points += 5

    if points > 0:
        award_points(
            db=db,
            organization_id=organization_id,
            user_id=submission.candidate_id,
            event=f"ASSESSMENT_SCORE_{int(score)}",
            points=points,
            metadata={"submission_id": submission_id, "score": score}
        )
```

### 4.4 Clone Task

```python
# app/worker/tasks/clone.py
import subprocess
import tempfile
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class CloneResult:
    path: str
    commit_sha: str


class CloneError(Exception):
    def __init__(self, message: str, is_retryable: bool = False):
        self.is_retryable = is_retryable
        super().__init__(message)


def clone_repository(repo_url: str, timeout: int = 45) -> CloneResult:
    """
    Clone a GitHub repository (shallow, single branch).

    Args:
        repo_url: GitHub repository URL
        timeout: Maximum time for clone operation in seconds

    Returns:
        CloneResult with path and commit SHA

    Raises:
        CloneError on failure
    """
    # Create temporary directory
    clone_dir = tempfile.mkdtemp(prefix="vibe_clone_")

    try:
        # Run git clone
        result = subprocess.run(
            [
                "git", "clone",
                "--depth=1",
                "--single-branch",
                repo_url,
                clone_dir
            ],
            capture_output=True,
            text=True,
            timeout=timeout
        )

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or "Unknown clone error"

            # Check for specific errors
            if "not found" in error_msg.lower() or "404" in error_msg:
                raise CloneError(f"Repository not found: {repo_url}", is_retryable=False)

            if "rate limit" in error_msg.lower():
                raise CloneError("GitHub rate limit exceeded", is_retryable=True)

            raise CloneError(f"Clone failed: {error_msg}", is_retryable=True)

        # Get commit SHA
        sha_result = subprocess.run(
            ["git", "-C", clone_dir, "rev-parse", "HEAD"],
            capture_output=True,
            text=True
        )
        commit_sha = sha_result.stdout.strip()[:40]

        return CloneResult(path=clone_dir, commit_sha=commit_sha)

    except subprocess.TimeoutExpired:
        # Cleanup on timeout
        if os.path.exists(clone_dir):
            import shutil
            shutil.rmtree(clone_dir, ignore_errors=True)
        raise CloneError(f"Clone timed out after {timeout}s", is_retryable=True)

    except CloneError:
        # Cleanup and re-raise
        if os.path.exists(clone_dir):
            import shutil
            shutil.rmtree(clone_dir, ignore_errors=True)
        raise
```

### 4.5 File Collection Task

```python
# app/worker/tasks/files.py
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Set, List


@dataclass
class FileCollectionResult:
    files_analyzed: List[str]
    concatenated_content: str
    total_size_bytes: int
    skipped_files: List[str]


def collect_code_files(
    root_path: str,
    extensions: Set[str],
    ignore_dirs: Set[str],
    max_files: int = 40,
    max_file_size_kb: int = 200
) -> FileCollectionResult:
    """
    Collect and concatenate code files from a directory.

    Files are sorted by relevance:
    1. Priority files (main, app, index) first
    2. Files in priority directories (src/, app/, lib/)
    3. Files closest to root
    4. Smaller files first

    Each file is prefixed with: // FILE: path/to/file.ext
    """
    root = Path(root_path)
    collected_files = []
    skipped_files = []

    # Walk directory
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs]

        rel_dir = Path(dirpath).relative_to(root)

        for filename in filenames:
            ext = Path(filename).suffix.lower()
            if ext not in extensions:
                continue

            # Skip minified and generated files
            if any(skip in filename for skip in [".min.", ".bundle.", ".chunk.", ".map"]):
                continue

            filepath = Path(dirpath) / filename
            rel_path = filepath.relative_to(root)

            # Check file size
            try:
                size = filepath.stat().st_size
                if size > max_file_size_kb * 1024:
                    skipped_files.append(str(rel_path))
                    continue
            except OSError:
                continue

            # Calculate priority score (lower = higher priority)
            priority = calculate_file_priority(str(rel_path), filename)

            collected_files.append({
                "path": str(rel_path),
                "full_path": str(filepath),
                "size": size,
                "priority": priority
            })

    # Sort by priority, then by size
    collected_files.sort(key=lambda f: (f["priority"], f["size"]))

    # Take top N files
    selected_files = collected_files[:max_files]

    # Concatenate content
    content_parts = []
    files_analyzed = []
    total_size = 0

    for file_info in selected_files:
        try:
            with open(file_info["full_path"], "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                content_parts.append(f"\n// FILE: {file_info['path']}\n{content}")
                files_analyzed.append(file_info["path"])
                total_size += file_info["size"]
        except Exception:
            skipped_files.append(file_info["path"])

    return FileCollectionResult(
        files_analyzed=files_analyzed,
        concatenated_content="\n".join(content_parts),
        total_size_bytes=total_size,
        skipped_files=skipped_files
    )


def calculate_file_priority(rel_path: str, filename: str) -> int:
    """
    Calculate priority score for a file. Lower = higher priority.

    Priority order:
    1. main.*, app.*, index.* files
    2. Files in src/, app/, lib/ directories
    3. Files at root level (fewer path segments)
    4. Other files
    """
    priority_names = {"main", "app", "index", "core", "server", "handler"}
    priority_dirs = {"src", "app", "lib", "api", "routes", "handlers"}

    score = 100  # Base score

    # Check filename
    name_without_ext = Path(filename).stem.lower()
    if name_without_ext in priority_names:
        score -= 50

    # Check directory
    path_parts = Path(rel_path).parts
    if len(path_parts) > 1:
        first_dir = path_parts[0].lower()
        if first_dir in priority_dirs:
            score -= 30

    # Penalize deep nesting
    score += len(path_parts) * 5

    return score
```

### 4.6 LLM Service (Provider Abstraction with Fallback)

> **IMPORTANT:** Per architecture-decisions.md, we must support multiple LLM providers with automatic fallback.
> - **Primary:** Groq (fast, cheap)
> - **Fallback:** OpenAI GPT-4o (when Groq fails)
> - **Never** rely on a single provider - Groq outages will happen

```python
# app/services/llm.py
import os
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Any, Optional, List
from enum import Enum

import httpx


class LLMProvider(str, Enum):
    GROQ = "groq"
    OPENAI = "openai"


@dataclass
class LLMResult:
    scores: Dict[str, int]
    overall_comment: str
    raw_response: Dict[str, Any]
    usage_info: Dict[str, Any]
    provider: str  # Track which provider was used


class LLMError(Exception):
    def __init__(
        self,
        message: str,
        is_retryable: bool = False,
        error_type: str = "unknown",
        usage_info: Optional[Dict] = None,
        provider: str = "unknown"
    ):
        self.is_retryable = is_retryable
        self.error_type = error_type
        self.usage_info = usage_info or {}
        self.provider = provider
        super().__init__(message)


# System prompt (from architecture-decisions.md Section 5)
SYSTEM_PROMPT = """You are a strict code reviewer for programming assessments.
You must output ONLY valid JSON, no prose, no markdown, no comments.
Score each dimension from 1 (poor) to 10 (excellent).
Be fair but critical. Do not inflate scores."""

# User prompt template
USER_PROMPT_TEMPLATE = """## Assessment
Title: {title}
Problem: {problem_statement}
Acceptance Criteria:
{acceptance_criteria}

## Candidate Code
{code_content}

## Candidate Explanation
{explanation}

## Scoring Rubric
Evaluate the code on these dimensions (1-10 each):
- code_correctness: Does the code solve the problem correctly?
- code_quality: Does it follow best practices and patterns?
- code_readability: Is the code clean and easy to understand?
- code_robustness: Does it handle errors and edge cases?
- reasoning_clarity: Is the explanation clear?
- reasoning_depth: Is the reasoning thorough?
- reasoning_structure: Is the explanation well-organized?

## Output Format
Return ONLY a JSON object with these exact keys:
{{
  "code_correctness": <1-10>,
  "code_quality": <1-10>,
  "code_readability": <1-10>,
  "code_robustness": <1-10>,
  "reasoning_clarity": <1-10>,
  "reasoning_depth": <1-10>,
  "reasoning_structure": <1-10>,
  "overall_comment": "<2-3 sentence feedback for candidate>"
}}"""


# Provider configurations
PROVIDER_CONFIG = {
    LLMProvider.GROQ: {
        "api_url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.1-70b-versatile",
        "env_key": "GROQ_API_KEY",
        "timeout": 30,
    },
    LLMProvider.OPENAI: {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
        "timeout": 60,
    },
}

# Provider order: try Groq first, fall back to OpenAI
PROVIDER_ORDER = [LLMProvider.GROQ, LLMProvider.OPENAI]

MAX_TOKENS = 1000
TEMPERATURE = 0


def score_with_llm(
    code_content: str,
    explanation: str,
    assessment_context: Dict[str, Any]
) -> LLMResult:
    """
    Score a submission using LLM with automatic fallback.

    Tries providers in order: Groq -> OpenAI
    Falls back on: timeout, rate limit, server errors

    Returns:
        LLMResult with parsed scores and provider used

    Raises:
        LLMError if all providers fail
    """
    user_prompt = USER_PROMPT_TEMPLATE.format(
        title=assessment_context.get("title", ""),
        problem_statement=assessment_context.get("problem_statement", ""),
        acceptance_criteria=assessment_context.get("acceptance_criteria", ""),
        code_content=truncate_content(code_content, max_chars=20000),
        explanation=explanation or "(No explanation provided)"
    )

    last_error = None

    for provider in PROVIDER_ORDER:
        config = PROVIDER_CONFIG[provider]
        api_key = os.getenv(config["env_key"])

        if not api_key:
            continue  # Skip unconfigured providers

        try:
            return _call_provider(provider, config, user_prompt, api_key)
        except LLMError as e:
            last_error = e
            # Only fallback on retryable errors
            if not e.is_retryable:
                raise
            # Log and try next provider
            print(f"LLM provider {provider.value} failed: {e.error_type}, trying next...")
            continue

    # All providers failed
    raise LLMError(
        f"All LLM providers failed. Last error: {last_error}",
        is_retryable=False,
        error_type="all_providers_failed",
        provider="none"
    )


def _call_provider(
    provider: LLMProvider,
    config: Dict[str, Any],
    user_prompt: str,
    api_key: str
) -> LLMResult:
    """Call a specific LLM provider."""
    start_time = time.time()

    try:
        with httpx.Client(timeout=config["timeout"]) as client:
            response = client.post(
                config["api_url"],
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": config["model"],
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": TEMPERATURE,
                    "max_tokens": MAX_TOKENS,
                    "response_format": {"type": "json_object"}
                }
            )
    except httpx.TimeoutException:
        raise LLMError(
            f"{provider.value} timeout",
            is_retryable=True,
            error_type="timeout",
            provider=provider.value
        )
    except httpx.RequestError as e:
        raise LLMError(
            f"{provider.value} request failed: {e}",
            is_retryable=True,
            error_type="network_error",
            provider=provider.value
        )

    latency_ms = int((time.time() - start_time) * 1000)

    # Handle errors (rate limit and server errors trigger fallback)
    if response.status_code == 429:
        raise LLMError(
            f"{provider.value} rate limited",
            is_retryable=True,
            error_type="rate_limit",
            provider=provider.value
        )

    if response.status_code >= 500:
        raise LLMError(
            f"{provider.value} server error: {response.status_code}",
            is_retryable=True,
            error_type="server_error",
            provider=provider.value
        )

    if response.status_code != 200:
        raise LLMError(
            f"{provider.value} error: {response.status_code}",
            is_retryable=False,
            error_type="client_error",
            provider=provider.value
        )

    # Parse and validate response
    data = response.json()
    usage = data.get("usage", {})
    usage_info = {
        "model": config["model"],
        "provider": provider.value,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
        "latency_ms": latency_ms,
        "cost_usd": calculate_cost(provider, usage)
    }

    scores_json = _parse_and_validate_scores(data, usage_info, provider)

    return LLMResult(
        scores={k: scores_json[k] for k in SCORE_FIELDS},
        overall_comment=str(scores_json.get("overall_comment", "")),
        raw_response=scores_json,
        usage_info=usage_info,
        provider=provider.value
    )


SCORE_FIELDS = [
    "code_correctness", "code_quality", "code_readability", "code_robustness",
    "reasoning_clarity", "reasoning_depth", "reasoning_structure"
]


def _parse_and_validate_scores(
    data: Dict, usage_info: Dict, provider: LLMProvider
) -> Dict[str, Any]:
    """Parse LLM response and validate score format."""
    try:
        content = data["choices"][0]["message"]["content"]
        scores_json = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise LLMError(
            f"Failed to parse response: {e}",
            is_retryable=True,
            error_type="invalid_json",
            usage_info=usage_info,
            provider=provider.value
        )

    # Validate fields and values
    for field in SCORE_FIELDS:
        if field not in scores_json:
            raise LLMError(f"Missing field: {field}", is_retryable=True,
                          error_type="missing_field", provider=provider.value)
        value = scores_json[field]
        if not isinstance(value, int) or value < 1 or value > 10:
            raise LLMError(f"Invalid score for {field}: {value}",
                          is_retryable=True, error_type="invalid_score",
                          provider=provider.value)

    if "overall_comment" not in scores_json:
        raise LLMError("Missing overall_comment", is_retryable=True,
                      error_type="missing_field", provider=provider.value)

    return scores_json


def truncate_content(content: str, max_chars: int) -> str:
    """Truncate content to max characters."""
    if len(content) <= max_chars:
        return content
    truncated = content[:max_chars]
    last_newline = truncated.rfind("\n")
    if last_newline > max_chars * 0.8:
        truncated = truncated[:last_newline]
    return truncated + "\n// ... (truncated)"


def calculate_cost(provider: LLMProvider, usage: Dict) -> float:
    """Calculate cost based on provider pricing."""
    # Update these as pricing changes
    pricing = {
        LLMProvider.GROQ: {"input": 0.59, "output": 0.79},      # per 1M tokens
        LLMProvider.OPENAI: {"input": 2.50, "output": 10.00},   # GPT-4o per 1M tokens
    }
    rates = pricing.get(provider, {"input": 0, "output": 0})
    prompt_cost = usage.get("prompt_tokens", 0) * rates["input"] / 1_000_000
    completion_cost = usage.get("completion_tokens", 0) * rates["output"] / 1_000_000
    return round(prompt_cost + completion_cost, 6)
```

**Environment Variables Required:**

```bash
# .env - Both keys required for fallback to work
GROQ_API_KEY=gsk_xxxxxxxxxxxxx      # Primary
OPENAI_API_KEY=sk-xxxxxxxxxxxxx     # Fallback
```

**Update worker to use the new function:**

```python
# In app/worker/tasks/score.py, change:
# OLD: from app.services.llm import call_groq_for_scoring
# NEW:
from app.services.llm import score_with_llm

# And change the call:
# OLD: llm_result = call_groq_for_scoring(...)
# NEW:
llm_result = score_with_llm(
    code_content=file_result.concatenated_content,
    explanation=explanation_text,
    assessment_context=assessment_context
)
# llm_result.provider tells you which provider succeeded
```

---

## Part 5: Deep Dive - Frontend Implementation

### 5.1 API Client with Organization Context

```typescript
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  /**
   * Get current organization ID from context.
   * This is critical for multi-tenancy!
   */
  private getOrganizationId(): string | null {
    return localStorage.getItem('current_org_id');
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const orgId = this.getOrganizationId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add organization context if available
    // IMPORTANT: Most endpoints require this!
    if (orgId) {
      headers['X-Organization-Id'] = orgId;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data: ApiResponse<T> = await response.json();

    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 401) {
        // Token expired - clear auth and redirect
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_org_id');
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      if (response.status === 403 && data.error?.code === 'NOT_ORG_MEMBER') {
        // User doesn't belong to this org - clear org and redirect
        localStorage.removeItem('current_org_id');
        window.location.href = '/select-org';
        throw new Error('Not a member of this organization');
      }

      throw data.error || { code: 'UNKNOWN', message: 'An error occurred' };
    }

    return data.data as T;
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, body: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body: unknown) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
```

### 5.2 Organization Context

```typescript
// src/context/OrganizationContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/api/client';

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'reviewer' | 'candidate';
}

interface OrganizationContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  setCurrentOrg: (org: Organization) => void;
  loading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  // Load organizations on mount
  useEffect(() => {
    async function loadOrganizations() {
      try {
        const orgs = await apiClient.get<Organization[]>('/me/organizations');
        setOrganizations(orgs);

        // Restore previously selected org
        const savedOrgId = localStorage.getItem('current_org_id');
        const savedOrg = orgs.find(o => o.id === savedOrgId);

        if (savedOrg) {
          setCurrentOrgState(savedOrg);
        } else if (orgs.length > 0) {
          // Default to first org
          setCurrentOrgState(orgs[0]);
          localStorage.setItem('current_org_id', orgs[0].id);
        }
      } catch (error) {
        console.error('Failed to load organizations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrganizations();
  }, []);

  const setCurrentOrg = (org: Organization) => {
    setCurrentOrgState(org);
    localStorage.setItem('current_org_id', org.id);
    // Invalidate all queries when org changes
    // queryClient.invalidateQueries();
  };

  return (
    <OrganizationContext.Provider value={{ currentOrg, organizations, setCurrentOrg, loading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
```

### 5.3 Submission Status Page with Polling

```typescript
// src/pages/candidate/SubmissionStatusPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useEffect } from 'react';

interface SubmissionStatus {
  status: 'SUBMITTED' | 'QUEUED' | 'CLONING' | 'SCORING' | 'EVALUATED' | 'CLONE_FAILED' | 'SCORE_FAILED';
  final_score?: number;
  passed?: boolean;
  error_message?: string;
}

const STATUS_MESSAGES: Record<string, string> = {
  SUBMITTED: 'Submission received',
  QUEUED: 'Waiting in queue...',
  CLONING: 'Cloning your repository...',
  SCORING: 'Analyzing your code...',
  EVALUATED: 'Evaluation complete!',
  CLONE_FAILED: 'Failed to clone repository',
  SCORE_FAILED: 'Scoring failed',
};

export function SubmissionStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['submission-status', id],
    queryFn: () => apiClient.get<SubmissionStatus>(`/submissions/${id}/status`),
    // Poll every 3 seconds while processing
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const terminalStates = ['EVALUATED', 'CLONE_FAILED', 'SCORE_FAILED'];
      return status && terminalStates.includes(status) ? false : 3000;
    },
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
  });

  // Stop polling and show final state
  const isComplete = data?.status === 'EVALUATED';
  const isFailed = data?.status?.includes('FAILED');

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Submission Status</h1>

      {isLoading && !data && (
        <div className="animate-pulse">Loading...</div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded">
          Failed to load submission status
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Status indicator */}
          <div className="flex items-center gap-4">
            <StatusIcon status={data.status} />
            <div>
              <p className="font-medium">{STATUS_MESSAGES[data.status]}</p>
              {!isComplete && !isFailed && (
                <p className="text-sm text-gray-500">This may take a few minutes...</p>
              )}
            </div>
          </div>

          {/* Progress steps */}
          <div className="space-y-2">
            <ProgressStep
              label="Submitted"
              done={true}
            />
            <ProgressStep
              label="Cloning repository"
              done={['SCORING', 'EVALUATED'].includes(data.status)}
              current={data.status === 'CLONING'}
              failed={data.status === 'CLONE_FAILED'}
            />
            <ProgressStep
              label="Analyzing code"
              done={data.status === 'EVALUATED'}
              current={data.status === 'SCORING'}
              failed={data.status === 'SCORE_FAILED'}
            />
            <ProgressStep
              label="Complete"
              done={data.status === 'EVALUATED'}
            />
          </div>

          {/* Score display */}
          {isComplete && data.final_score !== undefined && (
            <div className={`p-6 rounded-lg ${data.passed ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <div className="text-center">
                <p className="text-4xl font-bold">
                  {data.final_score.toFixed(1)}
                </p>
                <p className="text-sm text-gray-600 mt-1">out of 100</p>
                <p className={`mt-2 font-medium ${data.passed ? 'text-green-600' : 'text-yellow-600'}`}>
                  {data.passed ? '✓ Passed!' : 'Below passing threshold (70)'}
                </p>
              </div>

              <button
                onClick={() => navigate(`/submissions/${id}`)}
                className="w-full mt-4 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                View Detailed Scores
              </button>
            </div>
          )}

          {/* Error display */}
          {isFailed && data.error_message && (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="font-medium text-red-700">Something went wrong</p>
              <p className="text-sm text-red-600 mt-1">{data.error_message}</p>
              <p className="text-sm text-gray-600 mt-2">
                Don't worry - our team has been notified. Please contact support if this persists.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'EVALUATED') {
    return <span className="text-green-500 text-2xl">✓</span>;
  }
  if (status.includes('FAILED')) {
    return <span className="text-red-500 text-2xl">✕</span>;
  }
  return (
    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  );
}

function ProgressStep({
  label,
  done,
  current = false,
  failed = false
}: {
  label: string;
  done: boolean;
  current?: boolean;
  failed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
        failed ? 'bg-red-500' :
        done ? 'bg-green-500' :
        current ? 'bg-blue-500 animate-pulse' :
        'bg-gray-200'
      }`}>
        {done && !failed && <span className="text-white text-xs">✓</span>}
        {failed && <span className="text-white text-xs">✕</span>}
      </div>
      <span className={`${done || current ? 'text-gray-900' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}
```

---

## Part 5.5: Rate Limits, Caps & Abuse Prevention

> **CRITICAL:** These protections are required before launch. Missing rate limits = potential bankruptcy from API abuse.

### API Rate Limiting

```python
# app/utils/rate_limit.py
from fastapi import Request, HTTPException, Depends
from redis import Redis
from typing import Optional

from app.dependencies import get_current_org, get_current_user


class RateLimiter:
    """
    Rate limiter using Redis sliding window.

    Per architecture-decisions.md Section 8:
    - General API: 60 req/min per user
    - Submissions: 5/hour per user, 100/day per org
    - Auth attempts: 10/min per IP
    """

    def __init__(self, redis: Redis):
        self.redis = redis

    def check(self, key: str, limit: int, window_seconds: int) -> bool:
        """Returns True if within limit, raises HTTPException if exceeded."""
        current = self.redis.incr(key)
        if current == 1:
            self.redis.expire(key, window_seconds)

        if current > limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Try again in {window_seconds}s."
                }
            )
        return True


# Dependency for rate-limited endpoints
async def rate_limit_submissions(
    request: Request,
    org = Depends(get_current_org),
    user = Depends(get_current_user),
):
    """Rate limit submissions: 5/hour per user, 100/day per org."""
    redis = request.app.state.redis
    limiter = RateLimiter(redis)

    # Per-user limit: 5 submissions per hour
    user_key = f"ratelimit:submission:user:{user.id}"
    limiter.check(user_key, limit=5, window_seconds=3600)

    # Per-org limit: 100 submissions per day
    org_key = f"ratelimit:submission:org:{org.id}"
    limiter.check(org_key, limit=100, window_seconds=86400)


# Usage in endpoint:
@router.post("/submissions")
async def create_submission(
    data: SubmissionCreate,
    _rate_limit = Depends(rate_limit_submissions),  # Add this
    org = Depends(get_current_org),
    # ... rest of dependencies
):
    pass
```

### Per-Organization LLM Cost Caps

```python
# app/services/org_limits.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from uuid import UUID

from app.models.llm_usage_log import LLMUsageLog
from app.models.organization import Organization


class OrgLimitExceeded(Exception):
    def __init__(self, message: str, current: float, limit: float):
        self.current = current
        self.limit = limit
        super().__init__(message)


def check_org_llm_budget(
    db: Session,
    organization_id: UUID,
    daily_limit_usd: float = 50.0,  # Default $50/day
    warning_threshold: float = 0.8  # Warn at 80%
) -> dict:
    """
    Check if organization has exceeded LLM budget.

    Called BEFORE enqueuing a scoring job.
    """
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Sum today's LLM costs for this org
    daily_cost = db.query(func.sum(LLMUsageLog.cost_usd)).filter(
        LLMUsageLog.organization_id == organization_id,
        LLMUsageLog.created_at >= today_start
    ).scalar() or 0.0

    usage_pct = (daily_cost / daily_limit_usd) * 100 if daily_limit_usd > 0 else 0

    if daily_cost >= daily_limit_usd:
        raise OrgLimitExceeded(
            f"Organization has exceeded daily LLM budget (${daily_cost:.2f} / ${daily_limit_usd:.2f})",
            current=daily_cost,
            limit=daily_limit_usd
        )

    return {
        "daily_cost_usd": daily_cost,
        "daily_limit_usd": daily_limit_usd,
        "usage_percent": usage_pct,
        "warning": usage_pct >= (warning_threshold * 100)
    }


# Add to submission endpoint BEFORE enqueuing:
@router.post("/submissions")
async def create_submission(...):
    # Check org LLM budget before accepting
    try:
        budget_status = check_org_llm_budget(db, org.id)
        if budget_status["warning"]:
            # Log warning but continue
            logger.warning(f"Org {org.id} at {budget_status['usage_percent']:.1f}% of LLM budget")
    except OrgLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "ORG_LLM_BUDGET_EXCEEDED",
                "message": "Your organization has reached its daily AI evaluation limit. Please try again tomorrow.",
                "current_cost": e.current,
                "daily_limit": e.limit
            }
        )
    # ... continue with submission
```

### Repository Size & File Limits

```python
# app/services/github.py - Add to validate_github_url()

# Constants from architecture-decisions.md Section 4
MAX_REPO_SIZE_KB_SOFT = 50_000   # 50MB - warn
MAX_REPO_SIZE_KB_HARD = 100_000  # 100MB - reject
MAX_FILES = 40
MAX_FILE_SIZE_KB = 200

async def validate_github_url(url: str) -> GitHubRepoInfo:
    # ... existing validation ...

    # Check repo size
    size_kb = data.get("size", 0)

    if size_kb > MAX_REPO_SIZE_KB_HARD:
        raise GitHubValidationError(
            "REPO_TOO_LARGE",
            f"Repository is {size_kb // 1000}MB. Maximum allowed is 100MB."
        )

    warn_large = size_kb > MAX_REPO_SIZE_KB_SOFT

    return GitHubRepoInfo(
        # ... existing fields ...
        warn_large=warn_large,  # Add this field
        size_kb=size_kb
    )
```

### Clone Timeout & Download Rate Protection

```python
# app/worker/tasks/clone.py

CLONE_TIMEOUT = 45  # seconds
MIN_DOWNLOAD_RATE_KB = 50  # KB/s
RATE_CHECK_INTERVAL = 10  # Check rate after 10s

def clone_repository(repo_url: str, timeout: int = CLONE_TIMEOUT) -> CloneResult:
    """
    Clone with timeout and minimum download rate enforcement.

    Prevents hanging on slow/malicious repos.
    """
    clone_dir = tempfile.mkdtemp(prefix="vibe_clone_")

    try:
        # Use git clone with low-speed-limit to cancel slow downloads
        result = subprocess.run(
            [
                "git", "clone",
                "--depth=1",
                "--single-branch",
                # Cancel if download slower than 50KB/s for 10 consecutive seconds
                "-c", f"http.lowSpeedLimit={MIN_DOWNLOAD_RATE_KB * 1024}",
                "-c", f"http.lowSpeedTime={RATE_CHECK_INTERVAL}",
                repo_url,
                clone_dir
            ],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        # ... rest of function
```

### Rate Limit Response Headers

Add standard rate limit headers so clients know their limits:

```python
# app/middleware/rate_limit_headers.py
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Add rate limit headers if we have rate limit info
        if hasattr(request.state, "rate_limit_info"):
            info = request.state.rate_limit_info
            response.headers["X-RateLimit-Limit"] = str(info["limit"])
            response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
            response.headers["X-RateLimit-Reset"] = str(info["reset_at"])

        return response
```

---

## Part 6: Testing Requirements

### 6.1 Backend Testing

Every PR must include tests. Here's what's required:

**Test file structure:**
```
tests/
├── conftest.py           # Shared fixtures
├── test_auth.py
├── test_profile.py
├── test_assessments.py
├── test_submissions.py
├── test_worker/
│   ├── test_clone.py
│   ├── test_files.py
│   └── test_scoring.py
└── test_services/
    ├── test_github.py
    └── test_llm.py
```

**IMPORTANT: Use Postgres for tests, not SQLite**

Our models use Postgres-specific features (UUID defaults, enums, pgvector, JSONB, GIN indexes) that don't work on SQLite. Tests must use a real Postgres container.

**Add test Postgres to docker-compose.yml:**

```yaml
services:
  # ... existing postgres service for dev ...

  postgres-test:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: vibe_test
      POSTGRES_PASSWORD: vibe_test
      POSTGRES_DB: vibe_test
    ports:
      - "5433:5432"  # Different port to avoid conflict
    tmpfs:
      - /var/lib/postgresql/data  # In-memory for speed
```

**Example test fixtures:**

```python
# tests/conftest.py
import pytest
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser, OrganizationUserRole


# MUST use Postgres - SQLite doesn't support our features (UUID, enums, pgvector, JSONB)
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://vibe_test:vibe_test@localhost:5433/vibe_test"
)

engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    """Create test client with overridden DB."""
    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    user = User(
        firebase_uid="test-firebase-uid",
        email="test@example.com",
        name="Test User",
        email_verified=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_org(db, test_user):
    """Create a test organization with the test user as owner."""
    org = Organization(
        name="Test Org",
        slug="test-org",
        created_by=test_user.id
    )
    db.add(org)
    db.commit()

    # Add user as owner
    membership = OrganizationUser(
        organization_id=org.id,
        user_id=test_user.id,
        role=OrganizationUserRole.OWNER
    )
    db.add(membership)
    db.commit()
    db.refresh(org)

    return org


@pytest.fixture
def auth_headers(test_user, mocker):
    """Mock Firebase auth and return valid headers."""
    # Mock Firebase token verification
    mocker.patch(
        "app.services.auth.firebase_auth.verify_id_token",
        return_value={
            "uid": test_user.firebase_uid,
            "email": test_user.email,
            "email_verified": True
        }
    )
    return {
        "Authorization": "Bearer fake-token",
        "X-Organization-Id": str(test_user.id)  # Will be updated per test
    }
```

**Example test:**

```python
# tests/test_submissions.py
import pytest
from unittest.mock import patch, MagicMock

from app.models.submission import SubmissionStatus


def test_create_submission_success(client, auth_headers, test_org, test_user, db, mocker):
    """Test successful submission creation."""
    # Create an assessment first
    from app.models.assessment import Assessment
    assessment = Assessment(
        organization_id=test_org.id,
        created_by=test_user.id,
        title="Test Assessment",
        problem_statement="Build something cool",
        build_requirements="Use Python",
        input_output_examples="input: x, output: y",
        acceptance_criteria="It should work",
        constraints="None",
        submission_instructions="Submit your repo",
        visibility="active",
        status="published"
    )
    db.add(assessment)
    db.commit()

    # Mock GitHub validation
    mocker.patch(
        "app.services.github.validate_github_url",
        return_value=MagicMock(
            owner="testuser",
            repo="testrepo",
            default_branch="main",
            is_public=True,
            size_kb=1000,
            has_code_files=True
        )
    )

    # Mock job enqueue
    mocker.patch(
        "app.worker.jobs.enqueue_scoring_job",
        return_value="test-job-id"
    )

    # Update auth headers with correct org
    auth_headers["X-Organization-Id"] = str(test_org.id)

    response = client.post(
        "/api/v1/submissions",
        json={
            "assessment_id": str(assessment.id),
            "github_repo_url": "https://github.com/testuser/testrepo",
            "explanation_text": "This is my solution"
        },
        headers=auth_headers
    )

    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["status"] == "QUEUED"


def test_create_submission_already_submitted(client, auth_headers, test_org, test_user, db, mocker):
    """Test that users can only submit once per assessment."""
    from app.models.assessment import Assessment
    from app.models.submission import Submission

    # Create assessment
    assessment = Assessment(
        organization_id=test_org.id,
        created_by=test_user.id,
        title="Test Assessment",
        # ... other fields
    )
    db.add(assessment)
    db.commit()

    # Create existing submission
    existing = Submission(
        organization_id=test_org.id,
        candidate_id=test_user.id,
        assessment_id=assessment.id,
        github_repo_url="https://github.com/test/old",
        status=SubmissionStatus.EVALUATED
    )
    db.add(existing)
    db.commit()

    auth_headers["X-Organization-Id"] = str(test_org.id)

    response = client.post(
        "/api/v1/submissions",
        json={
            "assessment_id": str(assessment.id),
            "github_repo_url": "https://github.com/test/new",
            "explanation_text": "Second attempt"
        },
        headers=auth_headers
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ALREADY_SUBMITTED"
```

**Run tests:**
```bash
cd backend
pytest tests/ -v --cov=app
```

---

## Part 7: Common Pitfalls & How to Avoid Them

### 7.1 Multi-Tenancy Bugs (CRITICAL)

**Problem:** Forgetting to filter by `organization_id` in queries.

**This is the #1 cause of data leaks in SaaS applications.**

```python
# BAD - Data leak! Shows all assessments across all orgs
assessments = db.query(Assessment).filter(Assessment.status == "published").all()

# GOOD - Always filter by org
assessments = db.query(Assessment).filter(
    Assessment.organization_id == org.id,  # ALWAYS include this
    Assessment.status == "published"
).all()
```

**Prevention:**
- Create a `get_scoped_query` helper that automatically adds org filter
- Add integration tests that verify cross-org data isolation
- Code review checklist item: "Every query includes organization_id filter"

### 7.2 Firebase Token Expiration

**Problem:** Firebase tokens expire after 1 hour. API returns 401 but frontend doesn't refresh.

**Solution:** The Firebase SDK handles token refresh automatically, but you need to get fresh tokens:

```typescript
// GOOD - Get fresh token before each API call
const token = await firebaseUser.getIdToken();  // Returns cached or refreshes if needed
```

### 7.3 Worker Process Isolation

**Problem:** Worker shares database connections with API, causing connection pool exhaustion.

**Solution:** Worker should create its own database sessions:

```python
# app/worker/tasks/score.py

def score_submission(...):
    # Create new session for this job
    db = SessionLocal()
    try:
        # ... do work
    finally:
        db.close()  # Always close!
```

### 7.4 LLM Response Parsing

**Problem:** LLM sometimes returns malformed JSON or unexpected values.

**Solution:** Always validate and have fallbacks:

```python
# Validate each score is in range
for field in score_fields:
    value = scores_json.get(field)
    if not isinstance(value, int) or value < 1 or value > 10:
        # Option 1: Retry with stricter prompt
        # Option 2: Use default value (5)
        scores_json[field] = 5  # Fallback to middle score
```

### 7.5 Frontend React Query Cache

**Problem:** After switching organizations, old data shows up.

**Solution:** Invalidate cache when org changes:

```typescript
const setCurrentOrg = (org: Organization) => {
  setCurrentOrgState(org);
  localStorage.setItem('current_org_id', org.id);
  // Invalidate ALL queries when org changes
  queryClient.invalidateQueries();
};
```

### 7.6 Race Conditions in Submission

**Problem:** User double-clicks submit, creates duplicate submissions.

**Solution:** Use database unique constraint (already in schema) and handle gracefully:

```python
try:
    db.add(submission)
    db.commit()
except IntegrityError:
    db.rollback()
    raise HTTPException(status_code=409, detail="Already submitted")
```

---

## Part 8: Code Review Checklist

Before approving any PR, verify these items:

### Security
- [ ] No secrets/API keys committed
- [ ] All queries filter by `organization_id`
- [ ] File uploads validate MIME type server-side
- [ ] User input is sanitized before use in queries
- [ ] GitHub URLs validated before processing

### Backend
- [ ] New models have `organization_id` if tenant-scoped
- [ ] New endpoints use `get_current_org` dependency
- [ ] Admin endpoints use `require_role()` dependency
- [ ] Database sessions are properly closed
- [ ] Alembic migration included for schema changes
- [ ] Error responses use standard format

### Frontend
- [ ] API calls include organization header (via client)
- [ ] Loading states shown during data fetching
- [ ] Error handling with user-friendly messages
- [ ] Form validation on submit
- [ ] No console.log in production code

### Testing
- [ ] Unit tests for new services/utilities
- [ ] API tests for new endpoints
- [ ] Tests verify org isolation (no cross-org access)

### Documentation
- [ ] Complex logic has inline comments
- [ ] New API endpoints documented in code (docstrings)
- [ ] Architecture decisions documented if significant

---

## Appendix A: Quick Reference Commands

```bash
# Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload                    # Start API
python -m app.worker.main                         # Start worker
alembic upgrade head                              # Run migrations
alembic revision --autogenerate -m "message"     # Create migration
pytest tests/ -v                                  # Run tests
pytest tests/ -v --cov=app --cov-report=html     # Tests with coverage

# Frontend
cd frontend
npm run dev                                       # Start dev server
npm run build                                     # Production build
npm run lint                                      # Run linter
npm run test                                      # Run tests

# Docker
docker-compose up -d                              # Start Postgres & Redis
docker-compose down                               # Stop services
docker-compose logs -f postgres                   # View Postgres logs
```

---

## Questions?

If something is unclear or you're stuck:

1. Check `architecture-decisions.md` for the "why" behind decisions
2. Check `database-schema.md` for data model questions
3. Check `epics-user-stories.md` for acceptance criteria
4. Ask in the team Slack channel
5. Tag the principal engineer for architecture questions

Happy coding!

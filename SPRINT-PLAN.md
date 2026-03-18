# Vibe Platform - 2-Week Sprint Plan

**Goal**: Private beta ready with 100 users, functional scoring pipeline, org-scoped data.

**Timeline Note**: 10 days is aggressive for 2 developers. Plan includes Day 11-12 as contingency buffer. Core path (Days 1-5) is non-negotiable; admin UI and polish (Days 6-10) can slip if needed.

**Team**:
- **Dev1** (Backend Lead): Python, FastAPI, SQLAlchemy, worker pipeline
- **Dev2** (Frontend Lead): React, TypeScript, Firebase SDK, can assist backend

**Working Hours**: 8 hrs/day, 5 days/week = 80 hrs total per developer

---

## Team Skill Assumptions

| Developer | Primary Skills | Secondary |
|-----------|---------------|-----------|
| Dev1 | Python, FastAPI, PostgreSQL, Redis, async workers | Docker, Git |
| Dev2 | React, TypeScript, REST APIs, CSS/Tailwind | Python basics, can write tests |

---

## Sprint Overview

```
Week 1: Foundation + Critical Path
├── Day 1-2: Project bootstrap, data layer, auth
├── Day 3-4: Submissions API, worker skeleton
└── Day 5: Rate limits, integration, bug fixes

Week 2: Frontend + Hardening + Polish
├── Day 6-7: Frontend core pages, backend refinements
├── Day 8-9: Leaderboard, admin tools, monitoring
└── Day 10: Integration testing, deployment prep
```

---

# Architecture Alignment Updates (additions to this sprint)

- Observability: structured logging with request_id/org_id/user_id + metrics endpoint (queue depth, job latency, error rates) + alert hooks for queue depth/LLM failure rate.
- Notifications breadth: wire Brevo emails beyond invites/score-ready (status changes, failures, admin alerts) per architecture-decisions.md.
- CI/CD: add lint/test/migration checks and deploy workflow/runbooks.
- Frontend UX: build the documented pages/flows (assessments, submissions, profiles, admin tools) and add onboarding/tour launcher.
- Admin ops UI: surface maintenance toggle and budget status/warnings in the client.
- Storage parity: implement GCS + signed URLs for resumes (local-only is acceptable for dev).
- Scheduling/forms: scope and defer as post-sprint/Phase 2 unless time allows.

---

# WEEK 1: Foundation + Critical Path

## Day 1 (Monday) - Project Bootstrap

### Dev1: Backend Skeleton (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Create monorepo structure | 1 hr | See structure below | Directories exist, .gitignore set |
| Set up Docker Compose | 1.5 hrs | `docker-compose.yml`, `docker-compose.test.yml` | `docker-compose up` starts Postgres (pgvector/pgvector:pg16) + Redis |
| Create `.env.example` | 0.5 hr | `.env.example` | All required vars documented |
| FastAPI app skeleton | 1 hr | `backend/app/main.py`, `backend/app/core/config.py` | `uvicorn app.main:app` starts without error |

```
vibe/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py          # Settings from env
│   │   │   ├── database.py        # SQLAlchemy setup
│   │   │   └── security.py        # Firebase verification
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── deps.py            # Dependencies (get_db, get_current_user, etc.)
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       └── router.py
│   │   ├── models/
│   │   │   └── __init__.py
│   │   ├── schemas/
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   └── __init__.py
│   │   └── worker/
│   │       └── __init__.py
│   ├── alembic/
│   │   └── versions/
│   ├── alembic.ini
│   ├── tests/
│   │   ├── __init__.py
│   │   └── conftest.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── (Day 6)
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example
└── .gitignore
```

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Database connection setup | 1 hr | `backend/app/core/database.py` | Session factory works, connection pooling configured |
| Firebase token verification | 1 hr | `backend/app/core/security.py` | `verify_firebase_token()` decodes valid JWT |
| Base dependencies | 1 hr | `backend/app/api/deps.py` | `get_db`, `get_current_user` dependencies work |
| Health check endpoint | 0.5 hr | `backend/app/api/v1/router.py` | `GET /health` returns `{"status": "ok"}` |
| CORS configuration | 0.5 hr | `backend/app/main.py` | Whitelist origins per architecture-decisions.md |

**Dev1 Deliverable**: Running FastAPI app with health endpoint, CORS configured, Firebase verification function.

---

### Dev2: Frontend Bootstrap + Firebase Setup (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Create React app (Vite + TypeScript) | 1 hr | `frontend/` structure | `npm run dev` starts dev server |
| Install dependencies | 0.5 hr | `package.json` | React Query, React Router, Axios, Tailwind |
| Firebase SDK setup | 1.5 hrs | `frontend/src/lib/firebase.ts` | Firebase app initialized, auth methods exported |
| API client with interceptors | 1 hr | `frontend/src/lib/api.ts` | Axios instance with auth header injection |

```
frontend/
├── src/
│   ├── components/
│   │   └── ui/              # Shared UI components
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── OrgContext.tsx
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── lib/
│   │   ├── api.ts           # Axios client
│   │   └── firebase.ts      # Firebase config
│   ├── pages/
│   │   └── (Day 6-7)
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| AuthContext implementation | 2 hrs | `frontend/src/contexts/AuthContext.tsx` | Login/logout/currentUser state managed |
| Login page (Firebase UI) | 1.5 hrs | `frontend/src/pages/auth/LoginPage.tsx` | Google + Email login works |
| Protected route wrapper | 0.5 hr | `frontend/src/components/ProtectedRoute.tsx` | Redirects to login if not authenticated |

**Dev2 Deliverable**: React app with working Firebase login, auth context, API client skeleton.

---

## Day 2 (Tuesday) - Data Layer + Auth API

### Dev1: Models + Migrations (8 hrs)

**CRITICAL**: All models MUST match `database-schema.md` exactly. Include:
- All enum types (submission_status with CLONE_FAILED/SCORE_FAILED, assessment_visibility, evaluation_mode)
- All org-scoped unique constraints
- All FK relationships with `ondelete="CASCADE"`
- admin_invites and assessment_invites tables

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Base model class | 0.5 hr | `backend/app/models/base.py` | UUID pk, timestamps mixin |
| User model | 0.5 hr | `backend/app/models/user.py` | Matches database-schema.md exactly |
| Organization model | 0.5 hr | `backend/app/models/organization.py` | With status, plan fields |
| OrganizationUser model | 0.5 hr | `backend/app/models/organization_user.py` | Role enum (owner/admin/reviewer/candidate), composite PK |
| CandidateProfile model | 1 hr | `backend/app/models/candidate_profile.py` | All fields, org FK, UNIQUE(org_id, user_id) |
| Assessment model | 1 hr | `backend/app/models/assessment.py` | Weights, visibility enum, evaluation_mode enum, status enum |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Submission model | 0.75 hr | `backend/app/models/submission.py` | All status enums (DRAFT→EVALUATED), UNIQUE(org_id, candidate_id, assessment_id) |
| AIScore model | 0.5 hr | `backend/app/models/ai_score.py` | Rubric scores, raw_response JSONB |
| Invites models | 0.5 hr | `backend/app/models/invites.py` | admin_invites, assessment_invites per schema |
| PointsLog, ActivityLog, AdminAuditLog | 0.5 hr | `backend/app/models/logs.py` | Per database-schema.md |
| LLMUsageLog model | 0.5 hr | `backend/app/models/llm_usage.py` | Cost, tokens, latency, attempt_number, success |
| SystemConfig model | 0.25 hr | `backend/app/models/system_config.py` | Key-value store with maintenance_mode flag |
| Generate Alembic migration | 0.5 hr | `alembic/versions/001_initial.py` | `alembic upgrade head` succeeds, pgvector extension enabled |
| Seed script | 0.5 hr | `backend/scripts/seed.py` | Creates default org + admin user + membership + system_config defaults |

```python
# backend/app/models/__init__.py
from .user import User
from .organization import Organization
from .organization_user import OrganizationUser
from .candidate_profile import CandidateProfile
from .assessment import Assessment
from .submission import Submission
from .ai_score import AIScore
from .invites import AdminInvite, AssessmentInvite
from .logs import PointsLog, ActivityLog, AdminAuditLog
from .llm_usage import LLMUsageLog
from .system_config import SystemConfig
```

**Dev1 Deliverable**: All models created, migration runs, seed script works.

---

### Dev2: Organization Context + Test Setup (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| OrgContext on frontend | 1.5 hrs | `frontend/src/contexts/OrgContext.tsx` | Stores current org, injects X-Organization-Id header |
| Org switcher component | 1 hr | `frontend/src/components/OrgSwitcher.tsx` | Dropdown to switch orgs (if user has multiple) |
| API client org header injection | 0.5 hr | `frontend/src/lib/api.ts` | All requests include org header |
| Dashboard layout shell | 1 hr | `frontend/src/components/DashboardLayout.tsx` | Sidebar, header, content area |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Help Dev1: Test fixtures | 2 hrs | `backend/tests/conftest.py` | Postgres test DB, test_user, test_org, auth_headers fixtures |
| Help Dev1: Auth endpoint test | 1 hr | `backend/tests/test_auth.py` | Test /auth/me returns user data with org list |
| Frontend routing setup | 1 hr | `frontend/src/App.tsx` | Routes for login, dashboard, profile |

```python
# backend/tests/conftest.py - Key fixtures
import pytest
from sqlalchemy import create_engine
from app.core.config import settings

@pytest.fixture(scope="session")
def db_engine():
    """Create test database engine - MUST be Postgres, not SQLite."""
    # Postgres required for UUID, ENUM, JSONB, pgvector
    engine = create_engine(settings.TEST_DATABASE_URL)
    yield engine
    engine.dispose()

@pytest.fixture
def db(db_engine):
    """Create tables, yield session, rollback after test."""
    # ... transaction-based isolation

@pytest.fixture
def test_org(db):
    """Create test organization with active status."""
    org = Organization(name="Test Org", slug="test-org", status="active")
    db.add(org)
    db.commit()
    return org

@pytest.fixture
def test_user(db, test_org):
    """Create test user with org membership."""
    user = User(firebase_uid="test-uid", email="test@example.com", email_verified=True)
    db.add(user)
    db.commit()
    membership = OrganizationUser(
        organization_id=test_org.id,
        user_id=user.id,
        role="admin"
    )
    db.add(membership)
    db.commit()
    return user

@pytest.fixture
def auth_headers(test_user, test_org):
    """Auth headers with org context - REQUIRED for all API tests."""
    return {
        "Authorization": f"Bearer {mock_firebase_token(test_user)}",
        "X-Organization-Id": str(test_org.id)  # ALWAYS include org header
    }
```

**IMPORTANT**: All API tests MUST use `auth_headers` fixture to enforce org context. Tests without org header should fail.

**Dev2 Deliverable**: Frontend org context, test fixtures ready, dashboard shell.

---

## Day 3 (Wednesday) - Auth API + Submissions Start

### Dev1: Auth + Org APIs (8 hrs)

**AUTH SCOPE REMINDER**: Backend does NOT handle registration or login. Frontend uses Firebase SDK for auth. Backend only:
1. Verifies Firebase tokens
2. Upserts user on first API call
3. Returns user data via `/auth/me`

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Pydantic schemas for auth/org | 1 hr | `backend/app/schemas/auth.py`, `schemas/organization.py` | Request/response models |
| `get_current_user` dependency | 1 hr | `backend/app/api/deps.py` | Verifies Firebase token, upserts user if new |
| `get_current_org` dependency | 1 hr | `backend/app/api/deps.py` | Validates X-Organization-Id, checks membership, checks org status |
| `require_role` dependency | 1 hr | `backend/app/api/deps.py` | Dependency factory for role-based access |

```python
# backend/app/api/deps.py

async def get_current_user(
    authorization: str = Header(...),
    db: Session = Depends(get_db)
) -> User:
    """Verify Firebase token, upsert user."""
    token = authorization.replace("Bearer ", "")
    decoded = verify_firebase_token(token)

    user = db.query(User).filter(User.firebase_uid == decoded["uid"]).first()
    if not user:
        user = User(
            firebase_uid=decoded["uid"],
            email=decoded["email"],
            email_verified=decoded.get("email_verified", False)
        )
        db.add(user)
        db.commit()
    return user

async def get_current_org(
    x_organization_id: str = Header(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Organization:
    """Validate org header, check membership."""
    org = db.query(Organization).filter(
        Organization.id == x_organization_id,
        Organization.status == "active"
    ).first()
    if not org:
        raise HTTPException(404, detail={"code": "ORG_NOT_FOUND"})

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org.id,
        OrganizationUser.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(403, detail={"code": "NOT_ORG_MEMBER"})

    return org

def require_role(*roles: str):
    """Dependency factory for role checks."""
    async def checker(
        org: Organization = Depends(get_current_org),
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> OrganizationUser:
        membership = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id
        ).first()
        if membership.role not in roles:
            raise HTTPException(403, detail={"code": "INSUFFICIENT_ROLE"})
        return membership
    return checker
```

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| `/auth/me` endpoint | 0.75 hr | `backend/app/api/v1/auth.py` | Returns user + orgs list (only orgs user belongs to) |
| `/organizations` CRUD | 1 hr | `backend/app/api/v1/organizations.py` | Create (becomes owner), list (own orgs), get |
| `/organizations/{id}/members` | 0.75 hr | `backend/app/api/v1/organizations.py` | List/add/remove members (admin+ only) |
| Admin invites endpoints | 1 hr | `backend/app/api/v1/admin_invites.py` | Create invite (owner/admin), accept invite, list pending, expire after 7d |
| Activity log service | 0.5 hr | `backend/app/services/activity.py` | `log_activity()` helper for significant events |

**Admin Invite Flow**: Only owners/admins can invite new admins/reviewers. Invite email sent (Brevo), user accepts via link, membership created.

**Dev1 Deliverable**: Working auth flow, org CRUD, membership management, admin invites, activity logging.

---

### Dev2: Profile Page + Help with Submissions Schema (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Profile page UI | 1.5 hrs | `frontend/src/pages/profile/ProfilePage.tsx` | Form for all profile fields |
| Profile API hooks | 1 hr | `frontend/src/hooks/useProfile.ts` | React Query hooks for GET/PUT |
| GitHub URL input with validation | 0.75 hr | `frontend/src/components/GitHubUrlInput.tsx` | Client-side format validation |
| Resume upload component | 0.75 hr | `frontend/src/components/ResumeUpload.tsx` | PDF/DOCX only, 20MB max, drag-drop |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Help Dev1: Submission schemas | 1 hr | `backend/app/schemas/submission.py` | Create, response, status schemas |
| Help Dev1: GitHub URL validator | 1.5 hrs | `backend/app/services/github.py` | SSRF-safe, cache repo checks, default-branch only |
| Help Dev1: Resume upload service | 1 hr | `backend/app/services/resume.py` | PDF/DOCX MIME validation, 20MB max, path: resumes/{user_id}/{timestamp} |
| Assessments list page (read-only) | 0.5 hr | `frontend/src/pages/assessments/AssessmentListPage.tsx` | Lists available assessments |

**Resume Upload Requirements**:
- Accept only: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Max size: 20MB
- Storage path: `resumes/{user_id}/{timestamp}_{filename}`
- AV scanning: deferred to Phase 2 (per architecture-decisions.md)

```python
# backend/app/services/github.py

import re
import socket
import ipaddress
import httpx
from urllib.parse import urlparse
from functools import lru_cache

GITHUB_URL_PATTERN = re.compile(
    r'^https://github\.com/[\w\-\.]+/[\w\-\.]+/?$'
)

BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
]

# Files to ignore during analysis (per architecture-decisions.md)
IGNORED_FILES = {
    "*.min.js", "*.bundle.js", "*.chunk.js",  # Minified/bundled
    "package-lock.json", "yarn.lock",          # Lock files
    "*.map",                                    # Source maps
}

@lru_cache(maxsize=1000, ttl=300)  # Cache for 5 minutes
def check_repo_exists(owner: str, repo: str) -> tuple[bool, dict]:
    """Check repo exists and is public. Uses PAT if available."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    if pat := os.getenv("GITHUB_PAT"):
        headers["Authorization"] = f"token {pat}"

    try:
        resp = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return True, {"default_branch": data["default_branch"], "size_kb": data["size"]}
        return False, {}
    except Exception:
        return False, {}

def validate_github_url(url: str) -> tuple[bool, str]:
    """Validate GitHub URL is safe to clone."""
    # 1. Format check
    if not GITHUB_URL_PATTERN.match(url):
        return False, "Invalid GitHub URL format"

    # 2. HTTPS required
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False, "HTTPS required"

    # 3. DNS resolution check for SSRF
    try:
        ip = socket.gethostbyname(parsed.hostname)
        ip_obj = ipaddress.ip_address(ip)
        for network in BLOCKED_NETWORKS:
            if ip_obj in network:
                return False, "URL resolves to blocked IP range"
    except socket.gaierror:
        return False, "Could not resolve hostname"

    # 4. Check repo exists and get default branch (cached)
    parts = parsed.path.strip("/").split("/")
    if len(parts) < 2:
        return False, "Invalid repo path"
    owner, repo = parts[0], parts[1]
    exists, meta = check_repo_exists(owner, repo)
    if not exists:
        return False, "Repository not found or not public"

    # 5. Check size limit (100MB = 102400KB)
    if meta.get("size_kb", 0) > 102400:
        return False, "Repository exceeds 100MB size limit"

    return True, "Valid"
```

**Dev2 Deliverable**: Profile page, GitHub validator, assessment list page.

---

## Day 4 (Thursday) - Submissions API + Worker Skeleton

### Dev1: Submissions Endpoint (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Profile CRUD endpoints | 1 hr | `backend/app/api/v1/profiles.py` | GET/PUT own profile (org-scoped) |
| Points award service | 0.5 hr | `backend/app/services/points.py` | `award_points()` helper, idempotent |
| Assessment list/detail endpoints | 1.5 hrs | `backend/app/api/v1/assessments.py` | List (filtered by visibility/status), detail |
| Submission create endpoint | 1 hr | `backend/app/api/v1/submissions.py` | Validates URL, checks one-attempt, creates record |

**Points Integration**: Profile PUT should call `award_points("profile_complete")` when all required fields filled.

```python
# backend/app/api/v1/submissions.py

@router.post("/submissions")
async def create_submission(
    data: SubmissionCreate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Validate GitHub URL (SSRF-safe)
    is_valid, error = validate_github_url(data.github_repo_url)
    if not is_valid:
        raise HTTPException(422, detail={"code": "INVALID_REPO_URL", "message": error})

    # 2. Check assessment exists and is accessible
    assessment = db.query(Assessment).filter(
        Assessment.id == data.assessment_id,
        Assessment.organization_id == org.id,
        Assessment.status == "published"
    ).first()
    if not assessment:
        raise HTTPException(404, detail={"code": "ASSESSMENT_NOT_FOUND"})

    # 3. Check one-attempt constraint
    existing = db.query(Submission).filter(
        Submission.organization_id == org.id,
        Submission.candidate_id == user.id,
        Submission.assessment_id == assessment.id
    ).first()
    if existing:
        raise HTTPException(409, detail={"code": "ALREADY_SUBMITTED"})

    # 4. Create submission
    submission = Submission(
        organization_id=org.id,
        candidate_id=user.id,
        assessment_id=assessment.id,
        github_repo_url=data.github_repo_url,
        explanation_text=data.explanation_text,
        status=SubmissionStatus.SUBMITTED,
        submitted_at=datetime.utcnow()
    )
    db.add(submission)
    db.commit()

    # 5. Enqueue scoring job
    job = queue.enqueue(
        "worker.tasks.score_submission",
        submission_id=str(submission.id),
        organization_id=str(org.id)
    )
    submission.job_id = job.id
    submission.status = SubmissionStatus.QUEUED
    db.commit()

    return {"success": True, "data": SubmissionResponse.from_orm(submission)}
```

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Submission status endpoint | 0.5 hr | `backend/app/api/v1/submissions.py` | GET /submissions/{id} |
| Submission list endpoint | 0.5 hr | `backend/app/api/v1/submissions.py` | GET /submissions (own submissions) |
| RQ worker setup | 1.5 hrs | `backend/app/worker/worker.py` | Worker connects to Redis, picks up jobs |
| Clone task skeleton | 1.5 hrs | `backend/app/worker/tasks/clone.py` | Shallow clone with timeout |

**Dev1 Deliverable**: Submissions API complete, worker picking up jobs.

---

### Dev2: Submission UI + Worker Help (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Assessment detail page | 1.5 hrs | `frontend/src/pages/assessments/AssessmentDetailPage.tsx` | Shows problem statement, requirements |
| Submission form | 1.5 hrs | `frontend/src/pages/submissions/SubmissionForm.tsx` | GitHub URL + explanation textarea |
| Submission status component | 1 hr | `frontend/src/components/SubmissionStatus.tsx` | Polls status, shows progress |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Help Dev1: File filter service | 2 hrs | `backend/app/worker/tasks/file_filter.py` | Filters by extension, size, count limits |
| My submissions page | 1 hr | `frontend/src/pages/submissions/MySubmissionsPage.tsx` | List all user submissions with status |
| Status polling hook | 1 hr | `frontend/src/hooks/useSubmissionStatus.ts` | Polls every 5s until terminal state |

```python
# backend/app/worker/tasks/file_filter.py
# LIMITS FROM ARCHITECTURE DECISIONS - DO NOT CHANGE WITHOUT REVIEW

ALLOWED_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go",
    ".rs", ".cpp", ".c", ".h", ".rb", ".php", ".cs"
}

IGNORED_DIRS = {
    "node_modules", ".git", "__pycache__", "venv", ".venv",
    "dist", "build", ".next", "target", "vendor"
}

# Ignored file patterns (minified, bundled, generated)
IGNORED_PATTERNS = {
    "*.min.js", "*.min.css", "*.bundle.js", "*.chunk.js",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "*.map", "*.d.ts", "*.generated.*"
}

# Hard limits per architecture-decisions.md
MAX_FILE_SIZE = 200 * 1024       # 200KB per file
MAX_FILE_COUNT = 40              # Max 40 files analyzed
MAX_TOTAL_SIZE = 2 * 1024 * 1024 # 2MB total for LLM context
MAX_REPO_SIZE = 100 * 1024 * 1024  # 100MB repo size limit (pre-clone check)
CLONE_TIMEOUT_SECONDS = 60       # Clone operation timeout

def filter_code_files(repo_path: str) -> list[dict]:
    """Filter and collect code files from cloned repo."""
    files = []
    total_size = 0

    for root, dirs, filenames in os.walk(repo_path):
        # Skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                continue

            filepath = os.path.join(root, filename)
            size = os.path.getsize(filepath)

            if size > MAX_FILE_SIZE:
                continue

            if len(files) >= MAX_FILE_COUNT:
                break

            total_size += size
            if total_size > MAX_TOTAL_SIZE:
                break

            with open(filepath, "r", errors="ignore") as f:
                content = f.read()

            files.append({
                "path": os.path.relpath(filepath, repo_path),
                "content": content,
                "size": size
            })

    return files
```

**Dev2 Deliverable**: Submission flow UI complete, file filter implemented.

---

## Day 5 (Friday) - Worker Pipeline + Rate Limits

### Dev1: LLM Scoring + Rate Limits (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| LLM client with provider abstraction | 2 hrs | `backend/app/services/llm.py` | Groq→OpenAI fallback, temp=0, logs to llm_usage_log |
| Scoring prompt builder | 0.75 hr | `backend/app/worker/tasks/scoring.py` | Token budget ~7k context, rubric weights from assessment |
| Score parser + validator | 0.5 hr | `backend/app/worker/tasks/scoring.py` | Validates JSON, retry once with stricter prompt on invalid |
| Define SLO thresholds | 0.25 hr | `backend/app/core/config.py` | API p95 <400ms, job p95 <180s, queue depth <100 |
| Worker stuck-job detector | 0.5 hr | `backend/app/worker/tasks/health.py` | CLONING/SCORING >5min → FAILED + alert |

**LLM Call Discipline** (per architecture-decisions.md):
- Temperature: 0 (deterministic)
- Token budget: ~7k context (truncate files if needed)
- Retry: Once on invalid JSON with stricter "return ONLY JSON" prompt
- Backoff: Exponential on 429/5xx (1s, 2s, 4s, max 3 retries)
- Timeout: Groq 30s, OpenAI 60s

```python
# backend/app/services/llm.py

from enum import Enum
import httpx

class LLMProvider(str, Enum):
    GROQ = "groq"
    OPENAI = "openai"

PROVIDER_CONFIG = {
    LLMProvider.GROQ: {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.1-70b-versatile",
        "env_key": "GROQ_API_KEY",
        "timeout": 30,
        "cost_per_1k_input": 0.00059,
        "cost_per_1k_output": 0.00079,
    },
    LLMProvider.OPENAI: {
        "url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
        "timeout": 60,
        "cost_per_1k_input": 0.005,
        "cost_per_1k_output": 0.015,
    },
}

PROVIDER_ORDER = [LLMProvider.GROQ, LLMProvider.OPENAI]

async def call_llm(
    messages: list[dict],
    organization_id: str,
    submission_id: str,
    db: Session
) -> dict:
    """Call LLM with fallback and cost tracking."""

    # Check org budget first
    if not check_org_budget(organization_id, db):
        raise BudgetExceededError("Organization LLM budget exceeded")

    last_error = None
    for provider in PROVIDER_ORDER:
        config = PROVIDER_CONFIG[provider]
        api_key = os.getenv(config["env_key"])
        if not api_key:
            continue

        try:
            response = await _call_provider(provider, config, api_key, messages)

            # Log usage
            log_llm_usage(
                organization_id=organization_id,
                submission_id=submission_id,
                provider=provider,
                response=response,
                success=True,
                db=db
            )

            return response
        except Exception as e:
            last_error = e
            log_llm_usage(
                organization_id=organization_id,
                submission_id=submission_id,
                provider=provider,
                error=str(e),
                success=False,
                db=db
            )
            continue

    raise LLMProviderError(f"All providers failed: {last_error}")
```

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Complete scoring task | 1.5 hrs | `backend/app/worker/tasks/score_submission.py` | End-to-end: clone (with timeout) → filter → score → save |
| Rate limit middleware | 1 hr | `backend/app/middleware/rate_limit.py` | Redis-backed, per-user (5 submissions/hr) + per-org limits |
| Per-org LLM budget check | 1 hr | `backend/app/services/budget.py` | Query llm_usage_log, alert at 80%, hard block at 100% |
| Failed-queue cleanup job | 0.5 hr | `backend/app/worker/tasks/cleanup.py` | Purge RQ failed queue entries >30 days, keep DLQ for debugging |

**LLM Budget Requirements**:
- All LLM calls MUST log to `llm_usage_log` (cost, tokens, latency, success, attempt_number)
- `check_org_budget()` queries daily/monthly spend from `llm_usage_log`
- At 80% of daily budget: log warning, continue
- At 100% of daily budget: raise `BudgetExceededError`, block request

```python
# backend/app/worker/tasks/score_submission.py

def score_submission(submission_id: str, organization_id: str):
    """Main worker task: score a submission."""
    db = SessionLocal()
    temp_dir = None

    try:
        submission = db.query(Submission).filter(
            Submission.id == submission_id,
            Submission.organization_id == organization_id
        ).first()

        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        # 1. Update status: CLONING
        submission.status = SubmissionStatus.CLONING
        submission.clone_started_at = datetime.utcnow()
        db.commit()

        # 2. Clone repository
        temp_dir = tempfile.mkdtemp()
        clone_result = clone_repo(submission.github_repo_url, temp_dir)

        if not clone_result.success:
            submission.status = SubmissionStatus.CLONE_FAILED
            submission.error_message = clone_result.error
            db.commit()
            return

        submission.commit_sha = clone_result.commit_sha
        submission.clone_completed_at = datetime.utcnow()

        # 3. Filter code files
        files = filter_code_files(temp_dir)
        if not files:
            submission.status = SubmissionStatus.CLONE_FAILED
            submission.error_message = "No supported code files found"
            db.commit()
            return

        submission.analyzed_files = [f["path"] for f in files]

        # 4. Update status: SCORING
        submission.status = SubmissionStatus.SCORING
        db.commit()

        # 5. Get assessment for rubric weights
        assessment = db.query(Assessment).filter(
            Assessment.id == submission.assessment_id
        ).first()

        # 6. Build prompt and call LLM
        prompt = build_scoring_prompt(assessment, files, submission.explanation_text)

        response = call_llm_sync(
            messages=[{"role": "user", "content": prompt}],
            organization_id=organization_id,
            submission_id=submission_id,
            db=db
        )

        # 7. Parse and validate scores
        scores = parse_scores(response)

        # 8. Save AI scores
        ai_score = AIScore(
            organization_id=organization_id,
            submission_id=submission_id,
            code_correctness=scores["correctness"],
            code_quality=scores["quality"],
            code_readability=scores["readability"],
            code_robustness=scores["robustness"],
            reasoning_clarity=scores["clarity"],
            reasoning_depth=scores["depth"],
            reasoning_structure=scores["structure"],
            overall_comment=scores.get("comment", ""),
            raw_response=response
        )
        db.add(ai_score)

        # 9. Calculate final score
        final_score = calculate_weighted_score(scores, assessment)
        submission.final_score = final_score
        submission.status = SubmissionStatus.EVALUATED
        submission.evaluated_at = datetime.utcnow()
        submission.job_completed_at = datetime.utcnow()

        db.commit()

    except BudgetExceededError as e:
        submission.status = SubmissionStatus.SCORE_FAILED
        submission.error_message = "Organization budget exceeded"
        db.commit()

    except Exception as e:
        submission.status = SubmissionStatus.SCORE_FAILED
        submission.error_message = str(e)
        submission.retry_count += 1
        db.commit()
        raise

    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        db.close()
```

**Dev1 Deliverable**: Complete scoring pipeline, rate limits working.

---

### Dev2: Dashboard + Results Display (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Dashboard home page | 2 hrs | `frontend/src/pages/dashboard/DashboardPage.tsx` | Stats, recent submissions, quick actions |
| Score display component | 1 hr | `frontend/src/components/ScoreDisplay.tsx` | Shows rubric scores with weights |
| Skill radar chart | 1 hr | `frontend/src/components/SkillRadarChart.tsx` | Recharts radar for 7 dimensions |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Submission detail page | 2 hrs | `frontend/src/pages/submissions/SubmissionDetailPage.tsx` | Full scores, files analyzed, timestamps |
| Loading skeletons | 1 hr | `frontend/src/components/ui/Skeleton.tsx` | Skeleton loaders for all pages |
| Error boundaries | 1 hr | `frontend/src/components/ErrorBoundary.tsx` | Graceful error handling |

**Dev2 Deliverable**: Dashboard, score display, submission details complete.

---

# WEEK 2: Frontend + Hardening + Polish

## Day 6 (Monday) - Admin Tools + Leaderboard

### Dev1: Admin APIs (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Assessment CRUD (admin) | 1.5 hrs | `backend/app/api/v1/admin/assessments.py` | Create, update, archive (require_role("admin", "owner")) |
| Rescore endpoint | 1 hr | `backend/app/api/v1/admin/submissions.py` | Re-enqueue submission, write to admin_audit_log |
| Manual score override | 1 hr | `backend/app/api/v1/admin/submissions.py` | Override scores, MUST write to admin_audit_log with old/new values |
| Maintenance mode toggle | 0.5 hr | `backend/app/api/v1/admin/system.py` | Toggle maintenance_mode in system_config, blocks new submissions when ON |

**AUDIT REQUIREMENT**: All admin actions (rescore, override, status change) MUST log to `admin_audit_log` with:
- `admin_id`, `action`, `target_type`, `target_id`
- `old_value`, `new_value` (JSONB)
- `reason` (required for overrides)

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Leaderboard API | 1.5 hrs | `backend/app/api/v1/leaderboard.py` | Ranked candidates by score (org-scoped) |
| Queue status API | 1 hr | `backend/app/api/v1/admin/queue.py` | Pending jobs, avg processing time |
| Submission search/filter | 1.5 hrs | `backend/app/api/v1/admin/submissions.py` | Filter by status, assessment, date |

```python
# backend/app/api/v1/leaderboard.py

@router.get("/leaderboard")
async def get_leaderboard(
    assessment_id: Optional[UUID] = None,
    limit: int = Query(default=50, le=100),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db)
):
    """Get ranked candidates by score."""
    query = db.query(
        Submission.candidate_id,
        User.name,
        User.email,
        Submission.final_score,
        Submission.evaluated_at
    ).join(User, User.id == Submission.candidate_id).filter(
        Submission.organization_id == org.id,
        Submission.status == SubmissionStatus.EVALUATED
    )

    if assessment_id:
        query = query.filter(Submission.assessment_id == assessment_id)

    results = query.order_by(
        Submission.final_score.desc()
    ).limit(limit).all()

    leaderboard = [
        {
            "rank": idx + 1,
            "candidate_id": str(r.candidate_id),
            "name": r.name or "Anonymous",
            "score": float(r.final_score),
            "evaluated_at": r.evaluated_at.isoformat()
        }
        for idx, r in enumerate(results)
    ]

    return {"success": True, "data": leaderboard}
```

**Dev1 Deliverable**: Admin APIs complete, leaderboard working.

---

### Dev2: Admin UI + Leaderboard Page (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Admin layout/nav | 1 hr | `frontend/src/components/AdminLayout.tsx` | Admin-only navigation |
| Assessment management page | 2 hrs | `frontend/src/pages/admin/AssessmentsManagePage.tsx` | CRUD UI for assessments |
| Assessment form | 1 hr | `frontend/src/components/admin/AssessmentForm.tsx` | All fields including weights |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Leaderboard page | 2 hrs | `frontend/src/pages/leaderboard/LeaderboardPage.tsx` | Ranked table with filters |
| Queue monitor page | 1 hr | `frontend/src/pages/admin/QueueMonitorPage.tsx` | Job counts, status breakdown |
| Submission admin list | 1 hr | `frontend/src/pages/admin/SubmissionsAdminPage.tsx` | Search, filter, rescore button |

**Dev2 Deliverable**: Admin UI complete, leaderboard page working.

---

## Day 7 (Tuesday) - Integration + Bug Fixes

### Dev1: Integration Tests + Fixes (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Cross-org isolation tests | 2 hrs | `backend/tests/test_isolation.py` | Verify can't access other org data |
| Full submission flow test | 1.5 hrs | `backend/tests/test_submission_flow.py` | Create → queue → score → complete |
| Mock scorer harness | 1 hr | `backend/tests/mocks/scorer.py` | Offline scorer validates file filter + scoring math without live LLM |
| Rate limit tests | 1 hr | `backend/tests/test_rate_limits.py` | Verify limits enforced |
| Bug fixes from testing | 2.5 hrs | Various | Fix issues found in integration |

**Mock Scorer**: Creates deterministic scores for testing without LLM calls. Validates:
- File filter correctly ignores minified/bundled files
- Token budget truncation works
- Score calculation math is correct

**Dev1 Deliverable**: Integration tests passing, mock scorer working, critical bugs fixed.

---

### Dev2: E2E Flow Testing + Polish (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Manual E2E testing | 2 hrs | - | Full flow works: login → submit → see score |
| UI polish + responsive | 2 hrs | Various CSS | Mobile-friendly, consistent styling |
| Error message improvements | 1 hr | Various | User-friendly error messages |
| Loading states everywhere | 1 hr | Various | No jarring blank states |
| Bug fixes | 2 hrs | Various | Fix UI issues found |

**Dev2 Deliverable**: Polished UI, E2E flow verified.

---

## Day 8 (Wednesday) - Monitoring + Points + Notifications

### Dev1: Observability + Points + Notifications (8 hrs)

**Morning (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Structured logging setup | 1 hr | `backend/app/core/logging.py` | JSON logs with request_id, org_id |
| Metrics endpoint | 1 hr | `backend/app/api/v1/metrics.py` | Queue depth, job times, error rates |
| Health check enhancements | 0.5 hr | `backend/app/api/v1/router.py` | Check DB + Redis connectivity |
| Email notification service | 1 hr | `backend/app/services/notifications.py` | Brevo transactional: scoring complete/failed |
| Admin alert service | 0.5 hr | `backend/app/services/alerts.py` | Critical alerts: LLM failure spike, queue depth >100 |

**Afternoon (4 hrs)**

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Points award service | 1.5 hrs | `backend/app/services/points.py` | Award points per architecture-decisions.md values |
| Points on submission complete | 1 hr | `backend/app/worker/tasks/score_submission.py` | Award points based on score thresholds |
| Profile points calculation | 0.5 hr | `backend/app/api/v1/profiles.py` | Award points for completing profile fields |
| Activity log integration | 1 hr | `backend/app/services/activity.py` | Log significant events to activity_log |

```python
# backend/app/services/points.py
# Point values from architecture-decisions.md - keep in sync!

POINT_EVENTS = {
    # Profile completion
    "profile_complete": 100,
    "github_verified": 50,
    "resume_uploaded": 25,
    # Submissions
    "first_submission": 200,
    "submission_score_70plus": 100,
    "submission_score_90plus": 200,
    # Consistency bonus (per architecture-decisions.md)
    "consecutive_week_submission": 50,
}

def award_points(
    user_id: UUID,
    organization_id: UUID,
    event: str,
    metadata: dict = None,
    db: Session = None
) -> int:
    """Award points for an event (idempotent)."""
    if event not in POINT_EVENTS:
        return 0

    # Check if already awarded (unique constraint: org + user + event)
    existing = db.query(PointsLog).filter(
        PointsLog.organization_id == organization_id,
        PointsLog.user_id == user_id,
        PointsLog.event == event
    ).first()

    if existing:
        return 0  # Already awarded

    points = POINT_EVENTS[event]

    log = PointsLog(
        organization_id=organization_id,
        user_id=user_id,
        event=event,
        points=points,
        metadata=metadata
    )
    db.add(log)

    # Update profile total
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.organization_id == organization_id,
        CandidateProfile.user_id == user_id
    ).first()

    if profile:
        profile.total_points += points

    db.commit()
    return points
```

**Points System Requirements**:
- `points_log` has UNIQUE(organization_id, user_id, event) - prevents duplicate awards
- `award_points()` checks this constraint before inserting
- Profile `total_points` is updated atomically
- Activity logged for each point award

**Dev1 Deliverable**: Monitoring ready, notifications working, points system with unique constraints.

---

### Dev2: Profile Enhancements + Points Display (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Points display component | 1 hr | `frontend/src/components/PointsDisplay.tsx` | Shows total + breakdown |
| Profile completion progress | 1.5 hrs | `frontend/src/components/ProfileProgress.tsx` | Visual progress indicator |
| Achievements/badges component | 1.5 hrs | `frontend/src/components/Achievements.tsx` | Display earned badges |
| Public profile preview | 2 hrs | `frontend/src/pages/profile/PublicProfilePage.tsx` | Shareable profile view |
| Profile settings (visibility) | 2 hrs | `frontend/src/pages/profile/ProfileSettingsPage.tsx` | Toggle public visibility |

**Dev2 Deliverable**: Points display, profile enhancements complete.

---

## Day 9 (Thursday) - Security + Load Testing

### Dev1: Security Hardening (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Input validation audit | 2 hrs | All schemas | All inputs have max lengths, patterns |
| SQL injection review | 1 hr | All queries | Verify all use ORM, no raw SQL |
| CORS configuration | 1 hr | `backend/app/main.py` | Proper origins, methods, headers |
| Secret management review | 1 hr | Config | No secrets in code, proper env handling |
| Load test setup | 1.5 hrs | `backend/tests/load/` | Locust or similar setup |
| Load test execution | 1.5 hrs | - | 50 concurrent users, identify bottlenecks |

**Dev1 Deliverable**: Security audit complete, load test results.

---

### Dev2: Error Handling + Edge Cases (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Global error handler | 1 hr | `frontend/src/lib/api.ts` | Consistent error handling |
| Offline state handling | 1 hr | Various | Graceful offline behavior |
| Session expiry handling | 1 hr | `frontend/src/contexts/AuthContext.tsx` | Redirect on token expiry |
| Edge case UI states | 2 hrs | Various | Empty states, error states everywhere |
| Accessibility audit | 1.5 hrs | Various | Keyboard nav, ARIA labels |
| Final UI review | 1.5 hrs | - | Consistent look and feel |

**Dev2 Deliverable**: Robust error handling, accessible UI.

---

## Day 10 (Friday) - Deployment Prep + Launch

### Dev1: Deployment (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Dockerfile optimization | 1 hr | `backend/Dockerfile` | Multi-stage build, minimal image |
| docker-compose.prod.yml | 1 hr | `docker-compose.prod.yml` | Production config |
| Environment config docs | 1 hr | `DEPLOYMENT.md` | All env vars documented |
| Database backup script | 1 hr | `scripts/backup.py` | pg_dump automation |
| Deploy to staging | 2 hrs | - | Full stack running |
| Smoke tests on staging | 1 hr | - | Critical paths work |
| Production deploy | 1 hr | - | Go live! |

**Dev1 Deliverable**: Production deployment complete.

---

### Dev2: Launch Prep (8 hrs)

| Task | Time | Files | Acceptance Criteria |
|------|------|-------|---------------------|
| Frontend build optimization | 1 hr | `vite.config.ts` | Code splitting, tree shaking |
| Static asset optimization | 1 hr | - | Compressed, cached properly |
| SEO meta tags | 1 hr | `index.html`, pages | Title, description, OG tags |
| Landing page (if needed) | 2 hrs | `frontend/src/pages/LandingPage.tsx` | Marketing page |
| User onboarding flow | 2 hrs | `frontend/src/components/Onboarding.tsx` | First-time user guide |
| Final testing on staging | 1 hr | - | All flows work |

**Dev2 Deliverable**: Frontend optimized and deployed.

---

# Dependencies Diagram

```
Day 1: Bootstrap
  Dev1: Backend skeleton ──────────────────┐
  Dev2: Frontend skeleton ─────────────────┤
                                           │
Day 2: Data Layer                          │
  Dev1: Models + Migrations ◄──────────────┘
  Dev2: Test fixtures (needs models) ◄─────┘

Day 3: APIs
  Dev1: Auth + Org APIs ◄── Models
  Dev2: Profile UI ◄── API client ready

Day 4: Submissions
  Dev1: Submissions API ◄── Auth deps
  Dev2: Submission UI ◄── Submissions API

Day 5: Worker
  Dev1: LLM Scoring ◄── Submissions API (enqueue)
  Dev2: Results display ◄── Scoring complete

Day 6-10: Parallel tracks
  Dev1: Admin APIs, Testing, Deployment
  Dev2: Admin UI, Polish, Optimization
```

---

# Daily Standup Questions

Each morning, answer:

1. **What did you complete yesterday?** (Reference task IDs)
2. **What are you working on today?**
3. **Any blockers?**

---

# Risk Mitigations Built Into Plan

| Risk | Mitigation in Plan |
|------|-------------------|
| LLM provider outage | Day 5: Provider abstraction + fallback (Groq → OpenAI) |
| LLM invalid JSON | Day 5: Retry once with stricter prompt, backoff on 429/5xx |
| Database issues in tests | Day 2: Postgres test container (pgvector image), not SQLite |
| Cross-org data leaks | Day 7: Explicit isolation tests, org header required in all tests |
| Rate limit abuse | Day 5: Redis-backed rate limits (5 submissions/hr/user) |
| Budget overrun | Day 5: Per-org LLM caps (80% alert, 100% hard stop) |
| Load spikes | Day 9: Load testing before launch |
| Repo abuse (large repos) | Day 3-4: 100MB limit, cached repo checks, 40 files, 60s clone timeout |
| SSRF attacks | Day 3: GitHub URL validation with IP denylist, default-branch only |
| Admin abuse | Day 6: All admin actions logged to admin_audit_log |
| Schema drift | Day 2: Models MUST match database-schema.md exactly |
| Timeline slip | Days 11-12: Contingency buffer, non-critical features can slip |
| Stuck jobs | Day 5: Detector marks CLONING/SCORING >5min as FAILED + alert |
| Failed queue bloat | Day 5: Cleanup job purges >30 day entries, keeps DLQ |
| Maintenance emergencies | Day 6: Admin toggle for maintenance_mode blocks new submissions |
| Scoring without LLM | Day 7: Mock scorer for tests validates file filter + math |
| Email delivery | Day 8: Brevo transactional for scoring complete/failed |
| Admin alerts | Day 8: Critical alerts for LLM failure spike, queue depth >100 |

---

# Success Criteria for Private Beta

By end of Day 10 (or Day 12 with buffer):

**Auth & Users**
- [ ] 100 users can authenticate via Firebase and appear in `/auth/me`
- [ ] Users belong to at least one organization
- [ ] Organization context (X-Organization-Id) enforced on all API calls
- [ ] Admin invites work (create, accept, expire)

**Core Flow**
- [ ] Users can complete profile (with resume upload: PDF/DOCX, 20MB max)
- [ ] Users can submit to assessments
- [ ] One-attempt constraint enforced per user/assessment/org
- [ ] Submissions scored within 3 minutes (p95 < 180s)
- [ ] Leaderboard shows ranked candidates (org-scoped)
- [ ] Email notifications sent on scoring complete/failed

**Admin**
- [ ] Admins can create assessments and view submissions
- [ ] Admin overrides logged to admin_audit_log
- [ ] Rescore functionality works
- [ ] Maintenance mode toggle blocks new submissions

**Guardrails**
- [ ] Rate limits prevent abuse (5 submissions/hr/user)
- [ ] LLM costs tracked per org in llm_usage_log
- [ ] Budget caps enforced (alert 80%, block 100%)
- [ ] Repo size limits enforced (100MB, 40 files, default-branch only)
- [ ] GitHub repo checks cached to avoid rate limits
- [ ] Stuck jobs detected and marked failed after 5min

**Operations**
- [ ] System handles 50 concurrent submissions
- [ ] Monitoring shows queue depth, job latency, error rates
- [ ] API p95 < 400ms
- [ ] Cross-org isolation verified by tests
- [ ] Mock scorer works for offline testing
- [ ] CORS whitelist configured per architecture-decisions.md

---

# Architecture Alignment Checklist

**Before marking sprint complete, verify ALL items are implemented.**

> **IMPORTANT**:
> - Use this checklist in PR reviews and sprint done criteria
> - If you change any values in code (rate limits, timeouts, thresholds), update this checklist to avoid drift
> - Reference `architecture-decisions.md` for authoritative values

## Auth & Multi-Tenancy
- [ ] Admin invites: org-scoped invite/accept flow (invite-only admin creation)
- [ ] All APIs require `X-Organization-Id` header
- [ ] All queries filter by `organization_id`
- [ ] Role-based access via `require_role()` dependency
- [ ] Seed script creates default org + admin for local/staging

## System Config & Maintenance
- [ ] `system_config` table with key-value store
- [ ] `maintenance_mode` flag implemented
- [ ] Admin toggle endpoint to pause new submissions
- [ ] Submissions API checks maintenance_mode before accepting

## Logging & Audit
- [ ] `activity_log`: key events (submission created, scored, profile updated)
- [ ] `admin_audit_log`: overrides, rescoring, membership changes, status changes
- [ ] All admin actions include `old_value`, `new_value`, `reason`
- [ ] Logs include `organization_id`, `actor_id`, timestamps

## Resume Uploads
- [ ] PDF/DOCX only (MIME-type validation)
- [ ] 20MB max file size
- [ ] Storage path: `resumes/{user_id}/{timestamp}_{filename}`
- [ ] AV scanning: explicitly deferred to Phase 2

## GitHub Validation
- [ ] SSRF-safe: IP denylist (localhost, 10.x, 172.16.x, 192.168.x, 169.254.x)
- [ ] Cache repo metadata (5min TTL) to avoid rate limits
- [ ] Use GitHub PAT if `GITHUB_PAT` env var set
- [ ] Enforce default branch only (no arbitrary refs)
- [ ] Ignore minified/bundled files: `*.min.js`, `*.bundle.js`, `*.chunk.js`
- [ ] Ignore lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- [ ] Pre-enqueue size check via GitHub API (100MB limit)

## Worker Reliability
- [ ] Stuck-job detector: CLONING/SCORING >5min → mark FAILED + alert
- [ ] Failed-queue cleanup: purge entries >30 days
- [ ] DLQ (RQ failed queue) retained for debugging
- [ ] Clone timeout: 60 seconds
- [ ] Job timeout: 180 seconds total

## LLM Discipline
- [ ] Temperature: 0 (deterministic)
- [ ] Prompt token cap: ~7k context (truncate files if needed)
- [ ] Invalid JSON retry: once with stricter "return ONLY valid JSON" prompt
- [ ] Backoff on 429/5xx: exponential (1s, 2s, 4s), max 3 retries
- [ ] Provider fallback: Groq primary → OpenAI backup
- [ ] All calls logged to `llm_usage_log` (tokens, cost, latency, attempt_number, success)
- [ ] Per-org budget: warn at 80%, hard stop at 100%

## Rate Limits & Caps
- [ ] API default: 100 requests/minute
- [ ] Submissions: 5/hour per user
- [ ] Org-level submission cap (configurable)
- [ ] Repo limits: 100MB, 40 files, 200KB/file
- [ ] Clone timeout: 60 seconds
- [ ] Download rate limit (if applicable)

## Points & Vibe Score
- [ ] Point values per architecture-decisions.md
- [ ] Consistency bonus: `consecutive_week_submission`
- [ ] `points_log` UNIQUE(organization_id, user_id, event) enforced
- [ ] Profile `total_points` updated atomically
- [ ] Activity logged for each point award

## Notifications
- [ ] Scoring complete email (Brevo transactional)
- [ ] Scoring failed email (Brevo transactional)
- [ ] Admin alerts: LLM failure rate spike (>10% in 5min)
- [ ] Admin alerts: Queue depth >100 jobs

## Security & CORS
- [ ] CORS whitelist per architecture-decisions.md
- [ ] No secrets in code or logs
- [ ] Input validation on all endpoints (Pydantic)
- [ ] SQL injection prevented (ORM only)

## Testing & CI
- [ ] Postgres only (no SQLite) - pgvector/pgvector:pg16 image
- [ ] pgvector extension enabled (for future embeddings)
- [ ] Cross-org isolation tests
- [ ] Mock/offline scorer harness (no live LLM in tests)
- [ ] All test requests include org header

## Monitoring & SLOs
- [ ] API p95 < 400ms
- [ ] Job completion p95 < 180s
- [ ] Queue depth alert threshold: 100
- [ ] LLM failure rate alert: >10% in 5min window
- [ ] Metrics endpoint exposes: queue depth, job latency, error rates

## Data Retention (Document in DEPLOYMENT.md)
- [ ] Failed jobs: 30 days
- [ ] Audit logs: 1 year
- [ ] LLM usage logs: 1 year
- [ ] Activity logs: 90 days (configurable)

## Environment & Seeding
- [ ] `.env.example` with all required vars
- [ ] Seed script: default org + admin user + membership
- [ ] Seed script: system_config defaults (maintenance_mode=false)
- [ ] pgvector extension ready (even if embeddings deferred)

---

# Contingency Buffer (Days 11-12)

If core path slips, use these days for:

**Day 11 (If Needed)**
- Bug fixes from integration testing
- Performance optimization
- Missing test coverage
- Documentation gaps

**Day 12 (If Needed)**
- Deployment issues
- Load test fixes
- Final polish

**What Can Slip to Phase 2**:
- Admin search/filter UI (use basic list)
- Leaderboard pagination (show top 50 only)
- Public profile sharing
- Points display (backend works, frontend later)
- Achievements/badges UI

**What Cannot Slip**:
- Core submission → scoring flow
- Org-scoped data isolation
- Rate limits and budget caps
- LLM fallback
- Admin override with audit log

---

# Post-Sprint: Phase 2 Readiness

After this sprint, you'll have the foundation for:

1. **Hackathon Layer** (FutureDev League)
   - Add `events` table (org-scoped)
   - Event-specific leaderboards
   - Countdown timer, submission caps
   - Certificates/badges generation

2. **Public Talent Graph**
   - Public profile endpoints
   - Talent search with filters
   - Company dashboard

The core scoring engine, org-scoping, and user management are done.

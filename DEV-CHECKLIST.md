# Vibe Platform - Developer Checklists

Quick reference checklists for common development tasks.

---

## Checklist 1: Starting a New Feature

Before writing any code:

- [ ] Read the relevant user story in `epics-user-stories.md`
- [ ] Check `architecture-decisions.md` for related decisions
- [ ] Identify which models/tables are involved
- [ ] Check if migration is needed
- [ ] Create a feature branch: `git checkout -b feature/STORY-ID-short-name`

---

## Checklist 2: Creating a New API Endpoint

```python
# Template for a new endpoint
@router.post("/resource")
async def create_resource(
    data: ResourceCreate,                              # 1. Request schema
    org: Organization = Depends(get_current_org),      # 2. Org context (REQUIRED)
    membership: OrganizationUser = Depends(require_role("admin")),  # 3. Role check (if needed)
    current_user: User = Depends(get_current_verified_user),  # 4. User (if needed)
    db: Session = Depends(get_db)                      # 5. Database session
):
    # 6. Business logic
    resource = Resource(
        organization_id=org.id,  # ALWAYS set org_id
        created_by=current_user.id,
        **data.dict()
    )
    db.add(resource)
    db.commit()

    # 7. Standard response format
    return {"success": True, "data": resource}
```

Checklist:
- [ ] Endpoint has Pydantic request schema
- [ ] Endpoint has Pydantic response schema
- [ ] Uses `get_current_org` dependency
- [ ] Uses `require_role()` if admin-only
- [ ] Uses `get_current_verified_user` if sensitive action
- [ ] All DB operations filter by `organization_id`
- [ ] Returns standard `{success, data}` or `{success, error}` format
- [ ] Has docstring explaining purpose
- [ ] Added to router in `api/v1/router.py`

---

## Checklist 3: Creating a New Database Model

```python
# Template for a new model
class Resource(Base):
    __tablename__ = "resources"

    # 1. Always UUID primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # 2. Organization FK for tenant-scoped data
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # 3. Business fields
    name = Column(String(255), nullable=False)
    status = Column(SQLEnum(ResourceStatus), default=ResourceStatus.ACTIVE)

    # 4. Audit fields
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 5. Relationships (optional)
    organization = relationship("Organization", back_populates="resources")
```

Checklist:
- [ ] Uses UUID primary key
- [ ] Has `organization_id` FK (if tenant-scoped)
- [ ] Has `created_at` and `updated_at` timestamps
- [ ] FKs have `ondelete="CASCADE"` where appropriate
- [ ] Enums defined for status fields
- [ ] Added to `models/__init__.py`
- [ ] Created Alembic migration

---

## Checklist 4: Creating an Alembic Migration

```bash
# Generate migration from model changes
alembic revision --autogenerate -m "add resources table"

# Always review the generated migration!
cat alembic/versions/xxxx_add_resources_table.py
```

Review checklist:
- [ ] Migration creates correct tables/columns
- [ ] Indexes are created for frequently queried columns
- [ ] Unique constraints are correct
- [ ] Foreign keys point to correct tables
- [ ] `downgrade()` properly reverses changes
- [ ] No data loss in downgrade

```bash
# Apply migration
alembic upgrade head

# Verify
alembic current
```

---

## Checklist 5: Adding a Frontend Page

```
src/pages/feature/FeaturePage.tsx
```

Structure:
```typescript
export function FeaturePage() {
  // 1. Get organization context
  const { currentOrg } = useOrganization();

  // 2. Fetch data with React Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['feature', currentOrg?.id],
    queryFn: () => apiClient.get('/feature'),
    enabled: !!currentOrg,  // Don't fetch without org
  });

  // 3. Loading state
  if (isLoading) return <LoadingSkeleton />;

  // 4. Error state
  if (error) return <ErrorDisplay error={error} />;

  // 5. Empty state
  if (!data?.length) return <EmptyState />;

  // 6. Data display
  return (
    <div>
      {/* Content */}
    </div>
  );
}
```

Checklist:
- [ ] Uses organization context
- [ ] React Query for data fetching
- [ ] Loading skeleton while fetching
- [ ] Error state with user-friendly message
- [ ] Empty state with helpful CTA
- [ ] Page added to router in `App.tsx`
- [ ] Protected route if authentication required

---

## Checklist 6: Writing Tests

### Backend API Test

```python
def test_feature_endpoint(client, auth_headers, test_org, db):
    # 1. Setup - create required data
    # 2. Set org header
    auth_headers["X-Organization-Id"] = str(test_org.id)

    # 3. Make request
    response = client.post("/api/v1/feature", json={...}, headers=auth_headers)

    # 4. Assert status
    assert response.status_code == 201

    # 5. Assert response structure
    data = response.json()
    assert data["success"] is True
    assert "id" in data["data"]

    # 6. Assert database state
    from_db = db.query(Feature).filter(Feature.id == data["data"]["id"]).first()
    assert from_db is not None
    assert from_db.organization_id == test_org.id
```

Checklist:
- [ ] Test happy path (success case)
- [ ] Test validation errors (400)
- [ ] Test not found (404)
- [ ] Test unauthorized (401)
- [ ] Test forbidden (403)
- [ ] Test duplicate/conflict (409)
- [ ] Test org isolation (can't access other org's data)

### Frontend Component Test

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { FeaturePage } from './FeaturePage';

test('renders feature list', async () => {
  // 1. Mock API
  server.use(
    rest.get('/api/v1/feature', (req, res, ctx) => {
      return res(ctx.json({ success: true, data: mockFeatures }));
    })
  );

  // 2. Render with providers
  render(<FeaturePage />, { wrapper: TestProviders });

  // 3. Wait for data
  await waitFor(() => {
    expect(screen.getByText('Feature Name')).toBeInTheDocument();
  });
});
```

---

## Checklist 7: Pre-PR Review (Self-Review)

Before creating a PR, verify:

### Code Quality
- [ ] No `console.log` statements left in code
- [ ] No commented-out code blocks
- [ ] No TODO comments (create issues instead)
- [ ] Functions have docstrings/comments for complex logic
- [ ] Variable names are descriptive

### Security
- [ ] No hardcoded secrets or API keys
- [ ] User input is validated
- [ ] SQL queries use parameterized queries (ORM)
- [ ] All queries filter by `organization_id`

### Testing
- [ ] New code has tests
- [ ] All tests pass locally: `pytest tests/ -v`
- [ ] Frontend tests pass: `npm test`

### Documentation
- [ ] API changes documented in docstrings
- [ ] Complex logic has inline comments
- [ ] README updated if setup steps changed

---

## Checklist 8: Database Query Safety

Every database query must be checked:

```python
# DANGEROUS - Missing org filter
db.query(Submission).filter(Submission.status == "EVALUATED").all()

# SAFE - Always include org_id
db.query(Submission).filter(
    Submission.organization_id == org.id,  # THIS IS REQUIRED
    Submission.status == "EVALUATED"
).all()
```

Before committing any query:
- [ ] Query includes `organization_id` filter
- [ ] Query uses ORM (not raw SQL)
- [ ] Joins don't leak cross-org data
- [ ] Results limited with `.limit()` for large tables

---

## Checklist 9: Worker Job Implementation

```python
def process_job(job_id: str, organization_id: str, ...):
    db = SessionLocal()  # Own session
    try:
        # 1. Update status to in-progress
        # 2. Do work
        # 3. Update status on success
        # 4. Handle errors with proper status
    except Exception as e:
        # 5. Log error
        # 6. Update status to failed
        raise
    finally:
        # 7. ALWAYS close session
        db.close()
```

Checklist:
- [ ] Creates own database session
- [ ] Updates job status throughout
- [ ] Has proper error handling
- [ ] Closes session in `finally` block
- [ ] Uses `organization_id` in all queries
- [ ] Has timeout configured
- [ ] Cleans up temporary files

---

## Checklist 10: PR Description Template

```markdown
## What does this PR do?
Brief description of changes.

## Related Issue
Closes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing Done
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Cross-org isolation verified

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Tests pass locally
- [ ] No console.log/debug code
- [ ] Migrations included (if needed)

## Screenshots (if UI change)
Before: ...
After: ...
```

---

## Checklist 11: Multi-Tenancy & Org Limits

Every feature must respect organization boundaries:

### Query Safety
- [ ] All queries include `organization_id` filter
- [ ] Joins don't leak cross-org data
- [ ] User can only access orgs they belong to

### Rate Limits (verify implementation)
```python
# API rate limits (per endpoint)
RATE_LIMITS = {
    "default": "100/minute",           # General API calls
    "submission": "5/hour",            # Per user submission rate
    "auth": "10/minute",               # Auth-related endpoints
    "file_upload": "10/minute",        # Resume uploads
}
```

- [ ] Rate limiter middleware is applied
- [ ] Redis connection for rate limit storage
- [ ] User-specific rate limits enforced
- [ ] Org-wide rate limits checked

### Per-Org Cost Caps
```python
# Default org limits (organization_limits table)
DEFAULT_LIMITS = {
    "daily_llm_budget_usd": 10.00,     # Daily LLM spending cap
    "monthly_llm_budget_usd": 100.00,  # Monthly cap
    "max_concurrent_jobs": 5,          # Parallel scoring jobs
    "max_submissions_per_day": 50,     # Org-wide submission limit
}
```

- [ ] Check org budget before LLM call
- [ ] Track usage in `llm_usage_log`
- [ ] Reject requests when budget exceeded (HTTP 429)
- [ ] Alert mechanism for approaching limits

### SSRF Protection (GitHub URL validation)
- [ ] GitHub URLs validated with regex
- [ ] DNS resolution checked for private IPs
- [ ] Blocked networks: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
- [ ] Clone timeout enforced (60s default)
- [ ] Max repo size limit (100MB)

---

## Checklist 12: LLM Provider Configuration

The platform uses provider abstraction with fallback:

### Provider Order
1. **Groq** (primary) - Fast, cost-effective
2. **OpenAI** (fallback) - Reliable backup

### Environment Variables
```bash
# Required
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...

# Optional overrides
LLM_PRIMARY_PROVIDER=groq
LLM_FALLBACK_ENABLED=true
LLM_MAX_RETRIES=3
```

### Before Deployment
- [ ] Both API keys configured
- [ ] Provider fallback tested manually
- [ ] Cost tracking enabled in `llm_usage_log`
- [ ] Timeout configured per provider (Groq: 30s, OpenAI: 60s)
- [ ] Error handling for rate limits (retry with backoff)

### Worker Job Checklist
- [ ] Job checks org budget before LLM call
- [ ] Primary provider attempted first
- [ ] On failure, fallback provider used
- [ ] All attempts logged with `attempt_number`
- [ ] Cost calculated and recorded per attempt

---

## Checklist 13: Testing with Postgres

**IMPORTANT**: Never use SQLite for tests. Our models use Postgres-specific features.

### Required Features (SQLite incompatible)
- UUID primary keys with `gen_random_uuid()`
- PostgreSQL ENUM types
- JSONB columns with operators
- pgvector for embeddings
- Array columns (`TEXT[]`)

### Test Database Setup
```yaml
# docker-compose.test.yml
postgres-test:
  image: pgvector/pgvector:pg16
  environment:
    POSTGRES_USER: vibe_test
    POSTGRES_PASSWORD: vibe_test
    POSTGRES_DB: vibe_test
  ports:
    - "5433:5432"
  tmpfs:
    - /var/lib/postgresql/data  # Fast, ephemeral storage
```

### Running Tests
```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d postgres-test

# Run tests (uses TEST_DATABASE_URL)
TEST_DATABASE_URL="postgresql://vibe_test:vibe_test@localhost:5433/vibe_test" pytest tests/ -v

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

### Test Isolation Checklist
- [ ] Each test uses fresh transaction (rollback after)
- [ ] Test org created via `test_org` fixture
- [ ] Test user created via `test_user` fixture
- [ ] No hardcoded UUIDs (use `uuid.uuid4()`)
- [ ] Cross-org isolation tested explicitly

### Cross-Org Isolation Test Pattern
```python
def test_cannot_access_other_org_data(client, auth_headers, test_org, db):
    """Verify user cannot access another org's data."""
    # Create another org
    other_org = Organization(name="Other Org", slug="other-org")
    db.add(other_org)
    db.commit()

    # Create resource in other org
    other_resource = Resource(organization_id=other_org.id, ...)
    db.add(other_resource)
    db.commit()

    # Try to access from test_org context
    auth_headers["X-Organization-Id"] = str(test_org.id)
    response = client.get(f"/api/v1/resources/{other_resource.id}", headers=auth_headers)

    # Must return 404 (not 403, to avoid leaking existence)
    assert response.status_code == 404
```

---

## Checklist 14: Security Review

Before any PR involving user input or external data:

### Input Validation
- [ ] Pydantic schemas validate all inputs
- [ ] String lengths limited (name: 255, text: 10000)
- [ ] URLs validated with regex + DNS check
- [ ] File uploads: type, size, content validated

### GitHub Integration Security
- [ ] Only `github.com` domain allowed
- [ ] Repo must be public (API check)
- [ ] Clone with `--depth 1` (shallow)
- [ ] Timeout on clone operation (60s)
- [ ] Max file size per file (1MB)
- [ ] Max total repo size (100MB)
- [ ] Blocked file extensions (.exe, .dll, .so, etc.)

### Database Security
- [ ] All queries use ORM (no raw SQL)
- [ ] organization_id filter on every query
- [ ] No user input in query construction
- [ ] Sensitive data not logged

### API Security
- [ ] Firebase token verified on every request
- [ ] Organization membership checked
- [ ] Role-based access enforced
- [ ] Rate limits applied
- [ ] CORS configured correctly

---

## Quick Commands Reference

```bash
# Backend
docker-compose -f docker-compose.test.yml up -d postgres-test  # Start test DB
pytest tests/ -v                    # Run all tests
pytest tests/test_X.py -v          # Run specific test file
pytest tests/ -k "test_name"       # Run tests matching name
alembic upgrade head               # Apply migrations
alembic downgrade -1               # Rollback one migration
uvicorn app.main:app --reload      # Start dev server

# Frontend
npm run dev                        # Start dev server
npm run build                      # Build for production
npm run lint                       # Check linting
npm run lint:fix                   # Auto-fix lint issues
npm run test                       # Run tests

# Git
git checkout -b feature/NAME       # Create feature branch
git push -u origin feature/NAME    # Push and track branch
git rebase main                    # Update branch with main

# Docker
docker-compose up -d               # Start services
docker-compose down               # Stop services
docker-compose logs -f SERVICE    # View service logs
```

---

## Error Code Quick Reference

| Code | Status | Meaning |
|------|--------|---------|
| `AUTH_TOKEN_INVALID` | 401 | Firebase token invalid |
| `AUTH_TOKEN_EXPIRED` | 401 | Firebase token expired |
| `NOT_ORG_MEMBER` | 403 | User not in this organization |
| `INSUFFICIENT_ROLE` | 403 | User role too low for action |
| `ORG_SUSPENDED` | 403 | Organization is suspended |
| `ALREADY_SUBMITTED` | 409 | User already submitted for assessment |
| `REPO_NOT_PUBLIC` | 422 | GitHub repo is private |
| `NO_CODE_FILES` | 422 | No supported code files in repo |
| `REPO_TOO_LARGE` | 422 | Repository exceeds 100MB limit |
| `SSRF_BLOCKED` | 422 | URL resolves to blocked IP range |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `ORG_BUDGET_EXCEEDED` | 429 | Organization LLM budget exhausted |
| `LLM_PROVIDER_ERROR` | 503 | All LLM providers failed |

---

Keep this file open while coding!

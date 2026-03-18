# Security Audit Report

**Date:** 2024-12-17
**Scope:** Vibe Platform Backend

---

## 1. Dependency Vulnerabilities

### Fixed (requirements.txt updated)

| Package | Old Version | New Version | CVE |
|---------|-------------|-------------|-----|
| python-multipart | 0.0.9 | 0.0.18 | CVE-2024-53981 |
| starlette | (via fastapi) | 0.45.3 | CVE-2024-47874, CVE-2025-54121 |
| python-jose | 3.3.0 | 3.4.0 | PYSEC-2024-232, PYSEC-2024-233 |
| black | 24.1.1 | 24.3.0 | PYSEC-2024-48 |
| fastapi | 0.109.2 | 0.115.6 | (updated for starlette compat) |
| uvicorn | 0.27.1 | 0.34.2 | (updated) |

### Remaining (No Fix Available)
- `ecdsa` (CVE-2024-23342) - Dependency of firebase-admin; monitor for updates
- `pip` (CVE-2025-8869) - Update pip in deployment: `pip install --upgrade pip`

---

## 2. Authentication & Authorization

### Findings: PASS

All authenticated endpoints use proper dependencies:
- `get_current_user` - Validates Firebase JWT token
- `get_current_org` - Validates org membership
- `require_role()` - Role-based access control

### Public Endpoints (Intentionally No Auth)
- `GET /api/v1/health` - Health check
- `GET /api/v1/health/ready` - Readiness check
- `GET /api/v1/prometheus/metrics` - Metrics scraping (internal network only)
- `GET /api/public/profiles/{id_or_slug}` - Public profile viewing

---

## 3. Organization Isolation

### Findings: 24 MEDIUM (All Intentional by Design)

| Location | Pattern | Justification |
|----------|---------|---------------|
| `talent.py` | Public profile search | Intentional: searches `is_public=True` profiles globally |
| `prometheus.py` | System metrics | Intentional: needs platform-wide view for monitoring |
| `metrics.py` | Admin metrics | Intentional: needs platform-wide view for dashboard |
| `profiles.py:99` | Slug check | Intentional: slugs must be globally unique |
| `events.py` | Cross-org queries | Some intentional (public events), others filtered by event_id |

### Verified Secure Patterns

1. **Assessment queries** - Always filtered by `organization_id` via `get_current_org`
2. **Submission queries** - Always filtered by `organization_id` or `candidate_id`
3. **Event mutations** - Require org membership and admin role
4. **Profile updates** - User can only update their own profile

---

## 4. Input Validation

### Findings: PASS

- **SQL Injection**: All queries use SQLAlchemy ORM with parameterized queries
- **XSS**: No HTML rendering; API returns JSON only
- **Path Traversal**: File uploads validate types and use secure storage paths
- **SSRF**: GitHub URLs validated, only used for cloning

---

## 5. File Upload Security

### Findings: PASS

Resume upload validation in `app/services/resume.py`:
- Allowed types: PDF, DOCX only
- Max size: 20MB
- Files stored with UUID names, not user-controlled paths
- Path traversal prevented by using `pathlib.Path.resolve()`

---

## 6. Rate Limiting

### Findings: PASS

Rate limits configured in `app/core/config.py`:
- API default: 100/minute
- Submissions: 5/hour
- Auth: 10/minute

Enforced by `app/middleware/rate_limit.py` using Redis.

---

## 7. Secrets Management

### Findings: PASS

- No hardcoded secrets found in codebase
- All secrets loaded from environment variables
- `.env` file in `.gitignore`
- Production uses Kubernetes secrets

---

## 8. Recommendations

### Immediate Actions
1. Run `pip install -r requirements.txt` to apply dependency updates
2. Verify pip upgrade in deployment scripts

### Future Improvements
1. Add Content-Security-Policy headers for web responses
2. Consider audit logging for sensitive operations
3. Add API versioning deprecation warnings
4. Set up automated dependency scanning in CI

---

## Approval

- [ ] Security team review
- [ ] Dependency updates tested
- [ ] Deployment verified

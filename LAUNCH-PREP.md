# Launch Prep Checklist

Phase 4 work per architecture-decisions.md. Execute in order:
1. Monitoring Setup → 2. Security Audit → 3. E2E Tests

---

## 1. Monitoring Setup

### Existing Infrastructure
- [x] `/api/v1/prometheus/metrics` - Prometheus text format endpoint
- [x] `/api/v1/metrics` - JSON metrics for admin dashboard
- [x] `app/services/alerts.py` - Slack webhook alerts
- [x] `app/worker/scheduler.py` - Periodic alert checks (queue depth, LLM failure rate)
- [x] SLO thresholds in `config.py` (api_p95_ms=400, job_p95_seconds=180)

### To Implement

#### 1.1 Prometheus Alerting Rules
Create `k8s/prometheus-rules.yaml` with:
- [ ] `VibeAPIDown` - vibe_api_up == 0 for 1m
- [ ] `VibeHighQueueDepth` - vibe_queue_depth > 100 for 5m
- [ ] `VibeHighJobLatency` - vibe_job_latency_seconds{quantile="0.95"} > 180 for 5m
- [ ] `VibeLLMHighErrorRate` - vibe_llm_errors_total / vibe_llm_calls_total > 0.10 for 5m (guard against divide-by-zero)
- [ ] `VibeHighFailedJobs` - vibe_queue_failed_count > 10 for 5m

#### 1.2 Alertmanager Config
Create `k8s/alertmanager-config.yaml` with:
- [ ] Slack receiver configuration
- [ ] Alert routing (critical → immediate, warning → grouped)
- [ ] Silence/inhibition rules

#### 1.3 Health Check Validation
- [ ] Verify `/api/v1/health` returns 200
- [ ] Verify `/api/v1/health/ready` checks DB + Redis
- [x] Add k8s liveness/readiness probes using these endpoints (`k8s/api-deployment.yaml`)

#### 1.4 Grafana Dashboard (optional but recommended)
- [ ] Queue depth over time
- [ ] Job latency percentiles
- [ ] LLM cost/calls/errors
- [ ] API request rates

---

## 2. Security Audit

### 2.1 Authentication & Authorization
- [ ] Verify Firebase token validation in `app/core/security.py`
- [ ] Audit all endpoints for proper `require_role()` dependencies
- [ ] Check org isolation: all queries filter by `organization_id`
- [ ] Verify `get_current_org()` properly validates X-Organization-Id header

### 2.2 Organization Isolation
Test cases to verify:
- [ ] User A (org1) cannot access org2 assessments
- [ ] User A (org1) cannot see org2 submissions
- [ ] User A (org1) cannot view org2 profiles
- [ ] Admin in org1 cannot modify org2 events
- [ ] Public profiles only show is_public=true data

### 2.3 File Access & Storage
- [ ] Resume uploads: validate file types (PDF, DOCX only)
- [ ] Resume uploads: validate file size (< 20MB)
- [ ] Resume paths: no path traversal vulnerabilities
- [ ] GitHub clone: only authorized repos (via user's submission)

### 2.4 Input Validation
- [ ] SQL injection: parameterized queries everywhere
- [ ] XSS: no raw HTML rendering
- [ ] SSRF: GitHub URL validation
- [ ] Rate limiting: verify all endpoints have appropriate limits

### 2.5 Secrets & Configuration
- [ ] No secrets in code (grep for API keys, passwords)
- [ ] Production .env not committed
- [ ] Firebase service account path secure
- [ ] Database URL uses SSL in production

### 2.6 Dependency Audit
- [ ] Run `pip-audit` or `safety check`
- [ ] Check for known vulnerabilities in requirements.txt
- [ ] Update any vulnerable packages

---

## 3. E2E Tests

### Test Framework Setup ✅
- [x] Playwright installed and configured
- [x] Test fixtures for API mocking (`frontend/e2e/fixtures/auth.ts`)
- [x] playwright.config.ts with webServer setup

### Environment Requirements
E2E tests require Firebase configuration:
- Option A: Real Firebase project credentials in `.env` or `.env.local`
- Option B: Firebase Auth emulator (`FIREBASE_AUTH_EMULATOR_HOST`)

Without valid Firebase config, the app won't render (auth/invalid-api-key error).

### Test Files Created
- `frontend/e2e/auth.spec.ts` - Login page, public routes
- `frontend/e2e/navigation.spec.ts` - Dashboard, profile, assessments navigation
- `frontend/e2e/submissions.spec.ts` - Submission listing and assessment taking
- `frontend/e2e/events.spec.ts` - Event listing, registration, submission
- `frontend/e2e/talent.spec.ts` - Public profiles, talent search

### Critical User Flows

#### 3.1 Authentication Flow
- [x] Login page renders (tests created)
- [ ] Login with Google (Firebase) - requires emulator
- [ ] Create organization
- [ ] Join organization via invite
- [ ] Switch between organizations
- [ ] Logout

#### 3.2 Assessment Flow (Admin)
- [x] Assessments page loads (mocked)
- [ ] Create assessment with all fields
- [ ] Publish assessment
- [ ] View submissions list
- [ ] View submission detail with scores

#### 3.3 Submission Flow (Candidate)
- [x] Submissions page loads (mocked)
- [x] View available assessments (mocked)
- [ ] Submit GitHub repo
- [ ] Poll for scoring status
- [ ] View final score and feedback

#### 3.4 Event Flow
- [x] Events page loads (mocked)
- [x] Event registration flow (mocked)
- [ ] Submit during event
- [ ] View event leaderboard
- [ ] Generate certificate (if eligible)

#### 3.5 Talent Flow
- [x] Public profile renders (mocked)
- [x] Talent search page loads (mocked)
- [ ] Set profile to public
- [ ] Add to shortlist
- [ ] Export shortlist CSV

---

## Execution Order

### Phase 1: Monitoring (de-risks launch fastest) ✅
1. [x] Create Prometheus alerting rules (`k8s/prometheus-rules.yaml`)
2. [x] Configure Alertmanager for Slack (`k8s/alertmanager-config.yaml`)
3. [x] Create ServiceMonitor (`k8s/servicemonitor.yaml`)
4. [x] Validation script (`backend/scripts/validate_monitoring.py`)

### Phase 2: Security (validates before encoding E2E) ✅
1. [x] Run dependency audit - 8 vulnerabilities fixed
2. [x] Audit auth/authz code paths - verified via security_audit.py
3. [x] Test org isolation - 24 intentional cross-org patterns documented
4. [x] Security audit report created (SECURITY-AUDIT.md)

### Phase 3: E2E Tests ✅
1. [x] Setup Playwright project
2. [x] Implement auth flow tests (login page, public routes)
3. [x] Implement submission flow tests (with API mocking)
4. [x] Implement event flow tests (with API mocking)
5. [ ] Add to CI pipeline (requires Firebase emulator setup)

---

## Success Criteria

- [ ] All Prometheus alerts fire correctly when thresholds exceeded
- [ ] Slack receives alerts within 1 minute of condition
- [ ] No authorization bypass vulnerabilities found
- [ ] All org isolation tests pass
- [ ] E2E tests pass on clean environment
- [ ] CI pipeline includes E2E test gate

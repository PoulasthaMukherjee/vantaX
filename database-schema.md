# Vibe Coding Platform – Multi-Tenant MVP Database Schema

This schema aligns with the architecture decisions (multi-tenant, Firebase auth, async scoring). All tenant-owned data carries `organization_id`.

---

## 0. Enum Types

```sql
CREATE TYPE organization_user_role AS ENUM ('owner', 'admin', 'reviewer', 'candidate');
CREATE TYPE assessment_visibility AS ENUM ('active', 'invite_only', 'public');
CREATE TYPE evaluation_mode AS ENUM ('ai_only', 'hybrid', 'human_only');
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE submission_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'QUEUED',
  'CLONING',
  'CLONE_FAILED',
  'SCORING',
  'SCORE_FAILED',
  'EVALUATED'
);
```

---

## 1. `users`

Global user identities (auth via Firebase).

```sql
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid     VARCHAR(128) UNIQUE NOT NULL,
  email            VARCHAR(255) UNIQUE NOT NULL,
  name             VARCHAR(255),
  email_verified   BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. `organizations`

Top-level tenant.

```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  status      VARCHAR(20) NOT NULL DEFAULT 'active', -- active | suspended
  plan        VARCHAR(20) NOT NULL DEFAULT 'free',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. `organization_users`

Memberships with per-org roles.

```sql
CREATE TABLE organization_users (
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             organization_user_role NOT NULL DEFAULT 'candidate',
  created_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
```

---

## 4. `admin_invites`

Org-scoped admin/reviewer invitations.

```sql
CREATE TABLE admin_invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            VARCHAR(255) NOT NULL,
  role             organization_user_role NOT NULL, -- owner|admin|reviewer
  invited_by       UUID NOT NULL REFERENCES users(id),
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, email)
);
```

---

## 5. `candidate_profiles`

One profile per user per organization.

```sql
CREATE TABLE candidate_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255),
  mobile           VARCHAR(20),
  github_url       TEXT,
  github_verified  BOOLEAN DEFAULT FALSE,
  linkedin_url     TEXT,
  resume_file_path TEXT,
  resume_filename  VARCHAR(255),
  about_me         TEXT,
  vibe_score       NUMERIC(6,2) DEFAULT 0,
  total_points     INT NOT NULL DEFAULT 0,
  is_public        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
```

---

## 6. `assessments`

Org-scoped assessments with visibility and evaluation mode.

```sql
CREATE TABLE assessments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by           UUID NOT NULL REFERENCES users(id),
  title                VARCHAR(255) NOT NULL,
  problem_statement    TEXT NOT NULL,
  build_requirements   TEXT NOT NULL,
  input_output_examples TEXT NOT NULL,
  acceptance_criteria  TEXT NOT NULL,
  constraints          TEXT NOT NULL,
  starter_code         TEXT,
  helpful_docs         TEXT,
  submission_instructions TEXT NOT NULL,
  visibility           assessment_visibility NOT NULL DEFAULT 'active',
  evaluation_mode      evaluation_mode NOT NULL DEFAULT 'ai_only',
  status               assessment_status NOT NULL DEFAULT 'published',
  time_limit_days      INT,
  tags                 TEXT[],
  weight_correctness   INT NOT NULL DEFAULT 25,
  weight_quality       INT NOT NULL DEFAULT 20,
  weight_readability   INT NOT NULL DEFAULT 15,
  weight_robustness    INT NOT NULL DEFAULT 10,
  weight_clarity       INT NOT NULL DEFAULT 10,
  weight_depth         INT NOT NULL DEFAULT 10,
  weight_structure     INT NOT NULL DEFAULT 10,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT weights_sum_100 CHECK (
    weight_correctness + weight_quality + weight_readability + weight_robustness +
    weight_clarity + weight_depth + weight_structure = 100
  )
);

CREATE INDEX idx_assessments_org ON assessments(organization_id);
CREATE INDEX idx_assessments_tags ON assessments USING GIN(tags);
```

---

## 7. `assessment_invites`

For invite-only assessments.

```sql
CREATE TABLE assessment_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  invited_by      UUID NOT NULL REFERENCES users(id),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assessment_id, email)
);
```

---

## 8. `submissions`

Org-scoped submission attempts.

```sql
CREATE TABLE submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id      UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  github_repo_url    TEXT NOT NULL,
  explanation_text   TEXT,
  status             submission_status NOT NULL DEFAULT 'SUBMITTED',
  commit_sha         VARCHAR(40),
  analyzed_files     JSONB,
  clone_started_at   TIMESTAMPTZ,
  clone_completed_at TIMESTAMPTZ,
  job_id             VARCHAR(100),
  job_started_at     TIMESTAMPTZ,
  job_completed_at   TIMESTAMPTZ,
  final_score        NUMERIC(5,2),
  points_awarded     INT DEFAULT 0,
  error_message      TEXT,
  retry_count        INT DEFAULT 0,
  submitted_at       TIMESTAMPTZ,
  evaluated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, candidate_id, assessment_id)
);

CREATE INDEX idx_submissions_org_status ON submissions(organization_id, status);
CREATE INDEX idx_submissions_org_candidate ON submissions(organization_id, candidate_id);
```

---

## 9. `submission_jobs` (optional explicit job tracking)

```sql
CREATE TABLE submission_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  job_id           TEXT,
  status           VARCHAR(50), -- 'QUEUED', 'RUNNING', 'DONE', 'FAILED'
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

---

## 10. `ai_scores`

Rubric-level scores per submission.

```sql
CREATE TABLE ai_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id         UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  code_correctness      INT NOT NULL CHECK (code_correctness BETWEEN 1 AND 10),
  code_quality          INT NOT NULL CHECK (code_quality BETWEEN 1 AND 10),
  code_readability      INT NOT NULL CHECK (code_readability BETWEEN 1 AND 10),
  code_robustness       INT NOT NULL CHECK (code_robustness BETWEEN 1 AND 10),
  reasoning_clarity     INT NOT NULL CHECK (reasoning_clarity BETWEEN 1 AND 10),
  reasoning_depth       INT NOT NULL CHECK (reasoning_depth BETWEEN 1 AND 10),
  reasoning_structure   INT NOT NULL CHECK (reasoning_structure BETWEEN 1 AND 10),
  overall_comment       TEXT,
  raw_response          JSONB,
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

---

## 11. `points_log`

Org-scoped point events.

```sql
CREATE TABLE points_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event            VARCHAR(100) NOT NULL,
  points           INT NOT NULL,
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id, event)
);
```

---

## 12. `activity_log`

For feed/notifications (tenant-scoped).

```sql
CREATE TABLE activity_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type             VARCHAR(50) NOT NULL,
  actor_id         UUID REFERENCES users(id),
  target_type      VARCHAR(50),
  target_id        UUID,
  message          TEXT NOT NULL,
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_org ON activity_log(organization_id, created_at DESC);
```

---

## 13. `admin_audit_log`

Admin actions for accountability.

```sql
CREATE TABLE admin_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admin_id         UUID NOT NULL REFERENCES users(id),
  action           VARCHAR(100) NOT NULL,
  target_type      VARCHAR(50) NOT NULL,
  target_id        UUID NOT NULL,
  old_value        JSONB,
  new_value        JSONB,
  reason           TEXT,
  ip_address       INET,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_org ON admin_audit_log(organization_id, created_at DESC);
```

---

## 14. `llm_usage_log`

Track cost/latency per tenant.

```sql
CREATE TABLE llm_usage_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id      UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  model              VARCHAR(100) NOT NULL,
  prompt_tokens      INT NOT NULL,
  completion_tokens  INT NOT NULL,
  total_tokens       INT NOT NULL,
  cost_usd           DECIMAL(10,6),
  latency_ms         INT,
  attempt_number     INT NOT NULL DEFAULT 1,
  success            BOOLEAN NOT NULL,
  error_type         VARCHAR(50),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_llm_usage_org ON llm_usage_log(organization_id, created_at);
```

---

## 15. `system_config`

Global key-value configuration (maintenance mode, feature flags). Not org-scoped.

```sql
CREATE TABLE system_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Default maintenance flag
INSERT INTO system_config (key, value) VALUES ('maintenance_mode', 'false');
```

# Vibe Platform - Architecture Decisions Document

This document captures all architectural decisions made during planning discussions.

---

## 1. Authentication & User Management

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Auth Provider** | Firebase Authentication | Handles JWT, password policies, email verification, forgot password out-of-the-box |
| **Email Verification** | Required before assessment submission | Ensures valid contact info, reduces spam accounts |
| **Admin Creation** | Invite-only via existing admin | Controlled access, prevents unauthorized admin accounts |
| **Password Policy** | Firebase defaults (6+ chars) | Industry standard, handled by Firebase |
| **Session Duration** | Long-lived (days) | Better UX for candidates, Firebase handles token refresh |
| **Forgot Password** | Yes, via Firebase | Built-in flow, no custom implementation needed |
| **Rate Limiting** | 5 failed attempts → 15 min lockout | Prevents brute-force attacks |

### Implementation Notes

- Firebase SDK handles token refresh automatically
- Backend validates Firebase ID tokens on each request
- Store `firebase_uid` in `users` table, link to our internal `user_id`
- Admin invite flow: Admin creates invite → sends email with signup link → new user registers → automatically gets admin role

### Schema Impact

```sql
-- Users table modification
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid    VARCHAR(128) UNIQUE NOT NULL,  -- Firebase UID
  email           VARCHAR(255) UNIQUE NOT NULL,
  email_verified  BOOLEAN DEFAULT FALSE,         -- Synced from Firebase
  role            user_role NOT NULL DEFAULT 'candidate',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Admin invites table (new)
CREATE TABLE admin_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  invited_by      UUID NOT NULL REFERENCES users(id),
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Open Questions
- None currently

---

## 2. Candidate Profile & Points System

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Profile Requirement** | Not mandatory for submissions | Incentivize via points, don't block users |
| **GitHub URL Validation** | API call to verify profile exists | Prevents fake/typo URLs, ensures valid data |
| **LinkedIn URL Validation** | Format validation only | LinkedIn API is restrictive |
| **Resume File Types** | PDF and DOCX | Covers 99% of use cases |
| **Resume Max Size** | 20MB | Generous buffer, handles image-heavy docs |
| **Resume Storage** | Google Cloud Storage | Integrates with Firebase, scalable |
| **Points System** | One-time only per field (org-scoped) | Unique constraint prevents gaming |
| **Profile Edits** | Allowed, no additional points | Users can update but can't re-earn points |
| **Profile Visibility** | Private by default | User can opt-in to make public |
| **Admin Access** | Full visibility of all profiles | Required for candidate evaluation |

### Vibe Score Calculation

```
Vibe Score = Sum(Assessment Scores) + Profile Points + Consistency Bonus

Consistency Bonus:
- +4 points for each assessment score ≥ 70
- +5 points for each assessment score ≥ 85 (stacks with above)

Example:
  Assessment 1: 80  → +4 (≥70)
  Assessment 2: 65  → +0
  Assessment 3: 92  → +4 (≥70) + +5 (≥85) = +9
  Profile Points: 60
  Consistency Bonus: 4 + 0 + 9 = 13

  Vibe Score = (80 + 65 + 92) + 60 + 13 = 310
```

### Points Breakdown

| Event | Points | One-Time |
|-------|--------|----------|
| Add GitHub URL | +50 | Yes |
| Upload Resume | +25 | Yes |
| Complete Profile (name, mobile) | +100 | Yes |
| LinkedIn URL (optional) | +10 | Yes |
| **Max Profile Points** | **185** (175 if LinkedIn skipped) | - |

### Implementation Notes

- Store resume in GCS with path: `resumes/{user_id}/{timestamp}_{filename}`
- Generate signed URLs for secure download (expire in 1 hour)
- Validate MIME type server-side, not just file extension
- GitHub validation: `GET https://api.github.com/users/{username}` - check 200 response
- Cache GitHub validation result to avoid repeated API calls

### Schema Impact

```sql
-- Org-scoped candidate profiles
CREATE TABLE candidate_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255),
  mobile           VARCHAR(20),
  github_url       TEXT,
  github_verified  BOOLEAN DEFAULT FALSE,  -- API verification status
  linkedin_url     TEXT,
  resume_file_path TEXT,                   -- GCS path
  resume_filename  VARCHAR(255),           -- Original filename for display
  about_me         TEXT,
  vibe_score       NUMERIC(6,2) DEFAULT 0,
  total_points     INT NOT NULL DEFAULT 0,
  is_public        BOOLEAN DEFAULT FALSE,  -- Profile visibility toggle
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Org-scoped points log with unique constraint
CREATE TABLE points_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event            VARCHAR(100) NOT NULL,
  points           INT NOT NULL,
  event_data       JSONB,  -- Additional context about the point event
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id, event)  -- Prevents duplicate point awards
);
```

### Resolved Decisions
- ✅ Show profile completion percentage/progress bar → **Yes** (improves engagement)
- ✅ Notify admins when candidate completes profile → **No** (too noisy)

---

## 3. Assessments (Structure, Creation, Management)

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Attempt Limit** | 1 attempt only | Ensures candidates put best effort, simplifies scoring |
| **Time Limits** | Set by assessment creator (admin) | Flexibility per assessment difficulty |
| **Tags/Categories** | Admin-defined tags | Enables filtering (backend/frontend, easy/hard) |
| **Difficulty Levels** | Part of tags (Easy/Medium/Hard) | Admin flexibility, no fixed enum |
| **Visibility Options** | 3 modes: Active (all), Invite-only, Public | Full control for admins |
| **Rubric Weights** | Customizable per dimension | Different assessments may prioritize different skills |

### Assessment Content Structure

| Field | Required | Description |
|-------|----------|-------------|
| **Title** | Yes | Short assessment name |
| **Problem Statement** | Yes | What problem needs solving |
| **What You Need to Build** | Yes | Clear deliverable description |
| **Input/Output Examples** | Yes | Concrete examples for clarity |
| **Acceptance Criteria** | Yes | How success is measured |
| **Constraints** | Yes | Limitations, tech requirements |
| **Starter Code** | No | Optional boilerplate to begin with |
| **Helpful Docs** | No | Reference links, documentation |
| **What to Submit** | Yes | Instructions (repo URL + explanation) |

### Visibility Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Active** | Visible to all logged-in candidates | General assessments |
| **Invite-Only** | Only visible via direct link/invite | Private challenges, specific candidates |
| **Public** | Visible even before login | Marketing, attract candidates |

### Rubric Dimensions (All Customizable Weights)

**Code Evaluation:**
| Dimension | Default Weight | Description |
|-----------|---------------|-------------|
| Correctness | 25% | Does it work as expected? |
| Quality | 20% | Best practices, patterns |
| Readability | 15% | Clean, understandable code |
| Robustness | 10% | Error handling, edge cases |

**Reasoning Evaluation:**
| Dimension | Default Weight | Description |
|-----------|---------------|-------------|
| Clarity | 10% | Clear explanation |
| Depth | 10% | Thoroughness of reasoning |
| Structure | 10% | Logical organization |

**Total: 100%** (Admin can adjust per assessment)

### Schema Impact

```sql
-- Visibility enum
CREATE TYPE assessment_visibility AS ENUM ('active', 'invite_only', 'public');
CREATE TYPE evaluation_mode AS ENUM ('ai_only', 'hybrid', 'human_only');
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');

-- Assessments table
CREATE TABLE assessments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by           UUID NOT NULL REFERENCES users(id),

  -- Content
  title                VARCHAR(255) NOT NULL,
  problem_statement    TEXT NOT NULL,
  build_requirements   TEXT NOT NULL,           -- What You Need to Build
  input_output_examples TEXT NOT NULL,
  acceptance_criteria  TEXT NOT NULL,
  constraints          TEXT NOT NULL,
  starter_code         TEXT,                    -- Optional
  helpful_docs         TEXT,                    -- Optional (JSON array of links?)
  submission_instructions TEXT NOT NULL,        -- What to Submit

  -- Settings
  visibility           assessment_visibility NOT NULL DEFAULT 'active',
  evaluation_mode      evaluation_mode NOT NULL DEFAULT 'ai_only',
  status               assessment_status NOT NULL DEFAULT 'published',
  time_limit_days      INT,                     -- NULL = no limit
  tags                 TEXT[],                  -- Array of tags

  -- Rubric weights (must sum to 100)
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

-- Assessment invites (for invite-only assessments)
CREATE TABLE assessment_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,      -- Invited email
  invited_by      UUID NOT NULL REFERENCES users(id),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(assessment_id, email)
);

-- Index for tag filtering
CREATE INDEX idx_assessments_tags ON assessments USING GIN(tags);
```

### Resolved Decisions
- ✅ Support Markdown in problem_statement and text fields → **Yes** (standard for code challenges)
- ✅ Max length for starter_code field → **No DB limit**, but **soft app limit of 200-300 KB** (prevents LLM prompt blow-up)

---

## 4. Submissions & GitHub Repo Handling

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Repo Visibility** | Public repos only | Simplifies architecture, no OAuth needed |
| **Branch** | Default branch only | Clear expectation, user informed upfront |
| **Attempts** | 1 attempt (admin can reset on infra failure) | Fair handling of transient issues |
| **Pre-queue Validation** | Full validation before accepting | Fail fast, better UX |
| **Metadata Storage** | Store SHA, file list, timestamp | Auditability, reproducibility |

### Pre-Submission Validation (Synchronous)

Run these checks **before** accepting submission:

| Check | Method | Fail Response |
|-------|--------|---------------|
| URL format | Regex: `github.com/{owner}/{repo}` | "Invalid GitHub URL format" |
| Repo exists | `GET api.github.com/repos/{owner}/{repo}` → 200 | "Repository not found" |
| Repo is public | Check response `private: false` | "Repository must be public" |
| Has code files | List contents, check extensions | "No supported code files found" |

### File Collection Rules

**Include extensions:**
```
.py, .js, .jsx, .ts, .tsx, .java, .go, .rb, .php, .cs
```

**Ignore folders:**
```
node_modules/, venv/, .git/, dist/, build/, .next/, __pycache__/,
.idea/, .vscode/, coverage/, .nyc_output/, vendor/
```

**Skip files:**
```
*.min.js, *.min.css, *.map, *.bundle.js, *.chunk.js
```

**Limits:**
| Limit | Value | Action |
|-------|-------|--------|
| Max file size | 200 KB | Skip file, continue |
| Max total files | 40 | Take 40 nearest to root |
| Max repo size | 100 MB (hard) | Reject if over limit |

### Clone Configuration

```bash
git clone --depth=1 --single-branch <repo_url> /tmp/submissions/<job_id>
```

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Clone timeout | 60 seconds | Matches worker timeout budget |
| Min download rate | 50 KB/s for 10s | Cancel slow clones |
| Shallow depth | 1 | Only need latest commit |

### Error Handling & Retry Strategy

| Error Type | Retry? | Action |
|------------|--------|--------|
| Clone timeout | Yes (1x) | Auto-retry once |
| Network error | Yes (1x) | Auto-retry once |
| Repo not found | No | Fail immediately (validated upfront) |
| Repo private | No | Fail immediately (validated upfront) |
| Rate limited (GitHub) | Yes (with backoff) | Wait 60s, retry |
| Retry failed | No | Mark FAILED, notify admin |

**Admin Reset:** Admins can reset submission status to SUBMITTED for infra failures (not candidate's fault).

### Submission Status Flow

```
DRAFT → SUBMITTED → QUEUED → CLONING → SCORING → EVALUATED
                                ↓           ↓
                             CLONE_FAILED  SCORE_FAILED
                                ↓           ↓
                          (admin reset) → SUBMITTED
```

### Submission Best Practices (Show in UI)

Display these guidelines to candidates before submission:

```markdown
## Submission Requirements

✓ Repository must be **public**
✓ Code should be on the **default branch** (main/master)
✓ Supported languages: Python, JavaScript, TypeScript, Java, Go, Ruby, PHP, C#
✓ Keep repo under **100 MB**
✓ Maximum **40 code files** will be analyzed
✓ Individual files should be under **200 KB**

## Tips for Best Results

- Remove node_modules, venv, and build folders
- Don't include minified files
- Organize code clearly (files near root are prioritized)
- Include a README explaining your approach
```

### Schema Impact

```sql
-- Submission status enum (expanded)
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

-- Submissions table
CREATE TABLE submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id      UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,

  -- Submission content
  github_repo_url    TEXT NOT NULL,
  explanation_text   TEXT,

  -- Processing metadata
  status             submission_status NOT NULL DEFAULT 'SUBMITTED',
  commit_sha         VARCHAR(40),              -- Evaluated commit
  analyzed_files     JSONB,                    -- Array of file paths analyzed
  clone_started_at   TIMESTAMPTZ,
  clone_completed_at TIMESTAMPTZ,
  job_id             VARCHAR(100),
  job_started_at     TIMESTAMPTZ,
  job_completed_at   TIMESTAMPTZ,

  -- Results
  final_score        DECIMAL(5,2),
  points_awarded     INT DEFAULT 0,

  -- Error tracking
  error_message      TEXT,
  retry_count        INT DEFAULT 0,

  -- Timestamps
  submitted_at       TIMESTAMPTZ,
  evaluated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),

  -- One attempt per candidate per assessment
  UNIQUE(organization_id, candidate_id, assessment_id)
);

-- Index for status monitoring
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_candidate ON submissions(candidate_id);
```

### Resolved Decisions
- ✅ Store code snapshot for disputes → **No**, rely on commit SHA (avoids storage + legal issues). *Future: consider snapshots only for high-value assessments if needed*
- ✅ Notify candidate when scoring completes → **Yes, via email** ("Your submission has been scored, click to view details")

---

## 5. AI Scoring (LLM, Rubrics, Evaluation)

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **LLM Provider** | Groq | Low latency, cost-effective |
| **Model** | TBD (code-capable model) | Select based on accuracy benchmarks |
| **Temperature** | 0 | Deterministic, reproducible scoring |
| **Score Scale** | 1-10 per dimension → normalize to 0-100 | Easier for LLM, flexible for backend |
| **Response Format** | Strict JSON only | Parseable, validatable |
| **Token Budget** | ≤ 6-8k tokens per call | Balance context vs cost |
| **Candidate Feedback** | Final score + short explanation | Actionable, not overwhelming |
| **Cost Tracking** | Yes, per submission | Admin visibility, budget planning |

### Score Response Format

**Expected LLM Output:**
```json
{
  "code_correctness": 8,
  "code_quality": 7,
  "code_readability": 9,
  "code_robustness": 6,
  "reasoning_clarity": 7,
  "reasoning_depth": 8,
  "reasoning_structure": 7,
  "overall_comment": "Well-structured solution with good error handling. Consider adding more edge case tests."
}
```

**Backend Validation:**
- Parse JSON → fail if invalid
- Check all required keys present
- Validate each score is integer 1-10
- If invalid → retry once with stricter prompt → else fail

**Score Normalization:**
```python
# Per dimension: (score / 10) * 100 * weight
# Example: correctness = 8, weight = 25%
# normalized = (8 / 10) * 100 * 0.25 = 20 points

final_score = sum(
    (dimension_score / 10) * 100 * dimension_weight
    for dimension in dimensions
)
```

### Prompt Structure

**System Prompt (Fixed):**
```
You are a strict code reviewer for programming assessments.
You must output ONLY valid JSON, no prose, no markdown, no comments.
Score each dimension from 1 (poor) to 10 (excellent).
Be fair but critical. Do not inflate scores.
```

**User Prompt Template:**
```
## Assessment
Title: {assessment.title}
Problem: {assessment.problem_statement}
Acceptance Criteria:
{assessment.acceptance_criteria}

## Candidate Code
{concatenated_code_files}

## Candidate Explanation
{submission.explanation_text}

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
{
  "code_correctness": <1-10>,
  "code_quality": <1-10>,
  "code_readability": <1-10>,
  "code_robustness": <1-10>,
  "reasoning_clarity": <1-10>,
  "reasoning_depth": <1-10>,
  "reasoning_structure": <1-10>,
  "overall_comment": "<2-3 sentence feedback for candidate>"
}
```

### Token Management

**Pre-filtering (before LLM call):**
1. Apply file collection rules (Section 4)
2. Sort files by relevance:
   - Priority 1: `main`, `app`, `index`, `core` in filename
   - Priority 2: Files in `src/`, `app/`, `lib/` directories
   - Priority 3: Files nearest to root
   - Priority 4: Smaller files first
3. Concatenate with file headers: `// FILE: {path}`

**Token Budget Enforcement:**
```python
MAX_TOKENS = 7000  # Leave room for response

def build_code_context(files):
    context = ""
    for file in sorted_files:
        file_content = f"\n// FILE: {file.path}\n{file.content}\n"
        if estimate_tokens(context + file_content) > MAX_TOKENS:
            break  # Stop adding files
        context += file_content
    return context
```

**Future Enhancement (Post-MVP):**
- Call 1: Per-file mini-summaries
- Call 2: Final scoring using summaries
- Allows larger codebases without token overflow

### LLM Failure Handling

| Error Type | Retries | Backoff | Action on Exhaust |
|------------|---------|---------|-------------------|
| API Timeout | 2 | Exponential (2s, 4s) | Mark SCORE_FAILED |
| Invalid JSON | 1 | None (immediate) | Mark SCORE_FAILED |
| Rate Limit (429) | 3 | 30s, 60s, 120s | Requeue job |
| Server Error (5xx) | 2 | Exponential | Mark SCORE_FAILED |

**Max Total Attempts:** 3 per submission → then permanent SCORE_FAILED

**Stricter Retry Prompt (for invalid JSON):**
```
IMPORTANT: Your previous response was not valid JSON.
You MUST return ONLY a JSON object. No text before or after.
No markdown code blocks. Just raw JSON starting with { and ending with }
```

### Cost Tracking

**Per Submission:**
```sql
CREATE TABLE llm_usage_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id      UUID NOT NULL REFERENCES submissions(id),
  model              VARCHAR(100) NOT NULL,
  prompt_tokens      INT NOT NULL,
  completion_tokens  INT NOT NULL,
  total_tokens       INT NOT NULL,
  cost_usd           DECIMAL(10,6),           -- Calculated from token pricing
  latency_ms         INT,
  attempt_number     INT NOT NULL DEFAULT 1,
  success            BOOLEAN NOT NULL,
  error_type         VARCHAR(50),             -- 'timeout', 'invalid_json', 'rate_limit'
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Index for admin dashboard
CREATE INDEX idx_llm_usage_org_date ON llm_usage_log(organization_id, created_at);
CREATE INDEX idx_llm_usage_submission ON llm_usage_log(submission_id);
```

**Admin Dashboard Metrics:**
- Total tokens used (daily/weekly/monthly)
- Cost per submission (average, min, max)
- Success rate by attempt number
- Error rate breakdown
- Model performance comparison (for A/B testing)

### AI Scores Storage

```sql
CREATE TABLE ai_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID UNIQUE NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

  -- Raw scores (1-10)
  code_correctness    INT NOT NULL CHECK (code_correctness BETWEEN 1 AND 10),
  code_quality        INT NOT NULL CHECK (code_quality BETWEEN 1 AND 10),
  code_readability    INT NOT NULL CHECK (code_readability BETWEEN 1 AND 10),
  code_robustness     INT NOT NULL CHECK (code_robustness BETWEEN 1 AND 10),
  reasoning_clarity   INT NOT NULL CHECK (reasoning_clarity BETWEEN 1 AND 10),
  reasoning_depth     INT NOT NULL CHECK (reasoning_depth BETWEEN 1 AND 10),
  reasoning_structure INT NOT NULL CHECK (reasoning_structure BETWEEN 1 AND 10),

  -- LLM feedback
  overall_comment     TEXT,

  -- Full LLM response for debugging
  raw_response        JSONB,

  created_at          TIMESTAMPTZ DEFAULT now()
);
```

### Resolved Decisions
- ✅ Allow admins to manually override AI scores → **Yes** (field already added)
- ✅ A/B test different models → **Post-MVP** (nice to have)

---

## 6. Worker Architecture (Queue, Jobs, Processing)

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Queue Technology** | Redis + RQ | Simple, Python-native, easy debugging |
| **Worker Concurrency** | 1 job per process, N processes | Easy to reason about, N = min(4, CPU cores) |
| **Queue Structure** | Single FIFO queue | No priority needed for MVP |
| **Job Timeout** | 180 seconds (3 min) | Clone (45s) + LLM calls (with retries) |
| **Dead Letter Queue** | RQ's built-in failed queue | Auto-cleanup after 30 days |
| **Scaling Strategy** | Fixed workers, manual scaling | Monitor queue depth, scale when needed |

### Queue Setup

**Single Queue (MVP):**
```python
# Queue names
SCORING_QUEUE = "scoring"      # Main job queue
# RQ automatically creates "failed" queue for DLQ
```

**Future (Post-MVP):**
```python
HIGH_PRIORITY_QUEUE = "scoring:high"    # Paid clients
STANDARD_QUEUE = "scoring:standard"      # Regular submissions
```

### Job Payload Structure

```python
# Job enqueued when submission is created
job_payload = {
    "job_id": "uuid",
    "submission_id": "uuid",
    "assessment_id": "uuid",
    "github_repo_url": "https://github.com/user/repo",
    "explanation_text": "Candidate's explanation...",
    "enqueued_at": "2024-01-15T10:30:00Z",

    # Assessment context (denormalized for worker efficiency)
    "assessment": {
        "title": "Build a REST API",
        "problem_statement": "...",
        "acceptance_criteria": "...",
        "weights": {
            "correctness": 25,
            "quality": 20,
            "readability": 15,
            "robustness": 10,
            "clarity": 10,
            "depth": 10,
            "structure": 10
        }
    }
}
```

### Worker Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        WORKER PROCESS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DEQUEUE JOB                                                  │
│     └─► Update submission.status = 'QUEUED'                     │
│                                                                  │
│  2. CLONE REPO (timeout: 45s)                                   │
│     ├─► Update submission.status = 'CLONING'                    │
│     ├─► git clone --depth=1 <url> /tmp/<job_id>                │
│     ├─► Record commit_sha                                       │
│     └─► On failure: retry 1x → else CLONE_FAILED               │
│                                                                  │
│  3. COLLECT FILES                                                │
│     ├─► Filter by extension, ignore folders                     │
│     ├─► Apply size limits (200KB/file, 40 files max)           │
│     ├─► Sort by relevance                                       │
│     └─► Store analyzed_files list                               │
│                                                                  │
│  4. CALL LLM (timeout: 20s per call)                            │
│     ├─► Update submission.status = 'SCORING'                    │
│     ├─► Build prompt (assessment + code + explanation)         │
│     ├─► Call Groq API (temp=0)                                  │
│     ├─► Validate JSON response                                  │
│     └─► On failure: retry per Section 5 rules                  │
│                                                                  │
│  5. PERSIST RESULTS                                              │
│     ├─► Save ai_scores record                                   │
│     ├─► Calculate final_score (weighted)                        │
│     ├─► Update submission.status = 'EVALUATED'                  │
│     ├─► Award points if score >= 70                             │
│     └─► Update vibe_score on candidate profile                  │
│                                                                  │
│  6. CLEANUP                                                      │
│     └─► Delete /tmp/<job_id> directory                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Timeout Configuration

```python
# config/worker.py
TIMEOUTS = {
    "job_total": 180,           # 3 minutes max per job
    "git_clone": 45,            # Clone timeout
    "llm_call": 20,             # Per LLM API call
    "llm_retries": 3,           # Max LLM retries
    "min_download_rate_kb": 50, # Cancel clone if slower
    "slow_download_check_s": 10 # Check rate after 10s
}
```

### Worker Deployment

**MVP Setup (Single Server):**
```bash
# Start 4 worker processes
rq worker scoring --burst=False --worker-count=4

# Or via supervisor/systemd
[program:vibe-worker]
command=rq worker scoring
numprocs=4
process_name=%(program_name)s_%(process_num)02d
```

**Scaling Rules:**
| Condition | Action |
|-----------|--------|
| `queue_depth > 100` | Scale to 8 workers |
| `oldest_job_age > 10 min` | Scale to 8 workers |
| `queue_depth < 20` for 30 min | Scale down to 4 workers |
| `queue_depth > 500` | Show "high load" banner, soft rate limit |

### Dead Letter Queue & Cleanup

**Failed Job Handling:**
```python
# RQ automatically moves failed jobs to "failed" queue
# Failed jobs contain:
# - Original job payload
# - Exception traceback
# - Failure timestamp
# - Retry count
```

**Cleanup Cron (daily):**
```python
# cleanup_failed_jobs.py
from rq import Queue
from rq.job import Job
from datetime import datetime, timedelta

def cleanup_old_failed_jobs(max_age_days=30):
    failed_queue = Queue('failed', connection=redis_conn)
    cutoff = datetime.now() - timedelta(days=max_age_days)

    for job_id in failed_queue.job_ids:
        job = Job.fetch(job_id, connection=redis_conn)
        if job.ended_at and job.ended_at < cutoff:
            job.delete()
```

### Admin Queue Visibility

**Endpoint: `GET /admin/queue-status`**
```json
{
  "queue_depth": 47,
  "active_jobs": 4,
  "failed_jobs_count": 12,
  "workers": {
    "total": 4,
    "busy": 3,
    "idle": 1
  },
  "metrics": {
    "avg_processing_time_s": 65,
    "oldest_job_age_s": 120,
    "jobs_completed_last_hour": 89,
    "jobs_failed_last_hour": 2
  }
}
```

**Endpoint: `GET /admin/failed-jobs`**
```json
{
  "failed_jobs": [
    {
      "job_id": "abc-123",
      "submission_id": "def-456",
      "error_type": "LLM_TIMEOUT",
      "error_message": "Groq API timeout after 20s",
      "failed_at": "2024-01-15T10:35:00Z",
      "retry_count": 3
    }
  ],
  "total_count": 12,
  "page": 1
}
```

**Admin Actions:**
- View failed job details (traceback)
- Retry failed job manually
- Delete failed job
- Reset submission status (for infra failures)

### Health Monitoring

**Worker Health Check:**
```python
# Each worker pings Redis every 30s
# If no ping for 2 min → worker considered dead

# Health endpoint (separate from main API)
GET /health/workers → {"healthy": true, "workers": 4, "last_heartbeat": "..."}
```

**Stuck Job Detection:**
```python
# Cron job every 5 minutes
def detect_stuck_jobs():
    # Find submissions with status IN ('CLONING', 'SCORING')
    # AND updated_at < now() - 5 minutes
    # → Mark as FAILED, alert admin
```

### Schema Additions

```sql
-- Add job tracking to submissions
ALTER TABLE submissions ADD COLUMN job_id VARCHAR(100);
ALTER TABLE submissions ADD COLUMN job_started_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN job_completed_at TIMESTAMPTZ;

-- Index for stuck job detection
CREATE INDEX idx_submissions_stuck ON submissions(status, updated_at)
  WHERE status IN ('CLONING', 'SCORING');
```

### Resolved Decisions
- ✅ Webhook to external system on scoring complete → **No** for MVP (internal email sufficient)
- ✅ Log to Datadog/CloudWatch → **Post-MVP** (Railway logs + Sentry sufficient)

---

## 7. Admin Features & Dashboard

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Dashboard Home** | Stats + Activity Feed | Quick overview + recent actions |
| **Candidate Management** | Full CRUD + export | Complete candidate oversight |
| **Assessment Management** | CRUD + clone + archive | Flexibility for content management |
| **Submission Oversight** | View, re-score, override, notes | Handle edge cases |
| **Reporting** | Leaderboard, analytics, export | Data-driven decisions |
| **System Settings** | Config, invites, maintenance | Platform control |

### Admin Navigation Structure

```
Admin Dashboard
├── Home (Stats + Activity)
├── Candidates
│   ├── All Candidates (search, filter, export)
│   └── Candidate Detail → Submissions
├── Assessments
│   ├── All Assessments
│   ├── Create Assessment
│   └── Assessment Detail → Stats
├── Submissions
│   ├── All Submissions (filter by status)
│   └── Submission Detail → Scores, Actions
├── Queue & Jobs
│   ├── Queue Status
│   └── Failed Jobs
├── Reports
│   ├── Leaderboard
│   ├── Analytics
│   └── Export
└── Settings
    ├── Admin Users & Invites
    ├── System Config
    └── API Keys
```

### 1. Dashboard Home

**Summary Stats Cards:**
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Candidates  │ │ Submissions │ │  Pass Rate  │ │ Queue Depth │
│    1,247    │ │    3,892    │ │    68.5%    │ │     47      │
│   +23 today │ │  +89 today  │ │  ↑2.1% week │ │  4 workers  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**Recent Activity Feed:**
```json
{
  "activities": [
    {
      "type": "submission_evaluated",
      "message": "John Doe scored 85 on 'REST API Challenge'",
      "timestamp": "2 min ago"
    },
    {
      "type": "candidate_registered",
      "message": "jane@example.com registered",
      "timestamp": "15 min ago"
    },
    {
      "type": "submission_failed",
      "message": "Submission #abc123 failed - LLM timeout",
      "timestamp": "1 hour ago",
      "action": "View Details"
    },
    {
      "type": "assessment_created",
      "message": "Admin created 'GraphQL API Challenge'",
      "timestamp": "3 hours ago"
    }
  ]
}
```

**Alerts Section:**
- Failed submissions needing attention
- Queue depth warnings
- Worker health issues
- Low LLM API balance (if applicable)

### 2. Candidate Management

**Candidate List View:**
| Column | Sortable | Filterable |
|--------|----------|------------|
| Name | Yes | Search |
| Email | Yes | Search |
| Vibe Score | Yes | Range |
| Total Points | Yes | Range |
| Submissions Count | Yes | Range |
| Registered Date | Yes | Date range |
| Status | No | Active/Inactive |

**Filters:**
- Score range (e.g., 70-100)
- Registration date
- Has submitted (yes/no)
- Profile complete (yes/no)
- Tags from assessments attempted

**Actions:**
| Action | Description |
|--------|-------------|
| View Profile | Full candidate details |
| View Submissions | All submissions by candidate |
| Export Profile | Download as JSON/PDF |
| Deactivate | Soft-delete, block login |
| Reactivate | Restore access |
| Send Message | Email candidate (future) |

**Candidate Detail Page:**
- Profile info (name, email, GitHub, LinkedIn, resume download)
- Vibe score breakdown
- Points history
- All submissions with scores
- Activity timeline

**Bulk Export:**
```
GET /admin/candidates/export?format=csv&filters=...

CSV columns:
name, email, github_url, linkedin_url, vibe_score, total_points,
submissions_count, avg_score, registered_at, last_active_at
```

### 3. Assessment Management

**Assessment List View:**
| Column | Info |
|--------|------|
| Title | Assessment name |
| Visibility | Active / Invite-only / Public |
| Submissions | Count |
| Avg Score | Mean of evaluated submissions |
| Pass Rate | % scoring ≥ 70 |
| Created | Date |
| Status | Active / Archived |

**Assessment Actions:**
| Action | Description |
|--------|-------------|
| Edit | Modify assessment details |
| Clone | Duplicate with new ID |
| Archive | Hide from candidates, keep data |
| Delete | Permanent removal (if no submissions) |
| View Submissions | All submissions for this assessment |
| View Stats | Detailed analytics |

**Assessment Stats Page:**
```
Assessment: "REST API Challenge"
────────────────────────────────
Total Submissions: 234
Evaluated: 220 | Failed: 14 | Pending: 0

Score Distribution:
90-100: ████████ 45 (20%)
80-89:  ██████████████ 72 (33%)
70-79:  ████████████ 58 (26%)
60-69:  ████████ 31 (14%)
<60:    ███ 14 (6%)

Pass Rate: 79%
Avg Score: 76.3
Median: 78

Avg Time to Submit: 4.2 days
```

### 4. Submission Oversight

**Submission List View:**
| Column | Filterable |
|--------|------------|
| Candidate | Search |
| Assessment | Dropdown |
| Status | Multi-select |
| Score | Range |
| Submitted At | Date range |

**Status Filter Options:**
- SUBMITTED, QUEUED, CLONING, SCORING, EVALUATED, CLONE_FAILED, SCORE_FAILED

**Submission Detail Page:**
```
Submission #abc-123
───────────────────
Candidate: John Doe (john@example.com)
Assessment: REST API Challenge
Status: EVALUATED
Submitted: Jan 15, 2024 10:30 AM
Evaluated: Jan 15, 2024 10:32 AM

GitHub Repo: github.com/johndoe/api-challenge
Commit SHA: a1b2c3d4e5f6...
Files Analyzed: 12 files [View List]

Candidate Explanation:
"I implemented a RESTful API using FastAPI with..."

─── Scores ────────────────────────────
Code Correctness:    8/10  (×25% = 20.0)
Code Quality:        7/10  (×20% = 14.0)
Code Readability:    9/10  (×15% = 13.5)
Code Robustness:     6/10  (×10% =  6.0)
Reasoning Clarity:   7/10  (×10% =  7.0)
Reasoning Depth:     8/10  (×10% =  8.0)
Reasoning Structure: 7/10  (×10% =  7.0)
────────────────────────────────────────
Final Score: 75.5 / 100   ✓ PASSED

AI Feedback:
"Well-structured solution with good error handling.
Consider adding more edge case tests."

─── Admin Actions ─────────────────────
[Re-score] [Override Score] [Add Note] [Reset Status]
```

**Admin Actions on Submissions:**

| Action | When to Use |
|--------|-------------|
| **Re-score** | Trigger fresh LLM evaluation (same code) |
| **Override Score** | Manual score adjustment with reason |
| **Add Note** | Internal admin comment |
| **Reset Status** | Reset FAILED → SUBMITTED for retry |
| **View Raw Response** | Debug LLM JSON output |

**Score Override:**
```sql
-- Track overrides
ALTER TABLE submissions ADD COLUMN admin_override_score DECIMAL(5,2);
ALTER TABLE submissions ADD COLUMN admin_override_reason TEXT;
ALTER TABLE submissions ADD COLUMN admin_override_by UUID REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN admin_override_at TIMESTAMPTZ;

-- If admin_override_score is set, use it instead of final_score for display
```

**Admin Notes:**
```sql
CREATE TABLE submission_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  admin_id        UUID NOT NULL REFERENCES users(id),
  note            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5. Reporting & Analytics

**Leaderboard Page:**
```
Rank | Candidate      | Vibe Score | Submissions | Avg Score | Pass Rate
─────┼────────────────┼────────────┼─────────────┼───────────┼──────────
1    | Alice Chen     | 892        | 8           | 89.2      | 100%
2    | Bob Smith      | 845        | 7           | 86.3      | 100%
3    | Carol Johnson  | 798        | 9           | 81.5      | 89%
...

Filters: Date range, Assessment tags, Min submissions
Export: CSV, JSON
```

**Analytics Dashboard:**

**Time-based Trends:**
- Submissions per day/week/month (line chart)
- Pass rate over time (line chart)
- New registrations trend

**Assessment Analysis:**
- Difficulty ranking (by avg score)
- Most attempted assessments
- Highest failure rate assessments

**Score Distribution:**
- Overall score histogram
- Per-assessment comparison

**LLM Metrics (from Section 5):**
- Tokens used (daily/weekly)
- Cost breakdown
- Success/failure rates
- Avg latency

**Export Options:**
```
GET /admin/reports/export
  ?type=leaderboard|submissions|candidates|analytics
  &format=csv|json|pdf
  &date_from=2024-01-01
  &date_to=2024-01-31
```

### 6. System Settings

**Admin Users & Invites:**
```
Current Admins:
┌─────────────────┬─────────────────────┬─────────────┐
│ Name            │ Email               │ Added       │
├─────────────────┼─────────────────────┼─────────────┤
│ Super Admin     │ admin@vibe.com      │ (Seed)      │
│ John Manager    │ john@vibe.com       │ Jan 10, 2024│
└─────────────────┴─────────────────────┴─────────────┘

Pending Invites:
┌─────────────────────┬─────────────┬──────────┐
│ Email               │ Invited By  │ Expires  │
├─────────────────────┼─────────────┼──────────┤
│ new@vibe.com        │ Super Admin │ Jan 20   │
└─────────────────────┴─────────────┴──────────┘

[Invite New Admin] [Revoke Invite] [Remove Admin]
```

**System Configuration:**
```yaml
# Editable via admin UI
scoring:
  llm_model: "llama-3.1-70b-versatile"  # Dropdown of supported models
  temperature: 0
  max_tokens: 1000

timeouts:
  job_total_seconds: 180
  git_clone_seconds: 45
  llm_call_seconds: 20

limits:
  max_file_size_kb: 200
  max_files: 40
  max_repo_size_mb: 50

queue:
  worker_count: 4
  max_retries: 3
```

**API Keys Management:**
```
Groq API Key: sk-****...****xyz [Rotate] [Test]
GitHub Token (optional): ghp-****...****abc [Rotate] [Test]

Last rotated: Jan 1, 2024
```

**Maintenance Mode:**
```
[Toggle Maintenance Mode]

When ON:
- Candidates see "Platform under maintenance" message
- New submissions blocked
- Existing queue continues processing
- Admins can still access dashboard
```

### Schema Additions for Admin Features

```sql
-- Activity log for feed
CREATE TABLE activity_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type             VARCHAR(50) NOT NULL,  -- 'submission_evaluated', 'candidate_registered', etc.
  actor_id         UUID REFERENCES users(id),  -- Who did it (null for system)
  target_type      VARCHAR(50),           -- 'submission', 'candidate', 'assessment'
  target_id        UUID,
  message          TEXT NOT NULL,
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_org_created ON activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_log_type ON activity_log(type);

-- System config (key-value store)
CREATE TABLE system_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Maintenance mode flag
INSERT INTO system_config (key, value) VALUES ('maintenance_mode', 'false');

-- Admin audit log (for tracking admin actions)
CREATE TABLE admin_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admin_id         UUID NOT NULL REFERENCES users(id),
  action           VARCHAR(100) NOT NULL,  -- 'override_score', 'reset_submission', 'deactivate_user'
  target_type      VARCHAR(50) NOT NULL,   -- 'submission', 'candidate', 'assessment'
  target_id        UUID NOT NULL,
  old_value        JSONB,                  -- Previous state
  new_value        JSONB,                  -- New state
  reason           TEXT,                   -- Admin's justification
  ip_address       INET,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_org_created ON admin_audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_log_target ON admin_audit_log(target_type, target_id);
```

### Admin API Endpoints Summary

```
# Dashboard
GET  /admin/dashboard/stats
GET  /admin/dashboard/activity

# Candidates
GET  /admin/candidates
GET  /admin/candidates/:id
GET  /admin/candidates/:id/submissions
PUT  /admin/candidates/:id/status  (activate/deactivate)
GET  /admin/candidates/export

# Assessments
GET  /admin/assessments
POST /admin/assessments
GET  /admin/assessments/:id
PUT  /admin/assessments/:id
POST /admin/assessments/:id/clone
PUT  /admin/assessments/:id/archive
DEL  /admin/assessments/:id
GET  /admin/assessments/:id/stats

# Submissions
GET  /admin/submissions
GET  /admin/submissions/:id
POST /admin/submissions/:id/rescore
PUT  /admin/submissions/:id/override
POST /admin/submissions/:id/notes
PUT  /admin/submissions/:id/reset

# Queue
GET  /admin/queue/status
GET  /admin/queue/failed
POST /admin/queue/failed/:id/retry
DEL  /admin/queue/failed/:id

# Reports
GET  /admin/reports/leaderboard
GET  /admin/reports/analytics
GET  /admin/reports/export

# Settings
GET  /admin/settings/config
PUT  /admin/settings/config
GET  /admin/admins
POST /admin/admins/invite
DEL  /admin/admins/:id
PUT  /admin/settings/maintenance
```

### Resolved Decisions
- ✅ Email notifications to admins for critical events → **Yes, critical only** (job failure rate spike, DB/queue errors, worker crashes - no noise)
- ✅ Audit log for admin actions → **Yes** (who changed what, when - essential for accountability)

---

## 8. API Design & Endpoints

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Versioning** | URL path: `/api/v1/...` | Simple, explicit, easy to manage |
| **Response Format** | Standard envelope `{success, data, error}` | Consistent client handling |
| **Pagination** | Offset-based `?page=1&limit=20` | Simple for MVP, cursor later |
| **Rate Limiting** | 100 req/min general, 5 submissions/hr/user | Prevent abuse |
| **Error Codes** | HTTP status + custom codes | Debugging + user-friendly |
| **Auth Header** | `Authorization: Bearer <token>` | Industry standard |
| **CORS** | Whitelist specific domains | Security best practice |

### Response Format

**Success Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc-123",
    "name": "Example"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ASSESSMENT_NOT_FOUND",
    "message": "The requested assessment does not exist"
  }
}
```

**Paginated Response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "page": 1,
    "limit": 20,
    "total": 132
  }
}
```

### HTTP Status Codes

| Status | Usage |
|--------|-------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate submission) |
| 422 | Unprocessable Entity (business logic error) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (maintenance mode) |

### Error Codes Reference

**Authentication:**
| Code | Message |
|------|---------|
| `AUTH_TOKEN_MISSING` | Authorization header is required |
| `AUTH_TOKEN_INVALID` | Invalid or malformed token |
| `AUTH_TOKEN_EXPIRED` | Token has expired, please login again |
| `AUTH_EMAIL_NOT_VERIFIED` | Please verify your email before continuing |
| `AUTH_USER_DEACTIVATED` | Your account has been deactivated |

**Profile:**
| Code | Message |
|------|---------|
| `PROFILE_NOT_FOUND` | Profile not found |
| `PROFILE_INVALID_GITHUB_URL` | Invalid GitHub profile URL |
| `PROFILE_GITHUB_NOT_FOUND` | GitHub profile does not exist |
| `PROFILE_INVALID_FILE_TYPE` | Resume must be PDF or DOCX |
| `PROFILE_FILE_TOO_LARGE` | Resume exceeds 20MB limit |

**Assessment:**
| Code | Message |
|------|---------|
| `ASSESSMENT_NOT_FOUND` | Assessment not found |
| `ASSESSMENT_NOT_ACTIVE` | This assessment is no longer active |
| `ASSESSMENT_INVITE_REQUIRED` | You need an invite to access this assessment |
| `ASSESSMENT_TIME_EXPIRED` | Submission deadline has passed |

**Submission:**
| Code | Message |
|------|---------|
| `SUBMISSION_ALREADY_EXISTS` | You have already submitted for this assessment |
| `SUBMISSION_INVALID_REPO_URL` | Invalid GitHub repository URL |
| `SUBMISSION_REPO_NOT_FOUND` | Repository not found or is private |
| `SUBMISSION_REPO_NO_CODE` | No supported code files found in repository |
| `SUBMISSION_REPO_TOO_LARGE` | Repository exceeds 100MB size limit |
| `SUBMISSION_NOT_FOUND` | Submission not found |
| `SUBMISSION_SCORING_FAILED` | Scoring failed, please contact support |

**Rate Limiting:**
| Code | Message |
|------|---------|
| `RATE_LIMIT_EXCEEDED` | Too many requests, please try again later |
| `SUBMISSION_RATE_LIMIT` | Maximum 5 submissions per hour |

### Rate Limiting Configuration

```python
# config/rate_limits.py
RATE_LIMITS = {
    "default": "60/minute",          # General API calls
    "auth": "10/minute",             # Login/register attempts
    "submission": "5/hour",          # New submissions
    "profile_update": "20/minute",   # Profile changes
    "file_upload": "10/minute",      # Resume uploads
}
```

**Implementation (FastAPI + Redis):**
```python
from fastapi import Request, HTTPException
from redis import Redis

async def rate_limit(request: Request, key: str, limit: int, window: int):
    redis = request.app.state.redis
    user_id = request.state.user.id
    cache_key = f"rate:{key}:{user_id}"

    current = redis.incr(cache_key)
    if current == 1:
        redis.expire(cache_key, window)

    if current > limit:
        raise HTTPException(
            status_code=429,
            detail={
                "success": False,
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Try again in {window} seconds."
                }
            }
        )
```

### CORS Configuration

```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    # Production
    "https://app.vibecoding.in",
    "https://vibecoding.in",
    "https://www.vibecoding.in",
]

if settings.ENV == "development":
    ALLOWED_ORIGINS.extend([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite default
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Candidate API Endpoints

#### Authentication
```
POST /api/v1/auth/register
  Body: { email, password, name }
  → Creates user + sends verification email

POST /api/v1/auth/login
  Body: { email, password } or { firebase_token }
  → Returns { token, user }

POST /api/v1/auth/logout
  → Invalidates token (if using refresh tokens)

POST /api/v1/auth/forgot-password
  Body: { email }
  → Sends password reset email (Firebase)

POST /api/v1/auth/verify-email
  Body: { token }
  → Marks email as verified
```

#### Profile
```
GET  /api/v1/profiles/me
  → Returns current user's profile + stats

PUT  /api/v1/profiles/me
  Body: { name, mobile, github_url, linkedin_url }
  → Updates profile, awards points if first time

POST /api/v1/profiles/me/resume
  Body: FormData with file (PDF/DOCX, max 20MB)
  → Uploads resume, awards points if first time

DELETE /api/v1/profiles/me/resume
  → Deletes the user's uploaded resume

GET  /api/v1/profiles/me/points
  → Returns points history

GET  /api/public/profiles/:idOrSlug
  → Returns a public profile by UUID or slug (no auth, only if `is_public=true`)
```

#### Talent (Company)
```
GET  /api/v1/talent/search
  → Search public profiles (admin/owner/reviewer only)

GET  /api/v1/talent/shortlist
POST /api/v1/talent/shortlist
PATCH /api/v1/talent/shortlist/:id
DELETE /api/v1/talent/shortlist/:id
  → Manage org shortlist entries

GET  /api/v1/talent/shortlist/export
  → Export shortlist as CSV
```

#### Assessments
```
GET  /api/v1/assessments
  Query: ?tags=backend&visibility=active
  → Returns list of available assessments (active + public)

GET  /api/v1/assessments/:id
  → Returns full assessment details

GET  /api/v1/assessments/invited
  → Returns assessments user is invited to
```

#### Submissions
```
POST /api/v1/submissions
  Body: { assessment_id, github_repo_url, explanation_text }
  → Validates repo, creates submission, queues for scoring

GET  /api/v1/submissions
  → Returns all submissions by current user

GET  /api/v1/submissions/:id
  → Returns submission details + scores (if evaluated)

GET  /api/v1/submissions/:id/status
  → Returns just status (for polling during scoring)
```

#### Dashboard (Candidate)
```
GET  /api/v1/dashboard
  → Returns summary: vibe_score, total_points, recent_submissions, profile_completion
```

---

### Admin API Endpoints (Summary from Section 7)

```
# Authentication (admin-specific)
POST /api/v1/admin/auth/login
  → Admin login (same as candidate but checks role)

# Dashboard
GET  /api/v1/admin/dashboard/stats
GET  /api/v1/admin/dashboard/activity

# Candidates
GET  /api/v1/admin/candidates
GET  /api/v1/admin/candidates/:id
GET  /api/v1/admin/candidates/:id/submissions
PUT  /api/v1/admin/candidates/:id/status
GET  /api/v1/admin/candidates/export

# Assessments
GET  /api/v1/admin/assessments
POST /api/v1/admin/assessments
GET  /api/v1/admin/assessments/:id
PUT  /api/v1/admin/assessments/:id
POST /api/v1/admin/assessments/:id/clone
PUT  /api/v1/admin/assessments/:id/archive
DEL  /api/v1/admin/assessments/:id
GET  /api/v1/admin/assessments/:id/stats
POST /api/v1/admin/assessments/:id/invite
  Body: { emails: [...] }

# Submissions
GET  /api/v1/admin/submissions
GET  /api/v1/admin/submissions/:id
POST /api/v1/admin/submissions/:id/rescore
PUT  /api/v1/admin/submissions/:id/override
POST /api/v1/admin/submissions/:id/notes
PUT  /api/v1/admin/submissions/:id/reset

# Queue
GET  /api/v1/admin/queue/status
GET  /api/v1/admin/queue/failed
POST /api/v1/admin/queue/failed/:id/retry
DEL  /api/v1/admin/queue/failed/:id

# Reports
GET  /api/v1/admin/reports/leaderboard
GET  /api/v1/admin/reports/analytics
GET  /api/v1/admin/reports/export

# Settings
GET  /api/v1/admin/settings/config
PUT  /api/v1/admin/settings/config
GET  /api/v1/admin/admins
POST /api/v1/admin/admins/invite
DEL  /api/v1/admin/admins/:id
PUT  /api/v1/admin/settings/maintenance
```

---

### Health & Utility Endpoints

```
GET  /health
  → Returns { status: "ok", timestamp: "..." }

GET  /health/db
  → Checks database connectivity

GET  /health/redis
  → Checks Redis connectivity

GET  /health/workers
  → Returns worker status (count, busy, idle)

GET  /api/v1/config/public
  → Returns public config (maintenance mode, supported file types, etc.)
```

---

### Request/Response Examples

**Register:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}

Response 201:
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "candidate",
      "email_verified": false
    },
    "message": "Verification email sent"
  }
}
```

**Submit Assessment:**
```http
POST /api/v1/submissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "assessment_id": "uuid",
  "github_repo_url": "https://github.com/johndoe/my-solution",
  "explanation_text": "I implemented the solution using..."
}

Response 201:
{
  "success": true,
  "data": {
    "id": "submission-uuid",
    "status": "SUBMITTED",
    "message": "Submission received. Scoring will begin shortly."
  }
}
```

**Get Submission Status (Polling):**
```http
GET /api/v1/submissions/uuid/status
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "data": {
    "status": "SCORING",
    "progress": "Analyzing code quality..."
  }
}

// Later...
{
  "success": true,
  "data": {
    "status": "EVALUATED",
    "final_score": 78.5,
    "passed": true
  }
}
```

### Resolved Decisions
- ✅ WebSocket for real-time status updates → **No** for MVP (polling is simpler, stable)
- ✅ GraphQL → **No** (REST is sufficient)

---

## 9. Frontend Architecture

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Framework** | React + Vite (TypeScript) | Fast dev, simple build, no SSR needed |
| **Styling** | Tailwind CSS | Rapid iteration, dashboard-friendly |
| **Server State** | TanStack Query (React Query) | Caching, loading states, mutations |
| **Client State** | React Context + hooks | Simple, lightweight |
| **Routing** | React Router v6 | Stable, nested routes, guards |
| **API Client** | Fetch wrapper + React Query | Clean separation |
| **Forms** | React Hook Form | Validation, performance |
| **App Structure** | Single SPA, role-based routes | Simpler deployment |

### Tech Stack Summary

```
React 18 + TypeScript
├── Vite (build tool)
├── React Router v6 (routing)
├── TanStack Query v5 (server state)
├── React Context (auth state)
├── React Hook Form + Zod (forms + validation)
├── Tailwind CSS (styling)
├── shadcn/ui (optional component primitives)
├── react-hot-toast / sonner (notifications)
└── Firebase SDK (auth)
```

### Project Structure

```
src/
├── main.tsx                    # App entry point
├── App.tsx                     # Router setup
├── index.css                   # Tailwind imports
│
├── api/
│   ├── client.ts               # Fetch wrapper with auth
│   ├── auth.ts                 # Auth API calls
│   ├── profile.ts              # Profile API calls
│   ├── assessments.ts          # Assessment API calls
│   ├── submissions.ts          # Submission API calls
│   └── admin/                  # Admin API calls
│       ├── candidates.ts
│       ├── assessments.ts
│       └── ...
│
├── hooks/
│   ├── useAuth.ts              # Auth context hook
│   ├── useProfile.ts           # Profile query hook
│   ├── useAssessments.ts       # Assessments query hook
│   └── ...
│
├── components/
│   ├── ui/                     # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   ├── Skeleton.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── AppLayout.tsx       # Main app shell
│   │   ├── AdminLayout.tsx     # Admin shell with sidebar
│   │   ├── Navbar.tsx
│   │   └── Sidebar.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── ProtectedRoute.tsx
│   └── features/
│       ├── dashboard/
│       ├── profile/
│       ├── assessments/
│       └── submissions/
│
├── pages/
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   └── VerifyEmailPage.tsx
│   ├── candidate/
│   │   ├── DashboardPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── AssessmentsPage.tsx
│   │   ├── AssessmentDetailPage.tsx
│   │   ├── SubmissionStatusPage.tsx
│   │   └── MySubmissionsPage.tsx
│   ├── admin/
│   │   ├── DashboardPage.tsx
│   │   ├── CandidatesPage.tsx
│   │   ├── CandidateDetailPage.tsx
│   │   ├── AssessmentsPage.tsx
│   │   ├── AssessmentFormPage.tsx
│   │   ├── SubmissionsPage.tsx
│   │   ├── SubmissionDetailPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── QueueStatusPage.tsx
│   │   └── SettingsPage.tsx
│   ├── NotFoundPage.tsx
│   └── ErrorPage.tsx
│
├── context/
│   └── AuthContext.tsx         # Auth provider + hook
│
├── lib/
│   ├── firebase.ts             # Firebase config
│   ├── utils.ts                # Utility functions
│   └── constants.ts            # App constants
│
└── types/
    ├── api.ts                  # API response types
    ├── user.ts                 # User types
    ├── assessment.ts           # Assessment types
    └── submission.ts           # Submission types
```

### Route Structure

```tsx
// App.tsx
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />
  <Route path="/verify-email" element={<VerifyEmailPage />} />

  {/* Candidate routes (protected) */}
  <Route element={<ProtectedRoute allowedRoles={['candidate', 'admin']} />}>
    <Route element={<AppLayout />}>
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/assessments" element={<AssessmentsPage />} />
      <Route path="/assessments/:id" element={<AssessmentDetailPage />} />
      <Route path="/submissions/:id" element={<SubmissionStatusPage />} />
      <Route path="/my-submissions" element={<MySubmissionsPage />} />
    </Route>
  </Route>

  {/* Admin routes (protected, admin only) */}
  <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
    <Route element={<AdminLayout />}>
      <Route path="/admin" element={<Navigate to="/admin/dashboard" />} />
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/admin/candidates" element={<CandidatesPage />} />
      <Route path="/admin/candidates/:id" element={<CandidateDetailPage />} />
      <Route path="/admin/assessments" element={<AdminAssessmentsPage />} />
      <Route path="/admin/assessments/new" element={<AssessmentFormPage />} />
      <Route path="/admin/assessments/:id" element={<AssessmentFormPage />} />
      <Route path="/admin/submissions" element={<AdminSubmissionsPage />} />
      <Route path="/admin/submissions/:id" element={<SubmissionDetailPage />} />
      <Route path="/admin/reports" element={<ReportsPage />} />
      <Route path="/admin/queue" element={<QueueStatusPage />} />
      <Route path="/admin/settings" element={<SettingsPage />} />
    </Route>
  </Route>

  {/* 404 */}
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

### API Client Setup

```typescript
// api/client.ts
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

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 401) {
        // Token expired - redirect to login
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
      throw data.error;
    }

    return data;
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

### React Query Usage Example

```typescript
// hooks/useAssessments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { Assessment } from '@/types/assessment';

export function useAssessments(filters?: { tags?: string }) {
  return useQuery({
    queryKey: ['assessments', filters],
    queryFn: () => apiClient.get<Assessment[]>('/assessments', { params: filters }),
  });
}

export function useAssessment(id: string) {
  return useQuery({
    queryKey: ['assessment', id],
    queryFn: () => apiClient.get<Assessment>(`/assessments/${id}`),
    enabled: !!id,
  });
}

// hooks/useSubmission.ts
export function useSubmitAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SubmissionData) =>
      apiClient.post('/submissions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
    },
  });
}
```

### Auth Context

```typescript
// context/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { apiClient } from '@/api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'candidate' | 'admin';
  email_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Get token and fetch user from backend
        const token = await fbUser.getIdToken();
        localStorage.setItem('auth_token', token);

        try {
          const { data } = await apiClient.get<User>('/auth/me');
          setUser(data);
        } catch {
          setUser(null);
        }
      } else {
        localStorage.removeItem('auth_token');
        setUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ... login, logout methods

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

### Protected Route Component

```typescript
// components/auth/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  allowedRoles?: ('candidate' | 'admin')[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />; // Full page loader
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user.email_verified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
```

### Page List (Complete)

**Public Pages:**
| Route | Page | Description |
|-------|------|-------------|
| `/login` | LoginPage | Email/password + Google sign-in |
| `/register` | RegisterPage | New account creation |
| `/forgot-password` | ForgotPasswordPage | Request password reset |
| `/reset-password` | ResetPasswordPage | Set new password |
| `/verify-email` | VerifyEmailPage | Email verification landing |

**Candidate Pages:**
| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | DashboardPage | Vibe score, points, recent activity |
| `/profile` | ProfilePage | Edit profile, upload resume |
| `/assessments` | AssessmentsPage | Browse available assessments |
| `/assessments/:id` | AssessmentDetailPage | View details + submit |
| `/my-submissions` | MySubmissionsPage | All submissions list |
| `/submissions/:id` | SubmissionStatusPage | Status + scores |

**Admin Pages:**
| Route | Page | Description |
|-------|------|-------------|
| `/admin/dashboard` | AdminDashboardPage | Stats + activity feed |
| `/admin/candidates` | CandidatesPage | Candidate list + filters |
| `/admin/candidates/:id` | CandidateDetailPage | Profile + submissions |
| `/admin/assessments` | AdminAssessmentsPage | Assessment list |
| `/admin/assessments/new` | AssessmentFormPage | Create assessment |
| `/admin/assessments/:id` | AssessmentFormPage | Edit assessment |
| `/admin/submissions` | AdminSubmissionsPage | All submissions + filters |
| `/admin/submissions/:id` | SubmissionDetailPage | Scores + admin actions |
| `/admin/reports` | ReportsPage | Leaderboard + analytics |
| `/admin/queue` | QueueStatusPage | Queue depth + failed jobs |
| `/admin/settings` | SettingsPage | Config + admin invites |

**Utility Pages:**
| Route | Page | Description |
|-------|------|-------------|
| `*` | NotFoundPage | 404 error |
| (error boundary) | ErrorPage | Runtime error fallback |

### UI/UX Considerations

**Loading States:**
- Skeleton loaders for lists/tables
- Spinner for form submissions
- Progress bar for file uploads

**Notifications:**
- Toast for success/error messages
- react-hot-toast or sonner

**Responsive Design:**
- Mobile-first Tailwind classes
- Collapsible sidebar on mobile
- Responsive tables (cards on mobile)

**Error Handling:**
- Error boundaries at route level
- Inline form validation errors
- API error toasts

**Accessibility:**
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Focus management

### Resolved Decisions
- ✅ Dark mode → **Post-MVP** (Tailwind makes it easy to add later)
- ✅ Internationalization (i18n) → **No** for MVP (English only)

---

## 10. Deployment & Infrastructure

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Cloud Provider** | Railway (compute) + GCS (storage) | Simple, cost-effective, good DX |
| **Deployment Model** | PaaS (Railway services) | No K8s complexity, auto-deploy |
| **Database** | Railway Postgres (or Neon if pgvector needed) | Managed, easy setup |
| **Redis** | Railway Redis add-on | Same platform, simple |
| **CI/CD** | Railway auto-deploy + GitHub Actions | Push to main → deploy |
| **Environments** | Dev + Prod | Minimum viable setup |
| **Monitoring** | Railway logs + Sentry | Built-in + error tracking |
| **SSL** | Railway managed (Let's Encrypt) | Automatic, free |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            RAILWAY                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │   Frontend   │    │     API      │    │    Worker    │         │
│   │  (React SPA) │    │  (FastAPI)   │    │    (RQ)      │         │
│   │              │    │              │    │              │         │
│   │ Static Site  │    │ Web Service  │    │ Background   │         │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │
│          │                   │                   │                  │
│          │                   ├───────────────────┤                  │
│          │                   │                   │                  │
│          │            ┌──────▼───────┐    ┌──────▼───────┐         │
│          │            │   Postgres   │    │    Redis     │         │
│          │            │  (pgvector)  │    │   (Queue)    │         │
│          │            └──────────────┘    └──────────────┘         │
│          │                                                          │
└──────────┼──────────────────────────────────────────────────────────┘
           │
           │  HTTPS
           ▼
┌──────────────────────┐
│     Cloudflare       │  (optional CDN/DDoS protection)
│   or Railway Edge    │
└──────────────────────┘

External Services:
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Google Cloud    │  │     Firebase     │  │      Groq        │
│    Storage       │  │  Authentication  │  │    LLM API       │
│   (Resumes)      │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Railway Services Configuration

**Service 1: `vibe-api`**
```yaml
Type: Web Service
Build: Dockerfile
Port: 8000
Start Command: uvicorn app.main:app --host 0.0.0.0 --port 8000
Health Check: /health
```

**Service 2: `vibe-worker`**
```yaml
Type: Worker (Background)
Build: Dockerfile (same image as API)
Start Command: python -m app.worker.main
Replicas: 1-4 (scale based on queue depth)
```

**Service 3: `vibe-frontend`**
```yaml
Type: Static Site
Build: npm run build
Output Directory: dist
```

### Environment Variables Matrix

**Shared Variables (API + Worker):**
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/vibe_db

# Redis
REDIS_URL=redis://default:pass@host:6379

# Firebase
FIREBASE_PROJECT_ID=vibe-coding-prod
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}

# Google Cloud Storage
GCS_PROJECT_ID=vibe-coding-prod
GCS_BUCKET_NAME=vibecoding-resumes-prod
GCS_CREDENTIALS_JSON={"type":"service_account",...}

# Groq LLM
GROQ_API_KEY=gsk_xxxxxxxxxxxx

# App Config
ENV=production
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=https://app.vibecoding.in,https://vibecoding.in
```

**API-specific:**
```bash
PORT=8000
LOG_LEVEL=info
```

**Worker-specific:**
```bash
WORKER_COUNT=4
JOB_TIMEOUT=180
LOG_LEVEL=info
```

**Frontend (build-time):**
```bash
VITE_API_URL=https://api.vibecoding.in/api/v1
VITE_FIREBASE_API_KEY=AIzaxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=vibe-coding-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=vibe-coding-prod
```

### Dockerfile (Backend)

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Install git (needed for cloning repos)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Default command (overridden per service)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Dockerfile (Frontend)

```dockerfile
# Dockerfile.frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Database Setup

**Option A: Railway Postgres (if pgvector supported)**
```sql
-- Run after creating Railway Postgres instance
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**Option B: Neon/Supabase (if Railway doesn't support pgvector)**
1. Create project on Neon (neon.tech) or Supabase
2. Enable pgvector extension
3. Copy connection string
4. Set `DATABASE_URL` in Railway services

### Redis Setup

```bash
# Railway Redis provides REDIS_URL automatically
# Format: redis://default:password@host:port

# Test connection
redis-cli -u $REDIS_URL ping
# Should return: PONG
```

### GCS Bucket Setup

```bash
# 1. Create bucket
gsutil mb -l us-central1 gs://vibecoding-resumes-prod

# 2. Set lifecycle (delete old resumes after 2 years)
gsutil lifecycle set lifecycle.json gs://vibecoding-resumes-prod

# 3. Create service account
gcloud iam service-accounts create vibe-backend \
  --display-name="Vibe Backend"

# 4. Grant permissions
gsutil iam ch serviceAccount:vibe-backend@PROJECT.iam.gserviceaccount.com:objectAdmin \
  gs://vibecoding-resumes-prod

# 5. Create key
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=vibe-backend@PROJECT.iam.gserviceaccount.com
```

### Domain Configuration

**DNS Records (Cloudflare/Registrar):**
```
Type  | Name          | Content
------|---------------|---------------------------
CNAME | app           | vibe-frontend.railway.app
CNAME | api           | vibe-api.railway.app
CNAME | www           | app.vibecoding.in
A     | @             | (redirect to app subdomain)
```

**Railway Custom Domains:**
```
Frontend: app.vibecoding.in → vibe-frontend service
API: api.vibecoding.in → vibe-api service
```

### CI/CD Pipeline

**GitHub Actions (`.github/workflows/ci.yml`):**
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pip install pytest pytest-cov
      - run: pytest --cov=app tests/

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run test

  # Railway auto-deploys on push to main
  # No manual deploy step needed
```

**Deployment Flow:**
```
Developer pushes to feature branch
        ↓
GitHub Actions runs tests
        ↓
PR merged to main
        ↓
Railway auto-deploys all services
        ↓
Health checks pass → traffic shifted
```

### Environment Setup

**Development:**
```
Railway Project: vibe-dev
- Postgres: Shared (cheaper)
- Redis: Shared
- Services: Single replica each
- GCS Bucket: vibecoding-resumes-dev
```

**Production:**
```
Railway Project: vibe-prod
- Postgres: Dedicated (better performance)
- Redis: Dedicated
- Services: API (2 replicas), Worker (4 replicas)
- GCS Bucket: vibecoding-resumes-prod
```

### Backup Strategy

**Database (Railway/Neon):**
| Item | Frequency | Retention |
|------|-----------|-----------|
| Daily snapshot | Daily at 2 AM UTC | 7 days |
| Weekly backup | Sunday 3 AM UTC | 4 weeks |
| Before migration | Manual trigger | 30 days |

**Configuration (in repo):**
```bash
# Export schema for version control
pg_dump --schema-only $DATABASE_URL > schema.sql
```

**GCS (built-in durability):**
- 99.999999999% durability (11 9s)
- No additional backup needed
- Optional: Enable versioning for accidental deletes

### Monitoring & Alerting

**Railway Built-in:**
- Service logs (stdout/stderr)
- Deployment history
- Resource usage (CPU, Memory)

**Sentry (Error Tracking):**
```python
# app/main.py
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENV", "development"),
    traces_sample_rate=0.1,
)
```

**Health Endpoints:**
```python
@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

@app.get("/health/db")
async def health_db(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}

@app.get("/health/redis")
async def health_redis(redis: Redis = Depends(get_redis)):
    redis.ping()
    return {"status": "ok", "redis": "connected"}
```

**Alerts to Set Up:**
| Alert | Condition | Action |
|-------|-----------|--------|
| API down | Health check fails 3x | Email + Slack |
| High error rate | >5% 5xx responses | Email |
| Queue backup | queue_depth > 100 for 10 min | Email |
| Worker crash | Worker process exits | Auto-restart + Email |
| DB connections | >80% pool used | Email |

### Cost Estimates (Monthly)

**Railway (Hobby → Pro as you scale):**
| Service | Hobby | Pro |
|---------|-------|-----|
| API (1 replica) | ~$5 | ~$20 |
| Worker (2 replicas) | ~$10 | ~$40 |
| Frontend (static) | ~$0 | ~$5 |
| Postgres (1GB) | ~$5 | ~$20 |
| Redis (100MB) | ~$5 | ~$10 |
| **Total** | **~$25** | **~$95** |

**External Services:**
| Service | Free Tier | Paid |
|---------|-----------|------|
| Firebase Auth | 50k MAU free | $0.01/MAU after |
| GCS | 5GB free | $0.02/GB/month |
| Groq API | Limited free | ~$0.27/1M tokens |
| Sentry | 5k errors/month | $26/month |
| **Total** | **~$0** | **~$30-50** |

**Estimated MVP Total: $25-150/month** depending on usage

### Deployment Checklist

**Pre-Launch:**
- [ ] Railway project created (dev + prod)
- [ ] Postgres instance running, pgvector enabled
- [ ] Redis instance running
- [ ] GCS bucket created with service account
- [ ] Firebase project configured
- [ ] Groq API key obtained
- [ ] Environment variables set in Railway
- [ ] Custom domains configured
- [ ] SSL certificates active
- [ ] Health checks passing

**First Deploy:**
- [ ] Run database migrations
- [ ] Seed admin user
- [ ] Create first assessment (test)
- [ ] Test candidate flow end-to-end
- [ ] Test admin flow end-to-end
- [ ] Verify email sending works
- [ ] Verify resume upload works
- [ ] Verify submission scoring works

**Post-Launch:**
- [ ] Set up Sentry error tracking
- [ ] Configure backup schedule
- [ ] Set up monitoring alerts
- [ ] Document runbooks for common issues
- [ ] Load test with expected traffic

### Resolved Decisions
- ✅ CDN for frontend → **No** for MVP (Railway edge sufficient)
- ✅ Multi-region deployment → **Post-MVP** (single region fine initially)

---

## Summary

This document captures all architectural decisions for the Vibe Coding Platform MVP. The key technology choices are:

| Layer | Technology |
|-------|------------|
| **Frontend** | React + Vite + TypeScript + Tailwind |
| **Backend** | FastAPI (Python) |
| **Database** | PostgreSQL + pgvector |
| **Queue** | Redis + RQ |
| **Auth** | Firebase Authentication |
| **Storage** | Google Cloud Storage |
| **LLM** | Groq API |
| **Hosting** | Railway |
| **CI/CD** | GitHub Actions + Railway auto-deploy |

---

## 11. Security Checklist

### Authentication & Access Control

| Item | Implementation | Status |
|------|----------------|--------|
| Token validation | Firebase ID tokens only, verified on every request | MVP |
| Role enforcement | `candidate` / `admin` roles checked on all `/admin/*` routes | MVP |
| Session management | Firebase handles token refresh, long-lived sessions | MVP |
| Brute force protection | 5 failed attempts → 15 min lockout (Firebase + app-level) | MVP |
| Email verification | Required before assessment submission | MVP |

### Data Protection

| Item | Implementation | Status |
|------|----------------|--------|
| Password storage | None - Firebase handles all auth | MVP |
| API keys & secrets | All via environment variables, never in code | MVP |
| Service account JSON | Stored as env var, never committed | MVP |
| Database credentials | Connection string via `DATABASE_URL` env var | MVP |
| Resume uploads | Validate MIME type server-side, not just extension | MVP |
| Virus scanning on uploads | **No** for MVP - accept risk, revisit post-launch | Post-MVP |

### Least Privilege

| Item | Implementation | Status |
|------|----------------|--------|
| Database user | App-specific role, NOT superuser/postgres | MVP |
| GCS service account | Bucket-limited (`objectAdmin` on specific bucket only) | MVP |
| GitHub API | Public repo access only, no OAuth tokens stored | MVP |
| Groq API | Single API key, rotate quarterly | MVP |

### Logging & Secrets

| Item | Rule |
|------|------|
| Never log | Firebase tokens, API keys, passwords, full repo URLs with tokens |
| Safe to log | User IDs, submission IDs, status changes, error messages (sanitized) |
| PII handling | Email addresses in logs OK for debugging, scrub in production if needed |

### Data Retention

| Data Type | Retention | Action |
|-----------|-----------|--------|
| Failed RQ jobs | 30 days | Auto-delete via cleanup cron |
| Activity logs | 90 days | Archive or delete |
| Audit logs | 1 year | Required for compliance |
| Resumes (GCS) | Indefinite (user can delete) | User-initiated deletion |
| Cloned repos | Ephemeral | Delete immediately after scoring |

### Input Validation

| Input | Validation |
|-------|------------|
| GitHub URLs | Regex + API check (exists, public, has code) |
| Email addresses | Firebase validates on registration |
| File uploads | MIME type check, 20MB max, PDF/DOCX only |
| Assessment text fields | Markdown allowed, sanitize on render (XSS prevention) |
| Starter code | Soft limit 300KB |

### Infrastructure Security

| Item | Implementation |
|------|----------------|
| HTTPS | Enforced via Railway (automatic SSL) |
| CORS | Whitelist specific domains only |
| Rate limiting | 100 req/min general, 5 submissions/hour/user |
| SQL injection | SQLAlchemy ORM with parameterized queries |
| XSS | React auto-escapes, sanitize Markdown rendering |

---

## 12. Email Infrastructure

### Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Provider** | Brevo (formerly Sendinblue) | Free tier (300 emails/day), good API, reliable |
| **Sending method** | API-based from backend | No SMTP complexity |
| **Templates** | Stored in code (Jinja2/HTML) | Version controlled, easy to update |
| **From address** | noreply@vibecoding.in | Requires DNS setup |

### Email Types

| Email | Trigger | Template |
|-------|---------|----------|
| **Verification** | User registration | "Verify your email to continue" |
| **Password Reset** | Forgot password request | Firebase handles this |
| **Scoring Complete** | Submission evaluated | "Your submission scored X - click to view" |
| **Scoring Failed** | Submission failed after retries | "We couldn't score your submission" |
| **Admin Alert** | Critical system event | "Alert: {event_type} - {details}" |
| **Admin Invite** | New admin invited | "You've been invited as admin" |

### DNS Configuration (Required)

```
Type  | Name                    | Value
------|-------------------------|----------------------------------
TXT   | @                       | v=spf1 include:spf.brevo.com ~all
TXT   | mail._domainkey         | <provided by Brevo>
TXT   | _dmarc                  | v=DMARC1; p=none; rua=mailto:...
```

### Implementation

```python
# services/email.py
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = os.getenv("BREVO_API_KEY")

api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
    sib_api_v3_sdk.ApiClient(configuration)
)

async def send_scoring_complete(email: str, submission_id: str, score: float):
    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": email}],
        sender={"name": "Vibe Coding", "email": "noreply@vibecoding.in"},
        subject=f"Your submission has been scored: {score}/100",
        html_content=render_template("scoring_complete.html", {
            "score": score,
            "submission_url": f"https://app.vibecoding.in/submissions/{submission_id}"
        })
    )
    try:
        api_instance.send_transac_email(send_smtp_email)
    except ApiException as e:
        logger.error(f"Email send failed: {e}")
```

### Safeguards

| Safeguard | Implementation |
|-----------|----------------|
| Daily send limit | Track in Redis, cap at 1000/day for MVP |
| Duplicate prevention | Don't re-send if already sent for same event |
| Failure handling | Log error, don't retry (email is best-effort) |
| Unsubscribe | Not needed MVP (transactional only, no marketing) |

---

## 13. Evaluation Modes (Future-Proofing)

### Overview

The platform supports three evaluation modes to accommodate different assessment needs:

| Mode | Description | MVP Status |
|------|-------------|------------|
| `ai_only` | 100% automated LLM scoring | ✅ Implemented |
| `hybrid` | AI scores + admin review/confirmation required | ⏳ Post-MVP |
| `human_only` | No AI - admin manually enters scores | ⏳ Post-MVP |

### Schema Addition

```sql
-- Add to assessments table
CREATE TYPE evaluation_mode AS ENUM ('ai_only', 'hybrid', 'human_only');

ALTER TABLE assessments ADD COLUMN evaluation_mode evaluation_mode NOT NULL DEFAULT 'ai_only';
```

### Behaviour by Mode

**`ai_only` (MVP):**
```
Submission → Worker scores via LLM → Final score saved → Done
```

**`hybrid` (Post-MVP):**
```
Submission → Worker scores via LLM → AI score saved as "provisional"
           → Admin reviews → Admin confirms/overrides → Final score saved
```

**`human_only` (Post-MVP):**
```
Submission → No worker job created → Status = "PENDING_REVIEW"
           → Admin manually enters score via UI → Final score saved
```

### UI Impact

| Mode | Candidate Sees | Admin Sees |
|------|----------------|------------|
| `ai_only` | Score immediately after processing | Score + override option |
| `hybrid` | "Pending review" until admin confirms | AI suggestion + confirm/override |
| `human_only` | "Pending review" until admin scores | Empty score form to fill |

### Why Add Now?

Adding the `evaluation_mode` enum and column now (even if only `ai_only` is used) prevents:
- Future migrations on a table with data
- Breaking API changes
- Frontend rework

---

## 14. AI-Assisted Assessment Generation

### Overview

Admins can use AI to generate full assessment drafts from simple inputs, then review and publish.

| Aspect | Decision |
|--------|----------|
| **LLM for Generation** | Claude 4.5 / 5.1 (Anthropic) |
| **LLM for Scoring** | Groq (Llama 3.x) |
| **Fallback for Scoring** | OpenAI GPT-4o |
| **Human-in-the-loop** | Required - no auto-publish |
| **Generation Output** | Full assessment (all 9 fields + suggested weights) |

### LLM Provider Strategy

| Use Case | Provider | Model | Temperature | Why |
|----------|----------|-------|-------------|-----|
| Assessment Generation | Anthropic | Claude 4.5/5.1 | 0.7 | Strong at structured, spec-like content |
| Code Scoring | Groq | Llama 3.1 70B | 0.0 | Fast, cheap, high-volume |
| Scoring Fallback | OpenAI | GPT-4o | 0.0 | When Groq is down |

### Generation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin fills    │     │  Backend calls  │     │  Admin reviews  │     │  Assessment     │
│  simple form    │ ──► │  Claude API     │ ──► │  & edits draft  │ ──► │  published      │
│                 │     │                 │     │                 │     │                 │
│ • Topic         │     │ Returns full    │     │ • Tweak wording │     │ is_active=true  │
│ • Difficulty    │     │ assessment as   │     │ • Adjust rubric │     │ status=published│
│ • Skills        │     │ draft           │     │ • Fix examples  │     │                 │
│ • Focus areas   │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Rule: No assessment can go live without a human hitting "Publish".**

### API Design

**Generate Assessment Draft:**
```
POST /api/v1/admin/assessments/generate
```

**Request:**
```json
{
  "topic": "Build a REST API",
  "difficulty": "medium",
  "skills": ["python", "fastapi", "postgresql"],
  "estimated_hours": 3,
  "focus_areas": ["error handling", "authentication"],
  "target_role": "backend engineer",
  "additional_notes": "Should include rate limiting"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "draft_id": "uuid",
    "generated_assessment": {
      "title": "Secure Task Management API with Rate Limiting",
      "problem_statement": "Build a RESTful API for a task management system that supports user authentication, CRUD operations on tasks, and implements rate limiting to prevent abuse...",
      "build_requirements": "Create an API with the following endpoints:\n- POST /auth/register\n- POST /auth/login\n...",
      "input_output_examples": "### Create Task\nRequest:\n```json\nPOST /tasks\n{\"title\": \"Buy groceries\", \"due_date\": \"2025-12-01\"}\n```\nResponse:\n```json\n{\"id\": \"uuid\", \"title\": \"Buy groceries\", ...}\n```",
      "acceptance_criteria": [
        "User can register and login with JWT authentication",
        "CRUD operations work correctly for tasks",
        "Rate limiting returns 429 after threshold exceeded",
        "Proper error responses with appropriate HTTP codes",
        "Database migrations included"
      ],
      "constraints": [
        "Use Python 3.11+ with FastAPI",
        "PostgreSQL for persistence",
        "Implement rate limiting (100 requests/minute per user)",
        "Include basic input validation"
      ],
      "starter_code": "# main.py\nfrom fastapi import FastAPI\n\napp = FastAPI(title=\"Task API\")\n\n# Your implementation here",
      "helpful_docs": [
        "https://fastapi.tiangolo.com/tutorial/security/",
        "https://fastapi.tiangolo.com/advanced/middleware/"
      ],
      "suggested_weights": {
        "code_correctness": 30,
        "code_quality": 25,
        "code_readability": 15,
        "code_robustness": 15,
        "reasoning_clarity": 5,
        "reasoning_depth": 5,
        "reasoning_structure": 5
      }
    },
    "generation_metadata": {
      "model": "claude-sonnet-4-5-20250929",
      "tokens_used": 2847,
      "cost_usd": 0.024,
      "latency_ms": 3200
    }
  }
}
```

**Save Draft:**
```
POST /api/v1/admin/assessments
{
  "...generated fields...",
  "generated_by_ai": true,
  "generation_prompt": { "...original input..." },
  "status": "draft"
}
```

**Publish:**
```
PUT /api/v1/admin/assessments/:id/publish
```

### Schema Additions

```sql
-- Assessment status enum
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');

-- Add to assessments table
ALTER TABLE assessments
  ADD COLUMN status assessment_status NOT NULL DEFAULT 'draft',
  ADD COLUMN generated_by_ai BOOLEAN DEFAULT FALSE,
  ADD COLUMN generation_prompt JSONB,          -- Admin input to LLM
  ADD COLUMN generation_model VARCHAR(100),    -- e.g. 'claude-sonnet-4-5'
  ADD COLUMN generation_raw JSONB,             -- Optional: raw LLM response
  ADD COLUMN last_reviewed_by UUID REFERENCES users(id),
  ADD COLUMN last_reviewed_at TIMESTAMPTZ;

-- Index for draft assessments
CREATE INDEX idx_assessments_status ON assessments(status);
```

### Multi-Provider LLM Configuration

```python
# config/llm.py
LLM_PROVIDERS = {
    "assessment_generation": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5-20250929",
        "temperature": 0.7,
        "max_tokens": 4000,
    },
    "code_scoring": {
        "provider": "groq",
        "model": "llama-3.1-70b-versatile",
        "temperature": 0.0,
        "max_tokens": 1000,
    },
    "code_scoring_fallback": {
        "provider": "openai",
        "model": "gpt-4o",
        "temperature": 0.0,
        "max_tokens": 1000,
    }
}
```

### LLM Client Service

```python
# services/llm_client.py
class LLMClient:
    def __init__(self):
        self.providers = {
            "anthropic": AnthropicClient(api_key=os.getenv("ANTHROPIC_API_KEY")),
            "groq": GroqClient(api_key=os.getenv("GROQ_API_KEY")),
            "openai": OpenAIClient(api_key=os.getenv("OPENAI_API_KEY")),
        }

    async def call(
        self,
        use_case: str,  # 'assessment_generation' | 'code_scoring'
        messages: list,
        fallback: bool = True
    ) -> LLMResponse:
        config = LLM_PROVIDERS[use_case]
        provider = self.providers[config["provider"]]

        try:
            start = time.time()
            response = await provider.chat(
                model=config["model"],
                messages=messages,
                temperature=config["temperature"],
                max_tokens=config["max_tokens"],
            )
            latency = (time.time() - start) * 1000

            return LLMResponse(
                content=response.content,
                model=config["model"],
                tokens_used=response.usage.total_tokens,
                cost_usd=self._calculate_cost(config, response.usage),
                latency_ms=latency,
            )
        except Exception as e:
            if fallback and f"{use_case}_fallback" in LLM_PROVIDERS:
                return await self.call(f"{use_case}_fallback", messages, fallback=False)
            raise
```

### Prompt Templates

**Assessment Generation (Claude):**

```python
ASSESSMENT_GENERATION_SYSTEM = """You are an expert coding challenge designer for hiring software engineers.

Your task is to create realistic, well-structured coding assessments that:
- Test practical skills relevant to the role
- Have clear, unambiguous requirements
- Include helpful examples
- Are achievable within the specified time

Output ONLY valid JSON matching the exact schema provided. No additional text."""

ASSESSMENT_GENERATION_USER = """Create a coding assessment with these requirements:

Topic: {topic}
Difficulty: {difficulty}
Skills to test: {skills}
Estimated time: {estimated_hours} hours
Focus areas: {focus_areas}
Target role: {target_role}
Additional notes: {additional_notes}

Generate a complete assessment in this JSON format:
{{
  "title": "string (concise, descriptive)",
  "problem_statement": "string (2-5 paragraphs, Markdown)",
  "build_requirements": "string (clear list of what to build)",
  "input_output_examples": "string (concrete examples with code blocks)",
  "acceptance_criteria": ["array of 3-6 specific, testable criteria"],
  "constraints": ["array of technical constraints and requirements"],
  "starter_code": "string (minimal boilerplate, NOT a solution)",
  "helpful_docs": ["array of official documentation URLs only"],
  "suggested_weights": {{
    "code_correctness": number (0-100),
    "code_quality": number (0-100),
    "code_readability": number (0-100),
    "code_robustness": number (0-100),
    "reasoning_clarity": number (0-100),
    "reasoning_depth": number (0-100),
    "reasoning_structure": number (0-100)
  }}
}}

Weights must sum to 100. Starter code should be minimal (< 50 lines).
Return ONLY the JSON object."""
```

### Cost & Volume Estimates

| Use Case | Volume | Cost per Call | Monthly Cost |
|----------|--------|---------------|--------------|
| Assessment Generation | ~20/month | ~$0.03 | ~$0.60 |
| Code Scoring | ~500/month | ~$0.005 | ~$2.50 |
| **Total** | - | - | **~$3-5/month** |

### Environment Variables (Additional)

```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx
# GROQ_API_KEY already defined
```

---

## 15. Operational Runbooks

### Runbook 1: LLM Provider Down/Slow

**Symptoms:**
- Submissions stuck in `SCORING` status
- High latency on scoring jobs
- Groq API returning 5xx or timeouts

**Actions:**
1. Check Groq status page: https://status.groq.com
2. If temporary outage:
   - Jobs will auto-retry (3 attempts)
   - Monitor queue depth
   - No action needed if resolves within ~15 min
3. If extended outage (>30 min):
   - Enable maintenance mode (blocks new submissions)
   - Post status update to users
   - Consider fallback to OpenAI (requires env var swap + deploy)
4. After recovery:
   - Failed jobs can be manually retried via admin UI
   - Disable maintenance mode

**Prevention:**
- Set up uptime monitoring on Groq API
- Have backup LLM API key ready (OpenAI/Anthropic)

---

### Runbook 2: GitHub API Rate Limited

**Symptoms:**
- Submissions failing at `CLONING` stage
- Error: "API rate limit exceeded"
- 403 responses from GitHub API

**Actions:**
1. Check current rate limit: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit`
2. If using unauthenticated requests (60/hr limit):
   - Add a GitHub Personal Access Token to env vars
   - Redeploy workers
3. If authenticated and still limited (5000/hr):
   - Wait for reset (check `X-RateLimit-Reset` header)
   - Temporarily pause new submissions
4. For stuck submissions:
   - Admin can reset status to retry after rate limit resets

**Prevention:**
- Always use authenticated GitHub requests
- Cache repo existence checks (valid for 5 min)
- Consider GitHub App for higher limits

---

### Runbook 3: Queue Backlog / Worker Overload

**Symptoms:**
- Queue depth > 100 for extended period
- Oldest job age > 10 minutes
- Users complaining about slow scoring

**Actions:**
1. Check queue status: `GET /admin/queue/status`
2. Immediate relief:
   - Scale workers: increase `WORKER_COUNT` or add replicas in Railway
   - From 4 → 8 workers typically halves queue time
3. If backlog is extreme (>500 jobs):
   - Enable "high load" banner on frontend
   - Temporarily reduce submission rate limit (5/hr → 2/hr)
4. Investigate root cause:
   - Are jobs taking longer than usual? (LLM slowness)
   - Burst of submissions? (hackathon, viral post)
   - Worker crashes? (check logs)

**Prevention:**
- Set up alerting on queue depth > 100
- Auto-scaling rules (if on K8s/ECS)
- Rate limit submissions during known high-traffic events

---

### Runbook 4: Database Connection Issues

**Symptoms:**
- API returning 500 errors
- "Connection refused" or "too many connections" in logs
- Health check `/health/db` failing

**Actions:**
1. Check Railway/Neon dashboard for DB status
2. If connection pool exhausted:
   - Restart API service (clears stale connections)
   - Reduce pool size if over-provisioned
3. If DB is down:
   - Check provider status page
   - Nothing to do but wait + enable maintenance mode
4. After recovery:
   - Run health checks
   - Check for data integrity issues

**Prevention:**
- Set connection pool limits appropriately (default: 10-20)
- Monitor active connections via admin dashboard
- Use connection pooler (PgBouncer) if scaling significantly

---

## 15. Pre-Implementation Decisions

### Repository Structure

| Decision | Choice |
|----------|--------|
| **Structure** | Monorepo |
| **Reason** | Single PR for features, shared types, easier local dev |

```
vibe/
├── backend/                # FastAPI + Workers
│   ├── app/
│   │   ├── api/           # Route handlers
│   │   ├── core/          # Config, security, deps
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── worker/        # RQ worker code
│   │   └── main.py
│   ├── tests/
│   ├── alembic/           # Migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/              # React + Vite
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── context/
│   │   └── types/
│   ├── tests/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml     # Local dev (Postgres, Redis)
├── schema.sql             # Consolidated DB schema
├── seed.py                # Seed admin + test data
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
└── README.md
```

### UI/UX Approach

| Decision | Choice |
|----------|--------|
| **Approach** | Build as we go (functional-first, polish later) |
| **Design System** | Tailwind CSS + shadcn/ui components |
| **Reference Style** | Clean dashboard UI (HackerRank/LeetCode inspired) |

### Seed Data

| Item | Value |
|------|-------|
| **First Admin Email** | puneetrinity@gmail.com |
| **Admin Password** | Set via `SEED_ADMIN_PASSWORD` env var |
| **Test Assessment** | "Hello World API Challenge" (simple REST API task) |

### Testing Strategy

| Layer | Coverage | Tools | When |
|-------|----------|-------|------|
| **Unit Tests** | Critical business logic, services | pytest | MVP |
| **API Integration** | All endpoints | pytest + httpx | MVP |
| **Frontend Unit** | Components, hooks | Vitest + React Testing Library | MVP |
| **E2E Tests** | Critical user flows | Playwright | MVP |

**Test Coverage Targets (MVP):**
- Backend: 70%+ on services, 80%+ on API routes
- Frontend: 60%+ on components
- E2E: Auth flow, submission flow, admin assessment CRUD

**E2E Test Scenarios:**
```
1. Candidate Registration & Login
   - Register → Verify email → Login → See dashboard

2. Candidate Submission Flow
   - Login → View assessments → Submit repo → Poll status → View score

3. Admin Assessment Management
   - Admin login → Create assessment → Edit → Archive

4. Admin Candidate Management
   - Admin login → View candidates → View submissions → Override score
```

---

## 16. UI Wireframes & Screen Specifications

### Overview

Based on Figma wireframes + architecture requirements. All screens follow:
- **Design System:** Tailwind CSS + shadcn/ui
- **Layout:** Responsive, mobile-first
- **Style:** Clean dashboard UI (HackerRank/LeetCode inspired)

---

### Candidate App Screens

#### 1. Login Screen
```
┌─────────────────────────────────────┐
│            [VIBE LOGO]              │
│                                     │
│    ┌───────────────────────────┐    │
│    │ Email                     │    │
│    └───────────────────────────┘    │
│    ┌───────────────────────────┐    │
│    │ Password                  │    │
│    └───────────────────────────┘    │
│                                     │
│    [      Login with Email     ]    │
│                                     │
│    ─────────── OR ───────────       │
│                                     │
│    [G]  Continue with Google        │
│                                     │
│    Forgot password?                 │
│    Don't have an account? Register  │
└─────────────────────────────────────┘
```

#### 2. Register Screen
```
┌─────────────────────────────────────┐
│            [VIBE LOGO]              │
│                                     │
│    ┌───────────────────────────┐    │
│    │ Full Name                 │    │
│    └───────────────────────────┘    │
│    ┌───────────────────────────┐    │
│    │ Email                     │    │
│    └───────────────────────────┘    │
│    ┌───────────────────────────┐    │
│    │ Password                  │    │
│    └───────────────────────────┘    │
│    ┌───────────────────────────┐    │
│    │ Confirm Password          │    │
│    └───────────────────────────┘    │
│                                     │
│    [     Create Account        ]    │
│                                     │
│    Already have an account? Login   │
└─────────────────────────────────────┘
```

#### 3. Forgot Password Screen
```
┌─────────────────────────────────────┐
│            [VIBE LOGO]              │
│                                     │
│       Reset your password           │
│  Enter your email and we'll send    │
│  you a link to reset your password  │
│                                     │
│    ┌───────────────────────────┐    │
│    │ Email                     │    │
│    └───────────────────────────┘    │
│                                     │
│    [    Send Reset Link        ]    │
│                                     │
│    Back to Login                    │
└─────────────────────────────────────┘
```

#### 4. Email Verification Screen
```
┌─────────────────────────────────────┐
│            [VIBE LOGO]              │
│                                     │
│        📧 Verify your email         │
│                                     │
│   We've sent a verification link    │
│   to: john@example.com              │
│                                     │
│   Click the link in the email to    │
│   verify your account.              │
│                                     │
│   [   Resend Verification      ]    │
│                                     │
│   Didn't receive it? Check spam     │
└─────────────────────────────────────┘
```

#### 5. Dashboard
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────────────────────────┐   │
│  │   VIBE SCORE    │  │  Profile Completion                 │   │
│  │                 │  │  ████████████░░░░░ 75%              │   │
│  │      247        │  │                                     │   │
│  │   ↑ 12 this     │  │  ✓ Email  ✓ GitHub  ○ Resume       │   │
│  │     week        │  │  [Complete Profile →]               │   │
│  └─────────────────┘  └─────────────────────────────────────┘   │
│                                                                  │
│  Recent Submissions                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Assessment          │ Status      │ Score  │ Date         │ │
│  ├─────────────────────┼─────────────┼────────┼──────────────┤ │
│  │ REST API Challenge  │ ✓ Evaluated │ 85/100 │ Nov 20       │ │
│  │ Auth System         │ ⏳ Scoring  │ --     │ Nov 22       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [View All Submissions]  [Browse Assessments →]                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 6. Profile Page
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │  Personal Information   │  │  Social & Documents            ││
│  │                         │  │                                ││
│  │  Name:                  │  │  GitHub URL:                   ││
│  │  ┌───────────────────┐  │  │  ┌────────────────────────┐   ││
│  │  │ John Doe          │  │  │  │ github.com/johndoe     │   ││
│  │  └───────────────────┘  │  │  └────────────────────────┘   ││
│  │                         │  │  ✓ Verified  (+10 pts)        ││
│  │  Email:                 │  │                                ││
│  │  john@example.com ✓     │  │  LinkedIn URL:                 ││
│  │                         │  │  ┌────────────────────────┐   ││
│  │  Mobile:                │  │  │ linkedin.com/in/john   │   ││
│  │  ┌───────────────────┐  │  │  └────────────────────────┘   ││
│  │  │ +91 98765 43210   │  │  │  (+10 pts)                    ││
│  │  └───────────────────┘  │  │                                ││
│  │                         │  │  Resume:                       ││
│  │                         │  │  [📄 Upload PDF/DOCX]          ││
│  │                         │  │  (+15 pts)                     ││
│  └─────────────────────────┘  └────────────────────────────────┘│
│                                                                  │
│  Points History                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ +10  GitHub profile added       Nov 15                     │ │
│  │ +10  LinkedIn added             Nov 16                     │ │
│  │ +25  Assessment passed (85)     Nov 20                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Save Changes]                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 7. Assessments List
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Available Assessments                    [Filter ▼] [Search]    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐│
│  │ REST API         │  │ Auth System      │  │ React Dashboard  ││
│  │ Challenge        │  │                  │  │                  ││
│  │                  │  │                  │  │                  ││
│  │ 🟡 Medium        │  │ 🔴 Hard          │  │ 🟢 Easy          ││
│  │ Backend, Python  │  │ Backend, JWT     │  │ Frontend, React  ││
│  │                  │  │                  │  │                  ││
│  │ ~3 hours         │  │ ~5 hours         │  │ ~2 hours         ││
│  │                  │  │                  │  │                  ││
│  │ [View Details]   │  │ [View Details]   │  │ ✓ Completed      ││
│  └──────────────────┘  └──────────────────┘  └──────────────────┘│
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ GraphQL API      │  │ CI/CD Pipeline   │                     │
│  │                  │  │                  │                     │
│  │ 🟡 Medium        │  │ 🔴 Hard          │                     │
│  │ Backend, Node    │  │ DevOps, Docker   │                     │
│  │                  │  │                  │                     │
│  │ [View Details]   │  │ [View Details]   │                     │
│  └──────────────────┘  └──────────────────┘                     │
└──────────────────────────────────────────────────────────────────┘
```

#### 8. Assessment Detail
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assessments                                           │
│                                                                  │
│  REST API Challenge                          🟡 Medium           │
│  Backend • Python • FastAPI                  ~3 hours            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ## Problem Statement                                       │ │
│  │                                                            │ │
│  │ Build a RESTful API for a task management system that     │ │
│  │ supports user authentication, CRUD operations...          │ │
│  │                                                            │ │
│  │ ## What You Need to Build                                  │ │
│  │ - POST /auth/register                                      │ │
│  │ - POST /auth/login                                         │ │
│  │ - GET/POST/PUT/DELETE /tasks                               │ │
│  │                                                            │ │
│  │ ## Acceptance Criteria                                     │ │
│  │ ✓ User can register and login                              │ │
│  │ ✓ CRUD operations work correctly                           │ │
│  │ ✓ Proper error responses                                   │ │
│  │                                                            │ │
│  │ ## Constraints                                             │ │
│  │ • Use Python 3.11+ with FastAPI                            │ │
│  │ • PostgreSQL for persistence                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Start Assessment →]                                            │
└──────────────────────────────────────────────────────────────────┘
```

#### 9. Submission Form
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Submit: REST API Challenge                                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ⚠️ Submission Requirements                                 │ │
│  │ • Repository must be public                                │ │
│  │ • Code on default branch (main/master)                     │ │
│  │ • Max 40 code files analyzed                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  GitHub Repository URL *                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ https://github.com/johndoe/task-api                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ✓ Repository found • Public • 12 code files                    │
│                                                                  │
│  Explain Your Approach *                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ I implemented the API using FastAPI with SQLAlchemy ORM.   │ │
│  │ For authentication, I used JWT tokens with...              │ │
│  │                                                            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│  Min 100 characters                                              │
│                                                                  │
│  [Submit for Scoring]                                            │
│                                                                  │
│  Note: You can only submit once per assessment.                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 10. Submission Status
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REST API Challenge - Submission                                 │
│                                                                  │
│  Status Timeline                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ✓ Submitted     →    ✓ Queued    →    ⏳ Scoring    →  ○  │ │
│  │  Nov 22, 10:30       10:30            10:31          Done  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ⏳ Analyzing your code... This usually takes 1-2 minutes.       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Submission Details                                         │ │
│  │                                                            │ │
│  │ Repository: github.com/johndoe/task-api                    │ │
│  │ Commit: a1b2c3d                                            │ │
│  │ Files analyzed: 12                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Refresh Status]                                                │
└──────────────────────────────────────────────────────────────────┘
```

#### 11. Submission Result (Evaluated)
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Profile          [User ▼]       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REST API Challenge - Results                    ✓ PASSED        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                         85                                  ││
│  │                        /100                                 ││
│  │                                                             ││
│  │  ████████████████████████████████░░░░░░░░                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Score Breakdown                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Code Correctness    █████████░  9/10   (×25% = 22.5)       │ │
│  │ Code Quality        ████████░░  8/10   (×20% = 16.0)       │ │
│  │ Code Readability    █████████░  9/10   (×15% = 13.5)       │ │
│  │ Code Robustness     ███████░░░  7/10   (×10% = 7.0)        │ │
│  │ Reasoning Clarity   ████████░░  8/10   (×10% = 8.0)        │ │
│  │ Reasoning Depth     ████████░░  8/10   (×10% = 8.0)        │ │
│  │ Reasoning Structure █████████░  9/10   (×10% = 9.0)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  AI Feedback                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Well-structured solution with good error handling.         │ │
│  │ Consider adding more edge case tests and input validation. │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  +25 points awarded                                              │
│                                                                  │
│  [Back to Dashboard]  [View Other Assessments]                   │
└──────────────────────────────────────────────────────────────────┘
```

---

### Admin App Screens

#### 12. Admin Dashboard
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Candidates│ │Submissions│ │Pass Rate │ │  Queue   │            │
│  │  1,247   │ │  3,892   │ │  68.5%   │ │    47    │            │
│  │ +23 today│ │ +89 today│ │ ↑2.1%    │ │4 workers │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
│  Submissions This Week                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │     ╭─────╮                                                │ │
│  │  ╭──╯     ╰──╮      ╭──╮                                   │ │
│  │ ─╯           ╰──────╯  ╰─                                  │ │
│  │ Mon  Tue  Wed  Thu  Fri  Sat  Sun                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Recent Activity                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • John Doe scored 85 on "REST API Challenge"    2 min ago  │ │
│  │ • jane@example.com registered                  15 min ago  │ │
│  │ • Submission #abc123 failed - LLM timeout       1 hour ago │ │
│  │ • Admin created "GraphQL Challenge"             3 hours ago│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Quick Links                                                     │
│  [Create Assessment] [View Failed Jobs] [Export Candidates]      │
└──────────────────────────────────────────────────────────────────┘
```

#### 13. Manage Assessments
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Assessments                        [+ Create New] [🤖 Generate] │
│                                                                  │
│  [All] [Published] [Draft] [Archived]           [Search...]      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Title              │ Status    │ Submissions │ Avg │Actions│ │
│  ├────────────────────┼───────────┼─────────────┼─────┼───────┤ │
│  │ REST API Challenge │ Published │ 234         │ 76  │ ••• │ │
│  │ Auth System        │ Published │ 189         │ 71  │ ••• │ │
│  │ React Dashboard    │ Draft     │ --          │ --  │ ••• │ │
│  │ GraphQL API        │ Published │ 45          │ 82  │ ••• │ │
│  │ Legacy App         │ Archived  │ 567         │ 68  │ ••• │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Showing 1-5 of 12                          [< 1 2 3 >]          │
└──────────────────────────────────────────────────────────────────┘
```

#### 14. Assessment Editor
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assessments                                           │
│                                                                  │
│  Edit: REST API Challenge                      [Save] [Publish]  │
│                                                                  │
│  [Details] [Criteria] [Starter Code] [Rubric] [Preview]          │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Title *                                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ REST API Challenge                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Problem Statement * (Markdown)                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ## Overview                                                │ │
│  │ Build a RESTful API for a task management system...        │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Visibility          Difficulty        Time Limit               │
│  [Published ▼]       [Medium ▼]        [3] hours                │
│                                                                  │
│  Tags                                                            │
│  [Backend] [Python] [FastAPI] [+ Add]                           │
│                                                                  │
│  🤖 Generated by AI  •  Last edited by Admin, Nov 20            │
└──────────────────────────────────────────────────────────────────┘
```

#### 15. Candidate Directory
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Candidates                                    [Export CSV]      │
│                                                                  │
│  Filters: [Score ▼] [Points ▼] [Date ▼]       [Search...]       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Name          │ Email              │ Score │ Points│ Subs  │ │
│  ├───────────────┼────────────────────┼───────┼───────┼───────┤ │
│  │ Alice Chen    │ alice@example.com  │  892  │  145  │   8   │ │
│  │ Bob Smith     │ bob@example.com    │  845  │  120  │   7   │ │
│  │ Carol Johnson │ carol@example.com  │  798  │  110  │   9   │ │
│  │ David Lee     │ david@example.com  │  756  │   95  │   6   │ │
│  │ Eve Wilson    │ eve@example.com    │  723  │   85  │   5   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Showing 1-5 of 1,247                       [< 1 2 3 ... 250 >] │
└──────────────────────────────────────────────────────────────────┘
```

#### 16. Submission Review (Admin)
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Submissions                                           │
│                                                                  │
│  Submission #abc-123                                             │
│                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │ Candidate               │  │ Score Breakdown                ││
│  │ John Doe                │  │                                ││
│  │ john@example.com        │  │ Correctness:  9/10   22.5      ││
│  │ github.com/johndoe      │  │ Quality:      8/10   16.0      ││
│  │                         │  │ Readability:  9/10   13.5      ││
│  │ Assessment              │  │ Robustness:   7/10    7.0      ││
│  │ REST API Challenge      │  │ Clarity:      8/10    8.0      ││
│  │                         │  │ Depth:        8/10    8.0      ││
│  │ Repo: github.com/...    │  │ Structure:    9/10    9.0      ││
│  │ Commit: a1b2c3d         │  │ ─────────────────────────      ││
│  │ Files: 12               │  │ Final Score:  85/100           ││
│  └─────────────────────────┘  └────────────────────────────────┘│
│                                                                  │
│  Admin Actions                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Override Score:  [    ]  /100                              │ │
│  │ Reason: __________________________________________________ │ │
│  │                                                            │ │
│  │ [Apply Override]  [Re-score]  [View Raw Response]          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Admin Notes                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [Add note...]                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

#### 17. Queue Inspector
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Queue Status                                                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Pending    │  │    Active    │  │    Failed    │           │
│  │     47       │  │      4       │  │     12       │           │
│  │              │  │              │  │              │           │
│  │ ████████░░░░ │  │ ████░░░░░░░░ │  │ ██░░░░░░░░░░ │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  Workers: 4 total  •  3 busy  •  1 idle                          │
│  Avg processing time: 65s                                        │
│                                                                  │
│  Failed Jobs                                    [Clear Old]      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Job ID    │ Submission │ Error           │ Time    │Action │ │
│  ├───────────┼────────────┼─────────────────┼─────────┼───────┤ │
│  │ job-123   │ sub-456    │ LLM_TIMEOUT     │ 2h ago  │[Retry]│ │
│  │ job-124   │ sub-457    │ CLONE_FAILED    │ 3h ago  │[Retry]│ │
│  │ job-125   │ sub-458    │ INVALID_JSON    │ 5h ago  │[Retry]│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Scale Workers ▼]                                               │
└──────────────────────────────────────────────────────────────────┘
```

#### 18. Admin Settings
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Settings                                                        │
│                                                                  │
│  [General] [Admins] [API Keys] [Maintenance]                     │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Admin Users                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Name           │ Email                │ Added     │ Action │ │
│  ├────────────────┼──────────────────────┼───────────┼────────┤ │
│  │ Super Admin    │ admin@vibecoding.in  │ (Seed)    │        │ │
│  │ Puneet         │ puneetrinity@gmail.  │ Nov 20    │[Remove]│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [+ Invite Admin]                                                │
│                                                                  │
│  Pending Invites                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ new@example.com      │ Expires Nov 30    │ [Revoke]        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Maintenance Mode                                                │
│  [ ] Enable maintenance mode                                     │
│      Blocks new submissions, shows banner to users               │
└──────────────────────────────────────────────────────────────────┘
```

#### 19. Admin Reports & Analytics
```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Reports & Analytics                          [Export ▼]         │
│                                                                  │
│  [Overview] [Leaderboard] [Assessments] [LLM Usage]              │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Leaderboard                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Rank│ Candidate     │ Vibe Score │ Submissions │ Pass Rate │ │
│  ├─────┼───────────────┼────────────┼─────────────┼───────────┤ │
│  │  1  │ Alice Chen    │    892     │      8      │   100%    │ │
│  │  2  │ Bob Smith     │    845     │      7      │   100%    │ │
│  │  3  │ Carol Johnson │    798     │      9      │    89%    │ │
│  │  4  │ David Lee     │    756     │      6      │   100%    │ │
│  │  5  │ Eve Wilson    │    723     │      5      │    80%    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Assessment Difficulty Analysis                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Assessment          │ Avg Score │ Pass Rate │ Attempts     │ │
│  ├─────────────────────┼───────────┼───────────┼──────────────┤ │
│  │ REST API Challenge  │    76     │    79%    │    234       │ │
│  │ Auth System         │    68     │    62%    │    189       │ │
│  │ GraphQL API         │    82     │    88%    │     45       │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

### Screen Count Summary

| App | Screens | Status |
|-----|---------|--------|
| **Candidate** | 11 | ✅ Complete |
| **Admin** | 8 | ✅ Complete |
| **Total** | 19 | ✅ Complete |

---

## 17. Pre-Implementation Checklist

### What's Already Done (In This Document)

| Item | Status | Location |
|------|--------|----------|
| Architecture decisions | ✅ Complete | Sections 1-10 |
| Database schema (all tables) | ✅ Defined | Scattered in sections (needs consolidation) |
| API endpoints | ✅ Complete | Section 8 |
| Tech stack | ✅ Locked | Summary section |
| Project folder structure | ✅ Defined | Section 15 |
| Testing strategy | ✅ Defined | Section 15 |
| Security checklist | ✅ Complete | Section 11 |
| Email infrastructure | ✅ Complete | Section 12 |
| Evaluation modes | ✅ Future-proofed | Section 13 |
| Operational runbooks | ✅ Complete | Section 14 |
| Seed data (concept) | ✅ Defined | Section 15 |
| UI wireframes | ✅ Complete | Section 16 (19 screens) |

---

## 17a. Sprint 0: Before-Dev Artifacts (Locked Decisions)

These are **blocking items** that must be completed before feature development begins.

### 1. Schema + Migrations

| Artifact | Decision |
|----------|----------|
| `schema.sql` | Consolidated file with all tables in dependency order |
| Alembic baseline | First migration = full schema (not incremental) |
| `make migrate` | `alembic upgrade head` |
| `make migrate-down` | `alembic downgrade -1` (**LOCAL ONLY**) |

**Rule:** `migrate-down` is for local development only. Never run on shared DBs (staging/prod).

### 2. Local Dev Stack (docker-compose.yml)

| Service | Image | Notes |
|---------|-------|-------|
| **postgres** | `postgres:16-alpine` | With `pgcrypto` extension only (no pgvector in MVP) |
| **redis** | `redis:7-alpine` | Standard image |
| **mailpit** | `axllent/mailpit` | Local email testing (catches all outbound emails) |

**GCS Decision:** Use real GCS buckets for dev, not MinIO.

| Environment | GCP Project | Bucket |
|-------------|-------------|--------|
| Development | `vibe-dev` | `vibe-resumes-dev` |
| Production | `vibe-prod` | `vibe-resumes-prod` |

Rationale: Same SDK, same auth flow, negligible cost for low-volume resume uploads.

### 3. Repo Skeleton

Generate **working skeleton** (not just directories) with:

**Backend:**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + /health + CORS
│   ├── config.py            # Settings from env vars
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── health.py    # Health check endpoints
│   ├── models/
│   │   └── __init__.py
│   ├── schemas/
│   │   └── __init__.py
│   ├── services/
│   │   └── __init__.py
│   └── worker/
│       └── __init__.py
├── alembic/
│   ├── versions/
│   └── env.py
├── tests/
│   ├── __init__.py
│   └── test_health.py       # First test: health endpoint
├── pyproject.toml
└── .env.example
```

**Frontend:**
```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts        # API client setup
│   ├── components/
│   │   └── Layout.tsx       # Shell layout with nav placeholder
│   ├── hooks/
│   │   └── index.ts
│   ├── pages/
│   │   ├── Login.tsx        # Placeholder
│   │   └── Dashboard.tsx    # Placeholder
│   ├── context/
│   │   └── AuthContext.tsx  # Placeholder
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── Router.tsx           # React Router setup
│   └── main.tsx
├── tests/
│   └── App.test.tsx         # First test: renders without crash
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── .env.example
```

**Why working skeleton?** Sets conventions for imports, router structure, test patterns. Prevents devs from inventing incompatible patterns.

### 4. Seed Script

```python
# backend/seed.py

def seed_database():
    """
    Creates initial data for development/demo.
    Safe to run multiple times (idempotent).
    """

    # 1. Admin user
    create_user_if_not_exists(
        email="puneetrinity@gmail.com",
        role="admin",
        email_verified=True
    )

    # 2. Test assessments
    create_assessment_if_not_exists(
        title="Hello World API Challenge",
        difficulty="easy",
        status="published",
        visibility="active"
    )

    create_assessment_if_not_exists(
        title="REST API Challenge",
        difficulty="medium",
        status="draft",
        visibility="active"
    )

    # 3. Demo candidate (fully scored) - for showcasing UI
    demo_candidate = create_user_if_not_exists(
        email="demo.candidate@example.com",
        role="candidate",
        email_verified=True
    )
    create_profile(demo_candidate, complete=True)  # GitHub, LinkedIn filled
    create_submission(
        candidate=demo_candidate,
        assessment="Hello World API Challenge",
        status="EVALUATED",
        final_score=82.5,
        with_ai_scores=True
    )

    # 4. Test candidate (clean) - for manual flow testing
    create_user_if_not_exists(
        email="test.candidate@example.com",
        role="candidate",
        email_verified=True
    )
    # No profile, no submissions - ready for end-to-end testing
```

### 5. Environment Files

**backend/.env.example:**
```bash
# Database
DATABASE_URL=postgresql://vibe:vibe@localhost:5432/vibe

# Redis
REDIS_URL=redis://localhost:6379/0

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# GCS
GCS_BUCKET_NAME=vibe-resumes-dev
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# LLM Providers
GROQ_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Email (Brevo)
BREVO_API_KEY=
FROM_EMAIL=noreply@vibecoding.in
FROM_NAME=Vibe Coding

# App
SECRET_KEY=change-me-in-production
ENVIRONMENT=development
DEBUG=true
CORS_ORIGINS=http://localhost:5173
```

**frontend/.env.example:**
```bash
# API
VITE_API_URL=http://localhost:8000/api/v1

# Firebase (client-side)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
```

### 6. CI Pipeline

**.github/workflows/ci.yml:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -e ".[dev]"
      - name: Lint
        run: ruff check .
      - name: Test
        run: pytest -v
        # Coverage threshold added later when codebase stabilizes

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm run test -- --run
      - name: Build
        run: npm run build  # Catches TypeScript errors
```

**CI Rules:**
| Check | Required | Notes |
|-------|----------|-------|
| Backend: `ruff` | ✅ Yes | Lint + style |
| Backend: `pytest` | ✅ Yes | No coverage threshold initially |
| Backend: `mypy` | ❌ Optional | Add later when codebase settles |
| Frontend: `lint` | ✅ Yes | ESLint |
| Frontend: `test` | ✅ Yes | Vitest |
| Frontend: `build` | ✅ Yes | Catches TS errors |

### 7. Makefile

```makefile
# Makefile - Developer convenience commands

.PHONY: dev setup migrate migrate-down seed test lint

# === Setup ===
setup:
	@echo "Setting up development environment..."
	cd backend && pip install -e ".[dev]"
	cd frontend && npm install
	docker compose up -d
	@echo "Run 'make migrate' then 'make seed' to initialize database"

# === Database ===
migrate:
	cd backend && alembic upgrade head

migrate-down:
	@echo "WARNING: Local development only. Never run on shared DBs."
	cd backend && alembic downgrade -1

seed:
	cd backend && python -m app.seed

# === Development ===
dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev-worker:
	cd backend && rq worker vibe-scoring vibe-notifications

# === Testing ===
test:
	cd backend && pytest -v
	cd frontend && npm run test -- --run

test-backend:
	cd backend && pytest -v

test-frontend:
	cd frontend && npm run test -- --run

# === Linting ===
lint:
	cd backend && ruff check .
	cd frontend && npm run lint

lint-fix:
	cd backend && ruff check . --fix
	cd frontend && npm run lint -- --fix
```

### 8. README Quick Start

```markdown
## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 20+

### First Time Setup

1. Clone and install:
   ```bash
   git clone <repo>
   cd vibe
   make setup
   ```

2. Copy environment files:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   # Fill in API keys
   ```

3. Initialize database:
   ```bash
   make migrate
   make seed
   ```

4. Start development servers:
   ```bash
   # Terminal 1: Backend
   make dev-backend

   # Terminal 2: Frontend
   make dev-frontend

   # Terminal 3: Worker (optional)
   make dev-worker
   ```

5. Access:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Mailpit: http://localhost:8025

### First Login
- Admin: puneetrinity@gmail.com (use Firebase Auth)
- Demo candidate: demo.candidate@example.com
- Test candidate: test.candidate@example.com
```

---

## 18. Notifications & Engagement System

### Overview

A production-complete notification system for maximum user engagement across email and in-app channels.

| Channel | Use Case | Technology |
|---------|----------|------------|
| **Email** | Async, important, re-engagement | Brevo API |
| **In-App** | Real-time, active users | Bell icon + notification panel |
| **Toast** | Immediate feedback (same page) | shadcn/ui toast |

---

### Notification Triggers Matrix

#### Admin-Initiated Notifications

| Trigger | Email | In-App | Recipient | Priority |
|---------|-------|--------|-----------|----------|
| New assessment published | ✅ | ✅ | All/Selected candidates | High |
| Assessment invite (invite-only) | ✅ | ✅ | Specific candidate | High |
| Score overridden by admin | ✅ | ✅ | Candidate | Medium |
| Account deactivated | ✅ | ❌ | Candidate | High |
| Custom broadcast message | ✅ | ✅ | Selected candidates | Medium |

#### System-Triggered (Candidate)

| Trigger | Email | In-App | Timing | Priority |
|---------|-------|--------|--------|----------|
| Welcome after registration | ✅ | ❌ | Immediate | High |
| Email verification reminder | ✅ | ❌ | After 24h if unverified | High |
| Submission scored | ✅ | ✅ | Immediate | High |
| Profile incomplete reminder | ✅ | ✅ | After 3 days | Medium |
| Assessment deadline approaching | ✅ | ✅ | 24h before deadline | High |
| Weekly digest (new assessments) | ✅ | ❌ | Weekly (Monday 9am) | Low |

#### System-Triggered (Admin)

| Trigger | Email | In-App | Timing | Priority |
|---------|-------|--------|--------|----------|
| Submission failed (needs retry) | ✅ | ✅ | Immediate | High |
| Queue backlog > 100 jobs | ✅ | ✅ | When threshold crossed | High |
| Worker crashed | ✅ | ✅ | Immediate | Critical |
| Daily admin summary | ✅ | ❌ | Daily 8am | Low |

---

### Schema

#### Notifications Table

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  link            TEXT,                    -- Deep link to relevant page
  metadata        JSONB,                   -- Extra context (assessment_id, submission_id, etc.)
  is_read         BOOLEAN DEFAULT FALSE,
  email_sent      BOOLEAN DEFAULT FALSE,
  email_sent_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
```

#### Notification Preferences Table

```sql
CREATE TABLE notification_preferences (
  user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Global toggles
  email_enabled             BOOLEAN DEFAULT TRUE,
  in_app_enabled            BOOLEAN DEFAULT TRUE,

  -- Candidate preferences
  score_ready_email         BOOLEAN DEFAULT TRUE,
  new_assessment_email      BOOLEAN DEFAULT TRUE,
  profile_reminder_email    BOOLEAN DEFAULT TRUE,
  deadline_reminder_email   BOOLEAN DEFAULT TRUE,
  weekly_digest_email       BOOLEAN DEFAULT FALSE,  -- Opt-in
  marketing_email           BOOLEAN DEFAULT FALSE,  -- Opt-in (legal compliance)

  -- Admin preferences (only for role=admin)
  submission_failed_email   BOOLEAN DEFAULT TRUE,
  queue_alert_email         BOOLEAN DEFAULT TRUE,
  daily_summary_email       BOOLEAN DEFAULT TRUE,

  updated_at                TIMESTAMPTZ DEFAULT now()
);
```

#### Notification Queue Table (for reliability)

```sql
CREATE TABLE notification_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  channel         VARCHAR(20) NOT NULL,    -- 'email', 'in_app'
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
  attempts        INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT,
  scheduled_for   TIMESTAMPTZ DEFAULT now(),  -- For delayed notifications
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_queue_pending ON notification_queue(status, scheduled_for)
  WHERE status = 'pending';
```

---

### Event Type Constants

```python
# notifications/constants.py

class NotificationType:
    # Candidate notifications
    WELCOME = "welcome"
    EMAIL_VERIFICATION_REMINDER = "email_verification_reminder"
    SCORE_READY = "score_ready"
    ASSESSMENT_PUBLISHED = "assessment_published"
    ASSESSMENT_INVITE = "assessment_invite"
    PROFILE_REMINDER = "profile_reminder"
    DEADLINE_APPROACHING = "deadline_approaching"
    WEEKLY_DIGEST = "weekly_digest"
    SCORE_OVERRIDDEN = "score_overridden"
    ACCOUNT_DEACTIVATED = "account_deactivated"

    # Admin notifications
    SUBMISSION_FAILED = "submission_failed"
    QUEUE_BACKLOG = "queue_backlog"
    WORKER_CRASHED = "worker_crashed"
    DAILY_SUMMARY = "daily_summary"

    # Admin broadcast
    CUSTOM_BROADCAST = "custom_broadcast"
```

---

### API Endpoints

#### Candidate Notification APIs

```
# Get notifications (paginated)
GET /api/v1/notifications
  ?page=1
  &limit=20
  &unread_only=false

Response:
{
  "success": true,
  "data": {
    "notifications": [...],
    "unread_count": 3,
    "total": 47,
    "page": 1,
    "pages": 3
  }
}

# Mark single notification as read
PATCH /api/v1/notifications/{id}/read

# Mark all as read
PATCH /api/v1/notifications/read-all

# Get unread count only (for badge)
GET /api/v1/notifications/unread-count
Response: { "count": 3 }

# Get/update notification preferences
GET  /api/v1/notifications/preferences
PUT  /api/v1/notifications/preferences
```

#### Admin Notification APIs

```
# Send broadcast notification
POST /api/v1/admin/notifications/broadcast
{
  "recipients": "all" | "profile_complete" | "attempted_assessment" | "custom",
  "assessment_id": "uuid",           // If recipients = "attempted_assessment"
  "custom_emails": ["a@b.com"],      // If recipients = "custom"
  "channels": ["email", "in_app"],
  "title": "New Assessment Available",
  "message": "Check out our new GraphQL challenge!",
  "link_type": "assessment",
  "link_id": "uuid"
}

Response:
{
  "success": true,
  "data": {
    "notification_id": "uuid",
    "recipients_count": 1247,
    "channels": ["email", "in_app"]
  }
}

# Preview broadcast (dry run)
POST /api/v1/admin/notifications/broadcast/preview
Response: { "recipients_count": 1247, "sample_emails": ["a@...", "b@..."] }

# Get notification analytics
GET /api/v1/admin/notifications/analytics
  ?date_from=2025-11-01
  &date_to=2025-11-30
```

---

### Worker Architecture

#### Worker 1: Scoring Worker (existing)
- Processes submission scoring jobs
- Already defined in Section 6

#### Worker 2: Notification Worker (NEW)
```python
# workers/notification_worker.py

class NotificationWorker:
    """
    Processes notification_queue jobs.
    Sends emails via Brevo API.
    Handles retries with exponential backoff.
    """

    def process_job(self, job):
        notification = get_notification(job.notification_id)
        user = get_user(notification.user_id)
        preferences = get_preferences(user.id)

        # Check preferences
        if job.channel == 'email' and not preferences.email_enabled:
            mark_job_skipped(job)
            return

        if job.channel == 'email':
            self.send_email(notification, user)

        mark_job_sent(job)

    def send_email(self, notification, user):
        template = get_template(notification.type)
        brevo_client.send(
            to=user.email,
            template_id=template.brevo_id,
            params={
                "name": user.name,
                "title": notification.title,
                "message": notification.message,
                "link": notification.link,
                **notification.metadata
            }
        )
```

#### Worker 3: Scheduler Worker (NEW)
```python
# workers/scheduler_worker.py
# Uses APScheduler or similar

SCHEDULED_JOBS = [
    {
        "id": "profile_reminder",
        "cron": "0 9 * * *",  # Daily 9am
        "task": "send_profile_reminders",
        "description": "Remind users with incomplete profiles (3+ days old)"
    },
    {
        "id": "deadline_reminder",
        "cron": "0 10 * * *",  # Daily 10am
        "task": "send_deadline_reminders",
        "description": "Remind users of assessments due in 24h"
    },
    {
        "id": "weekly_digest",
        "cron": "0 9 * * 1",  # Monday 9am
        "task": "send_weekly_digest",
        "description": "Send digest of new assessments to opted-in users"
    },
    {
        "id": "admin_daily_summary",
        "cron": "0 8 * * *",  # Daily 8am
        "task": "send_admin_summary",
        "description": "Send daily stats to admins"
    },
    {
        "id": "queue_monitor",
        "cron": "*/5 * * * *",  # Every 5 min
        "task": "check_queue_backlog",
        "description": "Alert admins if queue > 100 pending"
    },
    {
        "id": "retry_failed_emails",
        "cron": "*/10 * * * *",  # Every 10 min
        "task": "retry_failed_notifications",
        "description": "Retry failed email sends (max 3 attempts)"
    }
]
```

---

### Email Template Library

#### Candidate Templates

| Template ID | Subject | Trigger |
|-------------|---------|---------|
| `welcome` | Welcome to Vibe! | Registration |
| `verify_email_reminder` | Please verify your email | 24h after unverified registration |
| `score_ready` | Your submission has been scored! | Submission evaluated |
| `new_assessment` | New Assessment: {title} | Assessment published |
| `assessment_invite` | You're invited: {title} | Invite-only assessment |
| `profile_reminder` | Complete your profile for +60 points | 3 days after incomplete profile |
| `deadline_approaching` | {title} due in 24 hours | 24h before deadline |
| `weekly_digest` | This week on Vibe: {count} new assessments | Weekly Monday |
| `score_overridden` | Your score has been updated | Admin override |

#### Admin Templates

| Template ID | Subject | Trigger |
|-------------|---------|---------|
| `submission_failed` | Submission Failed: {id} | Clone/score failure |
| `queue_backlog` | Alert: {count} jobs in queue | Backlog > threshold |
| `worker_crashed` | Critical: Worker crashed | Worker failure |
| `daily_summary` | Vibe Daily: {submissions} submissions, {signups} signups | Daily 8am |

#### Template Structure (Brevo)

```html
<!-- Base template -->
<!DOCTYPE html>
<html>
<head>
  <style>
    .container { max-width: 600px; margin: 0 auto; font-family: sans-serif; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .button { background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="logo.png" alt="Vibe" height="40">
    </div>
    <div class="content">
      <h2>{{ title }}</h2>
      <p>Hi {{ name }},</p>
      <p>{{ message }}</p>
      {% if link %}
      <p><a href="{{ link }}" class="button">{{ button_text }}</a></p>
      {% endif %}
    </div>
    <div class="footer">
      <p>You're receiving this because you have an account on Vibe.</p>
      <p><a href="{{ unsubscribe_link }}">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>
```

---

### Throttling & Debounce Rules

```python
# notifications/throttling.py

THROTTLE_RULES = {
    # One per type per user per time window
    NotificationType.PROFILE_REMINDER: {
        "window": timedelta(days=7),      # Max once per week
        "description": "Don't spam profile reminders"
    },
    NotificationType.ASSESSMENT_PUBLISHED: {
        "window": timedelta(hours=1),
        "bundle": True,                    # Bundle multiple into one
        "description": "Bundle assessments published within 1 hour"
    },
    NotificationType.QUEUE_BACKLOG: {
        "window": timedelta(hours=1),
        "description": "Max one queue alert per hour"
    },
    NotificationType.SUBMISSION_FAILED: {
        "window": timedelta(minutes=30),
        "bundle": True,
        "description": "Bundle failures into digest"
    }
}

def should_send(user_id: UUID, notification_type: str) -> bool:
    """Check if we should send this notification based on throttle rules."""
    rule = THROTTLE_RULES.get(notification_type)
    if not rule:
        return True

    last_sent = get_last_notification(user_id, notification_type)
    if last_sent and (now() - last_sent.created_at) < rule["window"]:
        if rule.get("bundle"):
            append_to_bundle(user_id, notification_type)
        return False

    return True
```

---

### Notification Settings UI

#### Candidate Settings (in Profile page)

```
┌──────────────────────────────────────────────────────────────────┐
│  Notification Settings                                           │
│                                                                  │
│  Email Notifications                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [✓] Score ready - when your submission is evaluated        │ │
│  │ [✓] New assessments - when new challenges are available    │ │
│  │ [✓] Deadline reminders - 24h before assessment expires     │ │
│  │ [ ] Weekly digest - summary of new assessments             │ │
│  │ [✓] Profile reminders - tips to complete your profile      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  In-App Notifications                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [✓] Enable in-app notifications                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Save Preferences]                                              │
└──────────────────────────────────────────────────────────────────┘
```

#### Admin Settings (in Settings page)

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin Notifications                                             │
│                                                                  │
│  Alerts                                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [✓] Submission failures - when scoring fails               │ │
│  │ [✓] Queue backlog - when queue exceeds 100 jobs            │ │
│  │ [✓] Worker issues - critical worker errors                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Digests                                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [✓] Daily summary - morning stats email                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Save Preferences]                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

### Admin Broadcast UI

```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO]  Dashboard  Assessments  Candidates  Queue  Settings     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Send Notification                                               │
│                                                                  │
│  Recipients                                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ (●) All active candidates (1,247)                          │ │
│  │ ( ) Candidates with complete profile (892)                 │ │
│  │ ( ) Candidates who attempted: [Select Assessment ▼]        │ │
│  │ ( ) Custom email list                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Channels                                                        │
│  [✓] In-app notification    [✓] Email                           │
│                                                                  │
│  Title *                                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ New Assessment: GraphQL API Challenge                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Message *                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ We just published a new backend challenge! Build a         │ │
│  │ GraphQL API with authentication and real-time updates.     │ │
│  │ Difficulty: Medium • Estimated time: 4 hours               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Link to                                                         │
│  [Assessment ▼] [GraphQL API Challenge ▼]                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Preview: 1,247 recipients will receive this notification   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Preview Email]  [Send Now]                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

### Notification Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOTIFICATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

   EVENT TRIGGERS                    PROCESSING                    DELIVERY
   ─────────────                     ──────────                    ────────

   ┌─────────────┐
   │ API Event   │──┐
   │ (score done)│  │
   └─────────────┘  │
                    │    ┌─────────────────┐    ┌─────────────────┐
   ┌─────────────┐  │    │                 │    │                 │
   │ Admin       │──┼───►│  Notification   │───►│  notification   │
   │ Broadcast   │  │    │  Service        │    │  (DB table)     │
   └─────────────┘  │    │                 │    │                 │
                    │    │ • Check prefs   │    └────────┬────────┘
   ┌─────────────┐  │    │ • Apply throttle│             │
   │ Scheduler   │──┘    │ • Create record │             ▼
   │ (cron jobs) │       │ • Queue job     │    ┌─────────────────┐
   └─────────────┘       └─────────────────┘    │ notification    │
                                                │ _queue          │
                                                │ (pending jobs)  │
                                                └────────┬────────┘
                                                         │
                         ┌───────────────────────────────┴───────────────┐
                         │                                               │
                         ▼                                               ▼
                ┌─────────────────┐                             ┌─────────────────┐
                │ Notification    │                             │ In-App          │
                │ Worker          │                             │ (immediate)     │
                │                 │                             │                 │
                │ • Send via      │                             │ • Already in DB │
                │   Brevo API     │                             │ • Frontend polls│
                │ • Retry on fail │                             │   or websocket  │
                │ • Log status    │                             │                 │
                └────────┬────────┘                             └─────────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Brevo           │
                │ (Email delivery)│
                └─────────────────┘
```

---

### Analytics & Observability (Nice-to-have)

```sql
-- Notification analytics view
CREATE VIEW notification_analytics AS
SELECT
  DATE(created_at) as date,
  type,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE email_sent) as emails_sent,
  COUNT(*) FILTER (WHERE is_read) as read_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_read) / COUNT(*), 2) as read_rate
FROM notifications
GROUP BY DATE(created_at), type;
```

**Metrics to Track:**
- Delivery rate (sent / total)
- Open rate (via Brevo tracking pixel)
- Click rate (via link tracking)
- Time-to-read (for in-app)
- Unsubscribe rate

---

### Email Failure Handling

```python
# notifications/email_sender.py

MAX_RETRIES = 3
RETRY_DELAYS = [60, 300, 900]  # 1min, 5min, 15min

def send_with_retry(notification_id: UUID):
    job = get_queue_job(notification_id)

    try:
        send_email(job)
        mark_sent(job)
    except BrevoRateLimitError:
        schedule_retry(job, delay=60)
    except BrevoAPIError as e:
        job.attempts += 1
        if job.attempts >= MAX_RETRIES:
            mark_failed(job, str(e))
            # Fallback: ensure in-app notification exists
            ensure_in_app_fallback(notification_id)
        else:
            schedule_retry(job, delay=RETRY_DELAYS[job.attempts - 1])
```

---

### Summary: Notification System Checklist

#### Must Have (MVP)

| Component | Status |
|-----------|--------|
| `notifications` table | ✅ Defined |
| `notification_preferences` table | ✅ Defined |
| `notification_queue` table | ✅ Defined |
| Notification API endpoints | ✅ Defined |
| Notification Worker | ✅ Defined |
| Scheduler Worker | ✅ Defined |
| Email template library | ✅ Defined |
| Event type constants | ✅ Defined |
| Throttling rules | ✅ Defined |
| Notification settings UI | ✅ Defined |
| Admin broadcast UI | ✅ Defined |

#### Should Have (Post-MVP)

| Component | Status |
|-----------|--------|
| Email open/click tracking | ⏳ Post-MVP |
| Notification analytics dashboard | ⏳ Post-MVP |
| WebSocket for real-time in-app | ⏳ Post-MVP |
| Push notifications (web) | ⏳ Post-MVP |

---

## 19. Events & Hackathon Model (IMPLEMENTED)

### Overview

The platform supports multi-event hackathons and competitions:
- **India-wide hackathons** (6+ weeks, multiple seasons)
- **Multiple concurrent events** (different companies, different campaigns)
- **Event-specific leaderboards and certificates**

### Implementation Status: COMPLETE (Phase-2)

**Implemented Features:**
- Full `events` table with org-scoping, branding, status lifecycle
- Event registrations (user sign-up tracking)
- Many-to-many event-assessment linking with points multipliers
- Per-event leaderboards with ranking
- Submission caps per user per event (`max_submissions_per_user`)
- Certificate generation support
- Event visibility levels: `public`, `invite_only`, `private`
- Event status: `draft`, `upcoming`, `active`, `ended`, `archived`

**Frontend Routes:**
- `/events` - Event list page with status filtering
- `/events/:idOrSlug` - Event detail with registration, assessments, leaderboard tabs

### Implemented Schema

```sql
-- Events / Campaigns / Hackathons (org-scoped)
CREATE TYPE event_status AS ENUM ('draft', 'upcoming', 'active', 'ended', 'archived');
CREATE TYPE event_visibility AS ENUM ('public', 'invite_only', 'private');

CREATE TABLE events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by                UUID NOT NULL REFERENCES users(id),

  title                     VARCHAR(255) NOT NULL,
  slug                      VARCHAR(100) NOT NULL,
  description               TEXT,
  short_description         VARCHAR(500),

  -- Branding
  banner_url                TEXT,
  logo_url                  TEXT,
  theme_color               VARCHAR(7),  -- Hex color (#RRGGBB)

  status                    event_status NOT NULL DEFAULT 'draft',
  visibility                event_visibility NOT NULL DEFAULT 'public',

  -- Time window
  starts_at                 TIMESTAMPTZ NOT NULL,
  ends_at                   TIMESTAMPTZ NOT NULL,
  registration_opens_at     TIMESTAMPTZ,
  registration_closes_at    TIMESTAMPTZ,

  -- Caps and limits
  max_participants          INT,
  max_submissions_per_user  INT NOT NULL DEFAULT 1,

  -- Rules and info
  rules                     TEXT,
  prizes                    TEXT,
  sponsors                  JSONB,

  -- Certificates
  certificates_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  certificate_template      TEXT,
  min_score_for_certificate INT NOT NULL DEFAULT 0,

  tags                      VARCHAR[] ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, slug)
);

-- Event registrations (user sign-ups)
CREATE TABLE event_registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at         TIMESTAMPTZ DEFAULT now(),
  certificate_issued    BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_issued_at TIMESTAMPTZ,
  certificate_url       TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, user_id)
);

-- Event-assessment links (many-to-many)
CREATE TABLE event_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assessment_id     UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  display_order     INT NOT NULL DEFAULT 0,
  points_multiplier FLOAT NOT NULL DEFAULT 1.0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, assessment_id)
);

-- Submissions can optionally link to events
ALTER TABLE submissions ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;
CREATE INDEX idx_submissions_event ON submissions(event_id);
```

### Submission Attempts Rule (Architecture Decision)

**Decision: Global one-attempt per assessment (not per-event)**

The unique constraint on submissions is:
```sql
UNIQUE(organization_id, candidate_id, assessment_id)
```

This means:
- A user can submit to each assessment **exactly once** within an org
- If the same assessment is linked to multiple events, the user's single submission applies to all
- The `event_id` on submission is **optional context**, not part of the uniqueness constraint

**Rationale:**
1. **Prevents gaming**: Users can't farm points by resubmitting to the same assessment through different events
2. **Simpler scoring**: One submission = one score, no confusion about which attempt counts
3. **Assessment integrity**: The assessment measures skill at a point in time, not iterative improvement

**Event-level caps (`max_submissions_per_user`):**
- Controls total number of submissions a user can make **within an event** (across all assessments)
- Enforced at API level when `event_id` is provided in submission create request
- Independent of the global one-attempt-per-assessment rule

**Leaderboard scoring with `points_multiplier`:**
- Each event-assessment link has a `points_multiplier` (default 1.0)
- Leaderboard calculates: `SUM(submission.final_score * event_assessment.points_multiplier)` per user
- This allows events to weight certain assessments higher (e.g., finals worth 2x qualifying rounds)
- The multiplier affects **leaderboard ranking only**, not the stored `final_score` on submissions

**Alternative considered (rejected):**
Per-event attempts would require `UNIQUE(organization_id, candidate_id, assessment_id, event_id)` but this:
- Complicates leaderboard calculation (which submission counts?)
- Enables point farming across events
- Requires complex "best attempt" selection logic

### Visibility Rules

| Visibility | Who can see in list | Who can view detail | Who can register |
|------------|---------------------|---------------------|------------------|
| `public` | Everyone in org | Everyone | Everyone |
| `invite_only` | Everyone in org | Everyone | Only invited users |
| `private` | Admins only | Admins only | Admins can add |

**Invite-only enforcement:** Registration checks for a valid (non-revoked) row in `event_invites` matching the user's email; on successful registration the invite is marked accepted.

---

## 20. B2B Hiring Platform (Phase-2 Scope)

### Overview

Post-MVP, the platform can serve as a B2B interview/hiring assessment tool.

**Explicitly marked as Phase-2 to prevent MVP gold-plating.**

### Phase-2 Features (Not in MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Organizations | Company accounts with their own admins | High |
| Org-private assessments | Assessments visible only to org's candidates | High |
| Candidate invites by org | "Send this candidate a private test link" | High |
| Multi-round scoring | MCQ + Coding + System Design rounds | Medium |
| Per-interviewer scores | Multiple interviewers score same submission | Medium |
| Hiring pipeline integration | Export to ATS, Greenhouse, Lever webhooks | Low |

### Reserved Schema (Phase-2)

```sql
-- Organizations (companies using platform for hiring)
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  logo_url        TEXT,
  plan            VARCHAR(50) DEFAULT 'free',  -- 'free', 'pro', 'enterprise'
  settings        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Org members (company admins/recruiters)
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member'
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, user_id)
);

-- Org-specific candidate invites
CREATE TABLE org_candidate_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES assessments(id),
  candidate_email VARCHAR(255) NOT NULL,
  invite_token    VARCHAR(100) UNIQUE NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Decision:** Not implementing in MVP. Document only.

---

## 21. Vibe Score Lifecycle & Recalculation

### Score Calculation Formula (Recap)

```
Vibe Score = Sum(Assessment Scores) + Profile Points + Consistency Bonus

Profile Points (max 60):
  +10 GitHub URL
  +10 LinkedIn URL
  +15 Resume uploaded
  +25 Complete profile (name + mobile)

Consistency Bonus:
  +4 for each assessment score ≥ 70
  +5 additional for each assessment score ≥ 85
```

### When Recalculation is Needed

| Event | Action |
|-------|--------|
| Submission scored | Auto-update Vibe Score |
| Admin overrides score | Auto-update Vibe Score |
| Assessment deleted/archived | Recalculate affected users |
| Rubric weights changed | Optional bulk recalculate |
| Profile field added/removed | Auto-update Vibe Score |
| Bug fix in calculation | Admin triggers bulk recalculate |

### Recalculation Function

```python
# services/vibe_score.py

def recalculate_vibe_score(user_id: UUID) -> int:
    """
    Recalculates Vibe Score for a user from scratch.
    Called after score changes, overrides, or profile updates.
    """
    user = get_user(user_id)
    profile = get_candidate_profile(user_id)

    # 1. Sum of assessment scores
    submissions = get_evaluated_submissions(user_id)
    assessment_total = sum(
        s.admin_override_score or s.final_score
        for s in submissions
        if s.status == 'EVALUATED'
    )

    # 2. Profile points (from points_log, already one-time)
    profile_points = get_total_points(user_id)

    # 3. Consistency bonus
    consistency_bonus = 0
    for s in submissions:
        score = s.admin_override_score or s.final_score
        if score and score >= 70:
            consistency_bonus += 4
        if score and score >= 85:
            consistency_bonus += 5  # Stacks with above

    # 4. Total
    vibe_score = int(assessment_total + profile_points + consistency_bonus)

    # 5. Update profile
    update_candidate_profile(user_id, vibe_score=vibe_score)

    # 6. Log activity
    log_activity(
        type='vibe_score_recalculated',
        actor_id=None,  # System
        target_type='candidate',
        target_id=user_id,
        message=f'Vibe Score recalculated: {vibe_score}',
        metadata={'old_score': profile.vibe_score, 'new_score': vibe_score}
    )

    return vibe_score


def bulk_recalculate_all():
    """
    Background job to recalculate all users' Vibe Scores.
    Use sparingly - can be slow for large user bases.
    """
    users = get_all_candidates()
    for user in users:
        recalculate_vibe_score(user.id)
```

### Admin UI

```
┌────────────────────────────────────────────────────────────────┐
│  Candidate: Alice Chen                                         │
│                                                                │
│  Vibe Score: 892                                               │
│                                                                │
│  Score Breakdown:                                              │
│  ├─ Assessment scores: 750                                     │
│  ├─ Profile points: 60                                         │
│  └─ Consistency bonus: 82                                      │
│                                                                │
│  [Recalculate Score]  (Last calculated: Nov 26, 2025 10:30am) │
└────────────────────────────────────────────────────────────────┘
```

### Admin Bulk Action

```
Settings > System > Maintenance

[Recalculate All Vibe Scores]
⚠️ This will recalculate scores for all 1,247 candidates.
   Estimated time: ~2 minutes.
   Use only if calculation logic has changed.

[Start Bulk Recalculation]
```

---

## 22. Timezone & Deadline Handling

### Core Principle

| Layer | Timezone |
|-------|----------|
| **Database** | UTC always |
| **Backend** | UTC always |
| **API responses** | UTC (ISO 8601 format) |
| **Frontend display** | User's browser timezone |
| **Scheduler jobs** | UTC |

### Implementation Rules

```python
# All timestamps stored as TIMESTAMPTZ (UTC)
# All comparisons done in UTC
# Frontend converts for display

# Example: Deadline check
def is_deadline_approaching(assessment_id: UUID) -> bool:
    assessment = get_assessment(assessment_id)
    if not assessment.deadline:
        return False

    now_utc = datetime.now(timezone.utc)
    deadline_utc = assessment.deadline  # Already UTC in DB

    hours_remaining = (deadline_utc - now_utc).total_seconds() / 3600
    return 0 < hours_remaining <= 24
```

### API Response Format

```json
{
  "assessment": {
    "title": "REST API Challenge",
    "deadline": "2025-12-01T23:59:59Z",  // Always UTC, ISO 8601
    "time_limit_days": 7
  }
}
```

### Frontend Display

```typescript
// utils/date.ts
import { formatDistanceToNow, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export function formatDeadline(utcDate: string): string {
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(utcDate), userTz, 'MMM d, yyyy h:mm a zzz');
}

// Display: "Dec 1, 2025 6:59 PM IST"
```

### Scheduler Considerations

```python
# Scheduler runs in UTC
# "Daily 9am" means 9am UTC = 2:30pm IST

SCHEDULED_JOBS = [
    {
        "id": "deadline_reminder",
        "cron": "0 4 * * *",  # 4am UTC = 9:30am IST
        "task": "send_deadline_reminders",
    },
]
```

### Deadline Display in UI

```
┌────────────────────────────────────────────────────────────────┐
│  REST API Challenge                                            │
│                                                                │
│  Deadline: Dec 1, 2025 11:59 PM (IST)                         │
│            ⏰ 2 days, 14 hours remaining                       │
│                                                                │
│  [Start Assessment]                                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 23. pgvector Decision

### Decision: Defer pgvector to Post-MVP

| Option | Decision |
|--------|----------|
| Enable extension in Phase-1 | ❌ No |
| Add vector columns | ❌ No |
| Implement semantic search | ❌ No |

### Rationale

1. MVP doesn't use semantic search
2. Adds complexity to migrations
3. Increases DB resource usage
4. Can be added later without breaking changes

### Future Use Cases (Post-MVP)

| Feature | Description |
|---------|-------------|
| Similar candidates | "Find candidates like Alice" |
| Assessment recommendations | "You might like these challenges" |
| Semantic code search | Search submissions by concept, not keyword |
| Resume matching | Match candidates to job descriptions |

### When to Add

Add pgvector when implementing any of:
- Candidate similarity search
- Assessment recommendation engine
- AI-powered candidate matching

### Migration Path

```sql
-- Phase-2: When needed
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE candidate_profiles
  ADD COLUMN resume_embedding vector(1536);

ALTER TABLE assessments
  ADD COLUMN description_embedding vector(1536);

CREATE INDEX idx_candidate_resume_embedding
  ON candidate_profiles USING ivfflat (resume_embedding vector_cosine_ops);
```

---

## 24. Logging & Observability

### Logging Format

**All backend logs are JSON, one line per request/job.**

```python
# logging_config.py
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)
```

### Log Fields

| Field | Description | Required |
|-------|-------------|----------|
| `timestamp` | ISO 8601 UTC | Yes |
| `level` | info/warn/error | Yes |
| `request_id` | UUID per request | Yes |
| `user_id` | Authenticated user | If available |
| `path` | API endpoint | For API logs |
| `method` | HTTP method | For API logs |
| `status_code` | Response code | For API logs |
| `duration_ms` | Request duration | For API logs |
| `job_id` | Worker job ID | For worker logs |
| `error_code` | App error code | For errors |
| `error_message` | Human message | For errors |

### Example Logs

**API Request:**
```json
{
  "timestamp": "2025-11-26T10:30:00Z",
  "level": "info",
  "request_id": "req_abc123",
  "user_id": "user_xyz",
  "path": "/api/v1/submissions",
  "method": "POST",
  "status_code": 201,
  "duration_ms": 145
}
```

**Worker Job:**
```json
{
  "timestamp": "2025-11-26T10:30:05Z",
  "level": "info",
  "request_id": "req_abc123",
  "job_id": "job_def456",
  "event": "scoring_started",
  "submission_id": "sub_ghi789"
}
```

**Error:**
```json
{
  "timestamp": "2025-11-26T10:30:10Z",
  "level": "error",
  "request_id": "req_abc123",
  "job_id": "job_def456",
  "error_code": "LLM_TIMEOUT",
  "error_message": "Groq API timeout after 20s",
  "submission_id": "sub_ghi789"
}
```

### Request ID Propagation

```python
# middleware/request_id.py
import uuid
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar('request_id', default='')

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
    request_id_var.set(request_id)

    response = await call_next(request)
    response.headers['X-Request-ID'] = request_id
    return response
```

### Error Codes

```python
# errors/codes.py

class ErrorCode:
    # Auth
    AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    AUTH_FORBIDDEN = "AUTH_FORBIDDEN"

    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_GITHUB_URL = "INVALID_GITHUB_URL"
    REPO_NOT_PUBLIC = "REPO_NOT_PUBLIC"
    REPO_TOO_LARGE = "REPO_TOO_LARGE"

    # Submission
    ALREADY_SUBMITTED = "ALREADY_SUBMITTED"
    ASSESSMENT_NOT_FOUND = "ASSESSMENT_NOT_FOUND"

    # Scoring
    CLONE_FAILED = "CLONE_FAILED"
    CLONE_TIMEOUT = "CLONE_TIMEOUT"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE"
    LLM_RATE_LIMITED = "LLM_RATE_LIMITED"

    # System
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
```

### Observability Stack

| Tool | Purpose | Priority |
|------|---------|----------|
| **Sentry** | Error tracking, stack traces | MVP |
| **Railway Logs** | Log aggregation (built-in) | MVP |
| **Uptime monitoring** | Health checks (UptimeRobot/similar) | MVP |
| **Datadog/Grafana** | Metrics, dashboards | Post-MVP |

---

## 25. Rate Limiting (Concrete Values)

### Rate Limits by Endpoint

| Endpoint Category | Limit | Window | Scope |
|-------------------|-------|--------|-------|
| **Default (all endpoints)** | 60 | 1 minute | Per user |
| **Auth endpoints** | 10 | 1 minute | Per IP |
| **Submission create** | 5 | 1 hour | Per user |
| **Profile update** | 20 | 1 minute | Per user |
| **File upload** | 5 | 1 minute | Per user |
| **Admin broadcast** | 10 | 1 hour | Per admin |
| **Assessment generate (AI)** | 10 | 1 hour | Per admin |
| **Public endpoints** | 30 | 1 minute | Per IP |

### Implementation

```python
# middleware/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
    storage_uri=settings.REDIS_URL
)

# Route-specific limits
@app.post("/api/v1/submissions")
@limiter.limit("5/hour", key_func=get_user_id)
async def create_submission(...):
    ...

@app.post("/api/v1/auth/login")
@limiter.limit("10/minute")
async def login(...):
    ...
```

### 429 Response Format

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again in 45 seconds.",
    "retry_after": 45
  }
}
```

### Frontend UX

```typescript
// api/client.ts
async function handleResponse(response: Response) {
  if (response.status === 429) {
    const data = await response.json();
    toast.error(`Slow down! Try again in ${data.error.retry_after} seconds.`);
    throw new RateLimitError(data.error.retry_after);
  }
  // ...
}
```

### Rate Limit Headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1732619400
```

---

## 26. Definition of Done (Per Epic)

### Epic 1: Authentication & User Management

**Done =**
- [ ] Firebase Auth integration working (email + Google)
- [ ] JWT validation middleware on all protected routes
- [ ] User registration creates DB record
- [ ] Email verification flow working
- [ ] Forgot password flow working
- [ ] Admin invite flow working
- [ ] Role-based access control (candidate vs admin)
- [ ] Unit tests: auth service (80% coverage)
- [ ] API tests: all auth endpoints
- [ ] E2E test: "User registers → verifies email → logs in"

### Epic 2: Candidate Profile & Points

**Done =**
- [ ] Profile CRUD endpoints working
- [ ] GitHub URL validation (API check)
- [ ] LinkedIn URL format validation
- [ ] Resume upload to GCS
- [ ] Points awarded on profile completion (one-time)
- [ ] Vibe Score calculation working
- [ ] Profile completion percentage displayed
- [ ] Unit tests: points service, score calculation
- [ ] API tests: profile endpoints
- [ ] E2E test: "User completes profile → sees updated score"

### Epic 3: Assessments

**Done =**
- [ ] Assessment CRUD (admin only)
- [ ] Markdown rendering in problem statement
- [ ] Visibility modes working (active, invite-only, public)
- [ ] Tags/filtering working
- [ ] Rubric weight validation (sum = 100)
- [ ] AI assessment generation (Claude) working
- [ ] Draft → Published workflow
- [ ] Unit tests: assessment service
- [ ] API tests: all assessment endpoints
- [ ] E2E test: "Admin creates assessment → candidate sees it"

### Epic 4: Submissions & Scoring

**Done =**
- [ ] Submission creation with GitHub URL validation
- [ ] Pre-submission validation (repo exists, public, has code)
- [ ] One submission per assessment enforced
- [ ] Worker processes submission queue
- [ ] GitHub repo cloning working
- [ ] File filtering and limits enforced
- [ ] LLM scoring with Groq working
- [ ] Score normalization with weights
- [ ] Retry logic for failures
- [ ] Status updates visible to candidate
- [ ] Unit tests: submission service, scoring service
- [ ] API tests: submission endpoints
- [ ] E2E test: "Candidate submits → worker scores → result visible"

### Epic 5: Admin Dashboard

**Done =**
- [ ] Dashboard stats (candidates, submissions, pass rate, queue)
- [ ] Activity feed working
- [ ] Candidate directory with search/filter
- [ ] Submission review with score breakdown
- [ ] Score override functionality
- [ ] Queue inspector with retry
- [ ] Admin settings (config, maintenance mode)
- [ ] Reports/analytics page
- [ ] CSV export working
- [ ] Unit tests: admin service
- [ ] API tests: all admin endpoints
- [ ] E2E test: "Admin views submission → overrides score"

### Epic 6: Notifications

**Done =**
- [ ] Notification creation on events
- [ ] In-app notification bell + panel
- [ ] Mark as read functionality
- [ ] Email sending via Brevo working
- [ ] Notification preferences respected
- [ ] Admin broadcast working
- [ ] Scheduler worker running cron jobs
- [ ] Throttling rules enforced
- [ ] Unit tests: notification service
- [ ] API tests: notification endpoints
- [ ] E2E test: "Score ready → candidate sees notification + email"

---

## 27. QA Test Matrix

### Candidate Flows

#### Happy Path

| Test Case | Steps | Expected |
|-----------|-------|----------|
| Registration | Enter email/password → Submit | Account created, verification email sent |
| Email verification | Click link in email | Account verified, redirected to dashboard |
| Google login | Click "Continue with Google" | Account created/logged in |
| Complete profile | Add name, mobile, GitHub, LinkedIn, resume | All fields saved, points awarded, score updated |
| Browse assessments | Navigate to assessments page | See list of active assessments |
| View assessment | Click on assessment card | See full problem statement |
| Submit solution | Enter GitHub URL, explanation → Submit | Submission created, status shows "Queued" |
| View results | Check submission after scoring | See score breakdown, AI feedback |

#### Edge Cases

| Test Case | Steps | Expected |
|-----------|-------|----------|
| Invalid GitHub URL | Submit `github.com/invalid/repo` | Error: "Repository not found" |
| Private repo | Submit private repo URL | Error: "Repository must be public" |
| Huge repo | Submit repo > 100MB | Error: "Repository too large" |
| No code files | Submit repo with only docs | Error: "No supported code files found" |
| Double submission | Submit same assessment twice | Error: "Already submitted" |
| Expired session | Make request with expired token | 401, redirect to login |
| Rate limited | Make 61 requests in 1 minute | 429, "Too many requests" message |

### Admin Flows

#### Happy Path

| Test Case | Steps | Expected |
|-----------|-------|----------|
| Admin login | Login with admin account | See admin dashboard |
| View stats | Load dashboard | See candidate count, submission count, etc. |
| Create assessment | Fill form → Save as draft | Assessment saved, visible in list |
| AI generate assessment | Enter topic → Generate | AI draft created, editable |
| Publish assessment | Click Publish on draft | Status = published, visible to candidates |
| View candidate | Click candidate in directory | See profile, submissions, score |
| Override score | Enter new score + reason → Save | Score updated, candidate notified |
| Retry failed job | Click Retry on failed submission | Job re-queued, status updated |
| Send broadcast | Select recipients → Send | Notifications created, emails queued |

#### Edge Cases

| Test Case | Steps | Expected |
|-----------|-------|----------|
| Candidate accesses admin | Try to access /admin/* | 403 Forbidden |
| Weights don't sum to 100 | Set weights totaling 90 | Error: "Weights must sum to 100" |
| Delete assessment with submissions | Try to delete | Error or soft-delete with warning |
| Bulk recalculate | Trigger recalculate all | Background job runs, scores updated |

### Infrastructure Flows

| Test Case | Steps | Expected |
|-----------|-------|----------|
| Worker crash recovery | Kill worker process | Job stays in queue, new worker picks up |
| LLM timeout | Groq takes > 20s | Retry once, then mark failed |
| Redis down | Stop Redis | Submissions fail gracefully, error logged |
| DB connection lost | Kill DB connection | 503, auto-reconnect on recovery |
| Maintenance mode | Enable in settings | Candidates see maintenance page, queue continues |

### Security Tests

| Test Case | Steps | Expected |
|-----------|-------|----------|
| SQL injection | Submit `'; DROP TABLE users;--` | Input sanitized, no DB impact |
| XSS in explanation | Submit `<script>alert('xss')</script>` | Escaped in display |
| IDOR - view other's submission | Change submission ID in URL | 403 or 404 |
| Brute force login | 20 login attempts | Account locked after 5 failures |
| Invalid JWT | Send request with tampered token | 401 Unauthorized |

---

## 28. Product/UX Decisions (Locked)

### 28.1 Account Deletion & Data Export

| Item | Decision |
|------|----------|
| **Delete my account** | Soft delete only (`deleted_at` timestamp) |
| **PII handling** | Anonymize: `email = NULL`, `name = NULL` |
| **Submissions on delete** | Keep (anonymized) - scores preserved for analytics |
| **Data export** | Not in MVP (Phase-2 feature) |

**Soft Delete Flow:**
```python
def soft_delete_user(user_id: UUID):
    # 1. Set deletion timestamp
    user.deleted_at = datetime.now(timezone.utc)

    # 2. Anonymize PII
    user.email = f"deleted+{user.id}@anonymized.local"

    # 3. Anonymize profile
    if profile := get_profile(user_id):
        profile.name = None
        profile.mobile = None
        profile.github_url = None
        profile.linkedin_url = None
        # Keep: vibe_score, total_points (for analytics)

    # 4. Delete resume from GCS
    if profile.resume_file_path:
        delete_from_gcs(profile.resume_file_path)
        profile.resume_file_path = None

    # 5. Keep submissions, ai_scores, points_log
    # (candidate_id still links, but user is anonymized)
```

**Why keep scores?**
- Difficulty calibration
- Pass/fail rate analytics
- Challenge quality metrics
- Historical leaderboard integrity

### 28.2 Admin & Assessment Deletion Semantics

| Entity | Action | Decision |
|--------|--------|----------|
| Assessment **with** submissions | Delete | ❌ Archive only (`status = 'archived'`) |
| Assessment **without** submissions | Delete | ✅ Hard delete allowed |
| Candidate deactivated | Can log in? | ❌ No (blocked at auth layer) |
| Candidate deactivated | Can reactivate? | ✅ Yes (admin action) |

**Archive behavior:**
- Hidden from candidates
- Visible to admins only
- All submissions still visible in admin analytics
- Status badge: "Archived"

**UI Confirmation Modal:**
```
┌────────────────────────────────────────────────────────────┐
│  Archive Assessment?                                       │
│                                                            │
│  "REST API Challenge" has 50 submissions.                  │
│                                                            │
│  It will be archived instead of deleted.                   │
│  Candidates will no longer see this assessment.            │
│  All submissions and scores will be preserved.             │
│                                                            │
│  [Cancel]  [Archive Assessment]                            │
└────────────────────────────────────────────────────────────┘
```

### 28.3 Soft Delete vs Hard Delete (By Table)

| Table | Delete Type | Notes |
|-------|-------------|-------|
| `users` | Soft delete | Add `deleted_at TIMESTAMPTZ` |
| `candidate_profiles` | Soft delete | Follows user deletion |
| `assessments` | Soft delete | Via `status = 'archived'` |
| `submissions` | **Never delete** | Immutable audit trail |
| `ai_scores` | **Never delete** | Linked to submissions |
| `points_log` | **Never delete** | Scoring audit trail |
| `admin_audit_log` | **Never delete** | Compliance requirement |
| `notifications` | Hard delete | Auto-purge after 90 days |
| `notification_queue` | Hard delete | After processing |

**Schema additions needed:**
```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE candidate_profiles ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NOT NULL;
```

**Backend enforcement:**
When `deleted_at IS NOT NULL`:
- Block login (return 401)
- Block new submissions
- Block profile updates
- Block notification fetching

### 28.4 Empty States & Error UX Copy

| Screen | Copy |
|--------|------|
| **Assessments (candidate)** | "No assessments available yet. Check back soon!" |
| **Assessments (admin)** | "No assessments created yet." [Create Assessment] |
| **Submissions (candidate)** | "You haven't submitted any solutions yet. Browse assessments to get started." |
| **Submissions (admin)** | "No submissions yet." |
| **Notifications** | "You're all caught up!" |
| **Candidates (admin)** | "No candidates registered yet." |
| **Queue empty** | "Queue is empty. All caught up!" |

**Error States:**

| Error | User-Facing Copy |
|-------|------------------|
| **Scoring failed** | "We encountered an issue scoring your submission. Our team has been notified and will retry shortly. You'll receive an email when your results are ready." |
| **Clone failed** | "We couldn't access your repository. Please make sure it's public and the URL is correct." |
| **Rate limited** | "Slow down! Please wait {seconds} seconds before trying again." |
| **Maintenance mode** | "We're currently performing maintenance. Please check back in a few minutes." |
| **Repo not found** | "Repository not found. Please check the URL and try again." |
| **Repo private** | "This repository is private. Please make it public to submit." |
| **Repo too large** | "Repository exceeds 100MB limit. Please reduce the size and try again." |
| **No code files** | "No supported code files found in this repository." |

**Location:** Add `/docs/COPY.md` for central reference.

### 28.5 Email Branding (Locked)

| Setting | Value |
|---------|-------|
| **From Name** | Vibe Coding |
| **From Email** | `no-reply@vibecoding.in` |
| **Reply-To** | `support@vibecoding.in` |
| **Support Email** | `support@vibecoding.in` |

**Email Subjects:**

| Template | Subject |
|----------|---------|
| Welcome | "Welcome to Vibe Coding!" |
| Email verification | "Verify your email for Vibe Coding" |
| Score ready | "Your submission for {assessment} has been scored!" |
| Score failed | "Update on your {assessment} submission" |
| New assessment | "New Challenge: {title}" |
| Assessment invite | "You're invited: {title}" |
| Profile reminder | "Complete your profile for +60 points" |
| Deadline approaching | "{assessment} due in 24 hours" |
| Weekly digest | "This week on Vibe: {count} new challenges" |
| Admin: submission failed | "[Vibe Admin] Submission failed: {id}" |
| Admin: queue backlog | "[Vibe Admin] Queue backlog: {count} jobs" |
| Admin: daily summary | "[Vibe Admin] Daily Summary: {date}" |

### 28.6 Files to Create

| File | Purpose | Status |
|------|---------|--------|
| `/docs/COPY.md` | Central UX copy reference | ❌ Generate |
| Schema: `deleted_at` columns | Soft delete support | ❌ Add to schema.sql |

---

## 29. Technical Gotchas (Locked Decisions)

### 29.1 GitHub API & Rate Limiting

**Authentication:**
| Setting | Value |
|---------|-------|
| Token type | Fine-grained PAT |
| Permissions | `public_repo:read` only |
| Rate limit | 5,000 requests/hour (authenticated) |
| Alert threshold | Notify admin when remaining < 500 |

**Rate Limit Handling:**

| Scenario | Action |
|----------|--------|
| Rate limited (403/429) | Requeue job with 5-15 min delay |
| Still rate limited after 3 attempts | Mark `FAILED`, notify admin |
| Repo not found / private / bad URL | Fail immediately with UX message |

**Implementation:**
```python
# services/github.py

async def clone_repo(url: str, submission_id: UUID):
    try:
        response = await github_client.get_repo_info(url)
        remaining = int(response.headers.get('X-RateLimit-Remaining', 0))

        # Log remaining quota
        logger.info("github_api_call",
            remaining=remaining,
            submission_id=submission_id
        )

        # Alert if low
        if remaining < 500:
            await notify_admins(
                type="GITHUB_RATE_LOW",
                message=f"GitHub rate limit low: {remaining} remaining"
            )

    except GitHubRateLimitError as e:
        # Requeue with delay
        logger.warning("github_rate_limited",
            submission_id=submission_id,
            reset_at=e.reset_time
        )

        if submission.retry_count >= 3:
            await mark_submission_failed(
                submission_id,
                error="GITHUB_RATE_LIMIT",
                message="GitHub rate limit exhausted after retries"
            )
            await notify_admins(type="GITHUB_RATE_EXHAUSTED")
        else:
            await requeue_with_delay(submission_id, delay_minutes=10)

    except GitHubRepoNotFoundError:
        # Fail immediately - user error
        await mark_submission_failed(
            submission_id,
            error="REPO_NOT_FOUND",
            message="Repository not found"
        )

    except GitHubRepoPrivateError:
        # Fail immediately - user error
        await mark_submission_failed(
            submission_id,
            error="REPO_PRIVATE",
            message="Repository is private"
        )
```

### 29.2 Worker Architecture (MVP)

**Decision:** Single worker process handling both queues.

**Configuration:**
```python
# workers/main.py
from rq import Worker
from redis import Redis

redis_conn = Redis.from_url(settings.REDIS_URL)

# Queue priority: scoring first, then notifications
queues = ['vibe-scoring', 'vibe-notifications']

if __name__ == '__main__':
    Worker(queues, connection=redis_conn).work()
```

**Railway Services:**
| Service | Role |
|---------|------|
| `vibe-api` | FastAPI application |
| `vibe-worker` | RQ worker (both queues) |

**Scaling Strategy:**
1. **Initial:** Single worker instance
2. **If queue backs up:** Increase worker instances (Railway scaling)
3. **If queues have different SLAs:** Split into separate services:
   - `vibe-worker-scorer` → `['vibe-scoring']`
   - `vibe-worker-notify` → `['vibe-notifications']`

**Queue Priority:**
- `vibe-scoring` drained first (higher priority)
- `vibe-notifications` processed after scoring queue empty

### 29.3 Health Checks

**Endpoints:**
```python
@router.get("/health")
async def health():
    """Basic liveness check for Railway."""
    return {"status": "ok"}

@router.get("/health/db")
async def health_db(db: Session = Depends(get_db)):
    """Database connectivity check."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        raise HTTPException(503, {"status": "error", "db": str(e)})

@router.get("/health/redis")
async def health_redis():
    """Redis connectivity check."""
    try:
        redis_client.ping()
        return {"status": "ok", "redis": "connected"}
    except Exception as e:
        raise HTTPException(503, {"status": "error", "redis": str(e)})

@router.get("/health/ready")
async def health_ready(db: Session = Depends(get_db)):
    """Full readiness check - all dependencies."""
    errors = []

    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        errors.append({"db": str(e)})

    try:
        redis_client.ping()
    except Exception as e:
        errors.append({"redis": str(e)})

    if errors:
        raise HTTPException(503, {"status": "error", "errors": errors})

    return {"status": "ok", "db": "connected", "redis": "connected"}
```

**Monitoring Setup:**
| Tool | Endpoint | Frequency |
|------|----------|-----------|
| Railway (auto) | `/health` | Continuous |
| UptimeRobot | `/health/db` | Every 5 min |
| UptimeRobot | `/health/redis` | Every 5 min |

**Future (Post-MVP):**
- Better Stack / Better Uptime for richer alerts
- Prometheus + Grafana for metrics dashboards

### 29.4 MVP Notification Scope

**MVP Notifications (5 types):**

| # | Notification | Channel | Trigger |
|---|--------------|---------|---------|
| 1 | Welcome | Email | On registration |
| 2 | Score ready | Email + In-app | Submission evaluated |
| 3 | Score failed | Email + In-app | Admin only, after all retries exhausted |
| 4 | New assessment | In-app only | Assessment published |
| 5 | Deadline approaching | Email + In-app | 24h before assessment deadline |

**Post-MVP Notifications:**
- Profile reminder (3 days after incomplete)
- Weekly digest (Monday mornings)
- Assessment invite (invite-only assessments)

**Score Failed - Timing:**
- Fire only after **final failure** (all retries exhausted)
- Not on transient LLM/GitHub issues during retry cycle

**Candidate-facing message for failed scoring:**
```
"We encountered an issue scoring your submission. Our team has been
notified and will retry shortly. You'll receive an email when your
results are ready."
```

If permanently failed after admin review:
```
"Unfortunately, we were unable to score your submission. Please
contact support@vibecoding.in for assistance."
```

---

## 30. Security & Compliance Decisions (Locked)

### 30.1 PII in Logs

| Environment | Email in logs | User ID in logs | Notes |
|-------------|---------------|-----------------|-------|
| **Development** | ✅ Allowed | ✅ Always | Full debugging |
| **Production** | ❌ Never | ✅ Always | Scrub all PII |

**Rule:** In production, no PII in app logs at all. Use Sentry with `user_id`/`email` for debugging.

**Implementation:**
```python
# logging_config.py
import structlog

class PIIScrubber:
    """Scrub PII from logs in production."""

    SCRUB_FIELDS = ['email', 'name', 'mobile', 'password', 'phone']

    def __call__(self, logger, method_name, event_dict):
        if settings.ENVIRONMENT == 'production':
            for field in self.SCRUB_FIELDS:
                if field in event_dict:
                    event_dict[field] = '[REDACTED]'
        return event_dict

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        PIIScrubber(),  # Apply to ALL log levels in prod
        structlog.processors.JSONRenderer()
    ]
)
```

**Sentry Configuration:**
```python
# For debugging in production
import sentry_sdk

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    environment=settings.ENVIRONMENT,
)

# Set user context on each request
sentry_sdk.set_user({
    "id": str(user.id),
    "email": user.email,  # OK in Sentry (access-controlled)
})
```

### 30.2 Resume Retention

**Rule:** Immediate deletion on any delete action. No grace period.

| Event | Resume Action |
|-------|---------------|
| User uploads new resume | Delete old from GCS, upload new |
| User deletes account | **Immediately** delete from GCS |
| User requests data deletion | **Immediately** delete from GCS |
| Admin deletes/deactivates user | **Immediately** delete from GCS |

**Implementation:**
```python
async def delete_user_data(user_id: UUID):
    """
    Permanently delete user's PII and files.
    Called on: account deletion, data deletion request.
    """
    profile = await get_profile(user_id)

    # 1. Delete resume from GCS (immediate)
    if profile and profile.resume_file_path:
        try:
            await gcs_client.delete_blob(profile.resume_file_path)
        except NotFound:
            pass  # Already deleted

    # 2. Soft delete + anonymize user
    await soft_delete_user(user_id)
```

**UI Confirmation:**
```
┌────────────────────────────────────────────────────────────┐
│  Delete Your Account?                                      │
│                                                            │
│  This action is permanent and will:                        │
│  • Delete your profile information                         │
│  • Delete your uploaded resume                             │
│  • Remove your personal data                               │
│                                                            │
│  Your submission scores will be anonymized but preserved   │
│  for platform analytics.                                   │
│                                                            │
│  This cannot be undone.                                    │
│                                                            │
│  [Cancel]  [Delete My Account]                             │
└────────────────────────────────────────────────────────────┘
```

### 30.3 Admin Audit Logging

**Rule:** Every backend path that changes scores, overrides, or deactivates users MUST log to `admin_audit_log`.

**Required Audit Events:**

| Action | Target Type | Log |
|--------|-------------|-----|
| Override score | `submission` | ✅ Required |
| Reset submission | `submission` | ✅ Required |
| Rescore submission | `submission` | ✅ Required |
| Deactivate user | `user` | ✅ Required |
| Reactivate user | `user` | ✅ Required |
| Delete user | `user` | ✅ Required |
| Archive assessment | `assessment` | ✅ Required |
| Delete assessment | `assessment` | ✅ Required |
| Publish assessment | `assessment` | ✅ Required |
| Change system config | `config` | ✅ Required |
| Enable/disable maintenance | `system` | ✅ Required |
| Send broadcast | `notification` | ✅ Required |
| Invite admin | `admin` | ✅ Required |
| Remove admin | `admin` | ✅ Required |

**Implementation (Decorator Pattern):**
```python
# decorators/audit.py
from functools import wraps

def audit_admin_action(action: str, target_type: str):
    """
    Decorator to automatically log admin actions to audit log.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(
            *args,
            admin: User,
            target_id: UUID,
            reason: str = None,
            **kwargs
        ):
            # Capture old state
            old_value = await get_state_snapshot(target_type, target_id)

            # Execute the action
            result = await func(
                *args,
                admin=admin,
                target_id=target_id,
                reason=reason,
                **kwargs
            )

            # Capture new state
            new_value = await get_state_snapshot(target_type, target_id)

            # Log to audit table
            await db.execute(
                admin_audit_log.insert().values(
                    admin_id=admin.id,
                    action=action,
                    target_type=target_type,
                    target_id=target_id,
                    old_value={"snapshot": old_value},
                    new_value={"snapshot": new_value},
                    reason=reason,
                    ip_address=get_client_ip(),
                )
            )

            return result
        return wrapper
    return decorator


# Usage example
@audit_admin_action("override_score", "submission")
async def override_submission_score(
    submission_id: UUID,
    new_score: float,
    admin: User,
    reason: str,  # Required for overrides
):
    submission = await get_submission(submission_id)
    submission.admin_override_score = new_score
    submission.admin_override_reason = reason
    submission.admin_override_by = admin.id
    submission.admin_override_at = datetime.now(timezone.utc)
    await db.commit()
    return submission
```

**State Snapshot (Efficient):**
```python
async def get_state_snapshot(target_type: str, target_id: UUID) -> dict:
    """
    Return only relevant fields for audit, not entire row.
    """
    if target_type == "submission":
        s = await get_submission(target_id)
        return {
            "status": s.status,
            "final_score": float(s.final_score) if s.final_score else None,
            "admin_override_score": float(s.admin_override_score) if s.admin_override_score else None,
        }
    elif target_type == "user":
        u = await get_user(target_id)
        return {
            "is_active": u.is_active,
            "role": u.role,
            "deleted_at": str(u.deleted_at) if u.deleted_at else None,
        }
    elif target_type == "assessment":
        a = await get_assessment(target_id)
        return {
            "status": a.status,
            "visibility": a.visibility,
            "is_active": a.is_active,
        }
    # ... etc
    return {}
```

**Code Review Rule:**
> PRs touching admin endpoints MUST include audit logging or explain in PR description why audit logging is not needed.

### 30.4 Security Hardening

| Item | Decision | Implementation |
|------|----------|----------------|
| **HTTPS** | Enforced | Railway handles TLS termination |
| **CORS** | Exact whitelist | See below |
| **CSRF** | Not needed | JWT in Authorization header only, no cookies |
| **SQL Injection** | Prevented | SQLAlchemy ORM + parameterized queries |
| **XSS** | Prevented | React escapes by default + Markdown sanitizer |
| **File Upload** | Validated | MIME type + extension + size limit |

**CORS Configuration:**
```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    "https://vibecoding.in",
    "https://www.vibecoding.in",
    "https://app.vibecoding.in",  # If subdomain used
]

if settings.ENVIRONMENT == "development":
    ALLOWED_ORIGINS.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # No wildcard (*) in prod
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)
```

**Auth Statement:**
> We do not use cookies for auth in MVP; only `Authorization: Bearer` tokens. CSRF protection is not required.

**SQL Injection Prevention:**
```python
# ❌ NEVER do this
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ ALWAYS use parameterized queries
query = select(User).where(User.email == email)
# or
query = text("SELECT * FROM users WHERE email = :email")
result = db.execute(query, {"email": email})
```

**Markdown Sanitization:**
```typescript
// frontend/src/utils/markdown.ts
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function renderMarkdown(content: string): string {
  const html = marked.parse(content);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote'],
    ALLOWED_ATTR: ['href', 'class'],
  });
}
```

**File Upload Validation:**
```python
# services/upload.py

ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
]
ALLOWED_EXTENSIONS = ['.pdf', '.docx']
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

async def validate_resume_upload(file: UploadFile) -> None:
    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"File type {ext} not allowed. Use PDF or DOCX.")

    # Check MIME type (don't trust Content-Type header alone)
    content = await file.read(2048)
    await file.seek(0)
    mime_type = magic.from_buffer(content, mime=True)

    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValidationError(f"Invalid file format. Use PDF or DOCX.")

    # Check size
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset

    if size > MAX_FILE_SIZE:
        raise ValidationError(f"File too large. Maximum size is 10 MB.")
```

---

## 31. Load Testing (Required)

### Target Performance

| Metric | Target | Notes |
|--------|--------|-------|
| **Concurrent users** | 100 | Simulating hackathon peak |
| **Submissions/hour** | 50 | With full scoring pipeline |
| **API response time (p95)** | < 500ms | For non-scoring endpoints |
| **Scoring latency (p95)** | < 3 min | End-to-end submission → result |

### Load Test Scenarios

| Scenario | Description | Users |
|----------|-------------|-------|
| **Smoke** | Basic functionality check | 5 |
| **Load** | Normal expected traffic | 50 |
| **Stress** | Peak hackathon traffic | 100 |
| **Spike** | Sudden surge (assessment launch) | 100 → 200 → 100 |

### Test Tool: Locust

```python
# load_tests/locustfile.py
from locust import HttpUser, task, between

class CandidateUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        # Login and get token
        response = self.client.post("/api/v1/auth/login", json={
            "email": f"loadtest+{self.user_id}@example.com",
            "password": "testpassword123"
        })
        self.token = response.json()["data"]["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def view_assessments(self):
        self.client.get("/api/v1/assessments", headers=self.headers)

    @task(2)
    def view_dashboard(self):
        self.client.get("/api/v1/dashboard", headers=self.headers)

    @task(1)
    def view_profile(self):
        self.client.get("/api/v1/profile", headers=self.headers)

    @task(1)
    def submit_solution(self):
        self.client.post("/api/v1/submissions", json={
            "assessment_id": "test-assessment-id",
            "github_repo_url": "https://github.com/test/repo",
            "explanation_text": "Load test submission"
        }, headers=self.headers)


class AdminUser(HttpUser):
    wait_time = between(2, 10)
    weight = 1  # 1 admin per 10 candidates

    @task
    def view_dashboard(self):
        self.client.get("/api/v1/admin/dashboard/stats", headers=self.headers)

    @task
    def view_queue(self):
        self.client.get("/api/v1/admin/queue/status", headers=self.headers)
```

### When to Run

| Phase | Timing | Pass Criteria |
|-------|--------|---------------|
| **Phase 3** | Before admin features complete | Smoke + Load pass |
| **Phase 4** | Before production launch | All scenarios pass |
| **Ongoing** | Weekly in staging | No regression |

### Infrastructure Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| API response time p95 > 1s | Alert | Investigate |
| API response time p95 > 2s | Critical | Scale API instances |
| Queue depth > 100 | Alert | Scale workers |
| Queue depth > 500 | Critical | Scale workers + investigate |
| Error rate > 1% | Alert | Investigate |
| Error rate > 5% | Critical | Rollback / hotfix |

---

## 32. Design System: Neo-Brutalist

### Philosophy

Neo-brutalism = **bold, flat colors** + **thick borders** + **chunky UI** + **minimal shadows** + **strong contrast** + **obvious states**

Moving away from "polite indigo SaaS" to a **loud but controlled** palette.

### Color System

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `bg.base` | `#F5F3EE` | `bg-background` | App background (warm off-white) |
| `bg.surface` | `#FFFFFF` | `bg-background-surface` | Cards, panels |
| `primary` | `#F97316` | `bg-primary` | Primary buttons, highlights (bold orange) |
| `primary.dark` | `#EA580C` | `bg-primary-dark` | Hover/active states |
| `accent` | `#2563EB` | `bg-accent` | Links, badges, secondary CTAs (electric blue) |
| `success` | `#16A34A` | `bg-success` | Passed assessments, good scores |
| `warning` | `#EAB308` | `bg-warning` | Warnings, "careful" labels |
| `danger` | `#DC2626` | `bg-danger` | Errors, destructive actions |
| `border` | `#111827` | `border-border` | Thick outlines, card borders (near-black) |
| `text.main` | `#020617` | `text-text` | Main copy (almost-black) |
| `text.muted` | `#6B7280` | `text-text-muted` | Secondary copy, meta info |

### Tailwind Configuration

```javascript
// tailwind.config.js
const colors = require('tailwindcss/colors')

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#F5F3EE',
          surface: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#F97316',
          dark: '#EA580C',
        },
        accent: {
          DEFAULT: '#2563EB',
        },
        success: {
          DEFAULT: '#16A34A',
        },
        warning: {
          DEFAULT: '#EAB308',
        },
        danger: {
          DEFAULT: '#DC2626',
        },
        border: {
          DEFAULT: '#111827',
        },
        text: {
          DEFAULT: '#020617',
          muted: '#6B7280',
        },
      },
      borderWidth: {
        DEFAULT: '2px',  // Neo-brutal: thicker by default
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        md: '6px',
        lg: '8px',  // Keep chunky, not super rounded
      },
      boxShadow: {
        none: 'none',
        brutal: '4px 4px 0 #111827',  // Neo-brutal offset shadow
        'brutal-sm': '2px 2px 0 #111827',
      },
    },
  },
  plugins: [],
}
```

### Component Conventions

#### Buttons

```tsx
// Primary Button
<button className="
  border-2 border-border
  bg-primary text-white
  px-4 py-2 rounded-md
  font-semibold
  hover:bg-primary-dark
  active:translate-y-[2px]
  transition-transform
">
  Submit Solution
</button>

// Secondary Button
<button className="
  border-2 border-border
  bg-background-surface text-text
  px-4 py-2 rounded-md
  font-semibold
  hover:bg-background
  active:translate-y-[2px]
">
  Cancel
</button>

// Danger Button
<button className="
  border-2 border-border
  bg-danger text-white
  px-4 py-2 rounded-md
  font-semibold
  hover:bg-red-700
  active:translate-y-[2px]
">
  Delete
</button>
```

#### Cards

```tsx
// Standard Card
<div className="
  bg-background-surface
  border-2 border-border
  rounded-md
  p-4
  shadow-none
">
  {children}
</div>

// Featured Card (with brutal shadow)
<div className="
  bg-background-surface
  border-2 border-border
  rounded-md
  p-4
  shadow-brutal
">
  {children}
</div>
```

#### Inputs

```tsx
// Text Input
<input
  type="text"
  className="
    w-full
    border-2 border-border
    rounded-sm
    px-3 py-2
    bg-background-surface
    text-text
    placeholder:text-text-muted
    focus:outline-none focus:border-primary
  "
  placeholder="Enter your GitHub URL"
/>

// Focus state: border turns primary orange
```

#### Navbar

```tsx
<nav className="
  w-full
  bg-background-surface
  border-b-2 border-border
  px-6 py-3
">
  <div className="flex items-center justify-between">
    <Logo />
    <div className="flex gap-2">
      <NavLink>Dashboard</NavLink>
      <NavLink>Assessments</NavLink>
      <NavLink>Profile</NavLink>
    </div>
    <UserMenu />
  </div>
</nav>
```

#### Status Badges

```tsx
// Score badges
<span className="
  inline-block
  border-2 border-border
  bg-success text-white
  px-2 py-1 rounded-sm
  text-sm font-bold
">
  85/100
</span>

// Status badges
<span className="bg-warning text-black border-2 border-border px-2 py-1 rounded-sm text-sm">
  Scoring
</span>

<span className="bg-danger text-white border-2 border-border px-2 py-1 rounded-sm text-sm">
  Failed
</span>

<span className="bg-success text-white border-2 border-border px-2 py-1 rounded-sm text-sm">
  Evaluated
</span>
```

#### Vibe Score Card

```tsx
// Big, loud score display
<div className="
  border-2 border-border
  bg-accent text-white
  rounded-md
  p-6
  text-center
">
  <div className="text-5xl font-bold">247</div>
  <div className="text-sm opacity-80 mt-1">Vibe Score</div>
</div>
```

#### Submission Status Timeline

```tsx
<div className="flex items-center gap-2">
  {/* Completed step */}
  <div className="
    border-2 border-border
    bg-success text-white
    px-3 py-2 rounded-sm
    font-semibold
  ">
    ✓ Submitted
  </div>

  <div className="w-4 h-0.5 bg-border" />

  {/* Active step */}
  <div className="
    border-2 border-border
    bg-primary text-white
    px-3 py-2 rounded-sm
    font-semibold
  ">
    ⏳ Scoring
  </div>

  <div className="w-4 h-0.5 bg-gray-300" />

  {/* Pending step */}
  <div className="
    border-2 border-border
    bg-background-surface text-text-muted
    px-3 py-2 rounded-sm
  ">
    Done
  </div>
</div>
```

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Thick borders** | `border-2 border-border` on everything |
| **Minimal shadows** | `shadow-none` default, `shadow-brutal` for emphasis |
| **Strong contrast** | Dark text on light, white text on colors |
| **Obvious states** | `active:translate-y-[2px]` for "pressed" feel |
| **Chunky radius** | Max `rounded-md` (6px), avoid pill shapes |
| **Bold colors** | Orange primary, blue accent, no pastels |

### Don'ts

- ❌ No soft drop shadows (`shadow-lg`, `shadow-xl`)
- ❌ No gradient backgrounds
- ❌ No thin borders (`border` without `border-2`)
- ❌ No rounded-full on buttons (pills)
- ❌ No subtle hover states (must be obvious)

---

## Summary

This document captures all architectural decisions for the Vibe Coding Platform MVP. The key technology choices are:

| Layer | Technology |
|-------|------------|
| **Frontend** | React + Vite + TypeScript + Tailwind |
| **Backend** | FastAPI (Python) |
| **Database** | PostgreSQL + pgvector |
| **Queue** | Redis + RQ |
| **Auth** | Firebase Authentication |
| **Storage** | Google Cloud Storage |
| **LLM** | Groq API |
| **Hosting** | Railway |
| **CI/CD** | GitHub Actions + Railway auto-deploy |
| **Testing** | pytest, Vitest, Playwright |

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Project setup (monorepo, Docker, CI)
- [ ] Database schema + migrations
- [ ] Auth (Firebase integration)
- [ ] Basic API structure

### Phase 2: Core Features
- [ ] Candidate profile + points
- [ ] Assessment CRUD (admin)
- [ ] Submission flow
- [ ] Worker + scoring pipeline

### Phase 3: Admin & Polish
- [ ] Admin dashboard
- [ ] Reports & analytics
- [ ] Email notifications
- [ ] E2E tests

### Phase 4: Launch Prep
- [ ] Security audit
- [ ] Load testing
- [ ] Monitoring setup
- [ ] Documentation

---

*Document generated from architecture planning session.*
*Last updated: November 2025*

---

## 17. Multi-Tenancy (MVP)

### Goals
- Support multiple customer organizations in a single deployment.
- Enforce tenant isolation at the data layer, API layer, and worker layer.
- Keep the MVP simple: single project with org scoping; no cross-org sharing.

### Core Entities
- `organizations`: `id`, `name`, `slug`, `status` (active/suspended), `plan` (free/pro), `created_by`.
- `organization_users`: `(organization_id, user_id, role)` where `role` ∈ {`owner`, `admin`, `reviewer`, `candidate`}. Unique per org/user.
- `admin_invites`: scoped to an organization (`organization_id`, `email`, `role`, `invited_by`, `expires_at`).
- All tenant data rows carry `organization_id`:
  - `candidate_profiles`, `assessments`, `assessment_invites`, `submissions`, `ai_scores`, `points_log`, `activity_log`, `admin_audit_log`, `llm_usage_log`, `submission_jobs` (job tracking).

### Access & Routing
- Every authenticated API call must include an active `organization_id` (header `X-Organization-Id` or path param). Reject if the user is not a member of that org.
- Authorization is org-scoped: `owner/admin` can manage assessments, invites, overrides; `reviewer` can view/override scores; `candidate` can submit within the org.
- Frontend stores the current org context (switcher if multi-org membership) and sends it with every request.

### Data Isolation Rules
- Tenant scoping is enforced in all queries (`WHERE organization_id = :org_id`).
- Unique constraints are tenant-scoped (e.g., `UNIQUE (organization_id, candidate_id, assessment_id)` for submissions; `UNIQUE (organization_id, user_id)` for profiles/memberships; `UNIQUE (organization_id, event, user_id)` for points).
- Activity/audit/LLM usage logs carry `organization_id` for per-tenant forensics and billing.

### Worker & Queue
- Jobs include `organization_id` in the payload; workers use it to scope DB writes/reads.
- Same queue is fine for MVP; priority queues remain Post-MVP.
- Stuck/failed job detection uses org-scoped submission queries to avoid cross-tenant leakage.

### Cost & Limits (Per Org)
- Submission rate limit per org (e.g., 5/hour/user + 100/day/org).
- LLM spend cap per org (soft warning + hard stop when exceeded); tracked via `llm_usage_log`.
- Repo/file limits unchanged but enforced per submission before enqueue.

### Migration Notes
- Update schema to add `organizations`, `organization_users`, and `organization_id` FKs to tenant-scoped tables.
- Existing single-tenant data can be migrated by creating a default org and attaching all rows to it.

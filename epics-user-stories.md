# Vibe Coding Platform – Phase-1 Epics, User Stories & Acceptance Criteria

## EPIC 1 – Authentication & User Management

### Story 1.1 – Candidate Registration

**As a** candidate  
**I want** to register using my email and password  
**So that** I can log in to the platform

**Acceptance Criteria**
- `POST /auth/register` accepts `email` and `password`.
- Email must be unique; duplicate emails return an error (HTTP 400 or 409).
- Password is hashed securely; plaintext passwords are never stored.
- On success, the API returns the created user (without password) and/or a JWT for immediate login.

---

### Story 1.2 – Candidate Login

**As a** candidate  
**I want** to log in with my credentials  
**So that** I can access my dashboard

**Acceptance Criteria**
- `POST /auth/login` with valid credentials returns a JWT.
- Invalid credentials return HTTP 401 with a clear error message.
- Protected endpoints require a valid JWT and return HTTP 401 when missing/invalid.

---

### Story 1.3 – Admin Role

**As an** admin  
**I want** to access admin‑only APIs  
**So that** I can manage assessments and view candidates

**Acceptance Criteria**
- Users have a `role` field (`candidate` or `admin`).
- Admin‑only endpoints (e.g. `/admin/*`) check for `role = 'admin'` and return HTTP 403 if unauthorized.

---

## EPIC 2 – Candidate Profile & Points

### Story 2.1 – View & Edit Profile

**As a** candidate  
**I want** to view and edit my profile  
**So that** I can keep my details updated

**Acceptance Criteria**
- `GET /profile/me` returns:
  - name, email, mobile
  - github_url, linkedin_url
  - about_me
  - resume uploaded flag/path
  - `profile_completion_percent`
  - `total_points`
- `PUT /profile/me` updates editable fields and persists changes.
- Invalid data (e.g. malformed URLs) is rejected with validation errors.

---

### Story 2.2 – Upload Resume

**As a** candidate  
**I want** to upload my resume as a PDF  
**So that** it is attached to my profile

**Acceptance Criteria**
- `POST /profile/resume` accepts a file upload.
- Non‑PDF files are rejected.
- On success, the resume path or blob reference is stored in `candidate_profiles.resume_file_path`.
- The profile completion percentage is updated to reflect resume presence.
- A one‑time points event `PROFILE_RESUME_UPLOADED` is logged.

---

### Story 2.3 – Points for Profile Completion

**As a** candidate  
**I want** to earn points when I complete my profile  
**So that** I’m incentivized to fill in more details

**Acceptance Criteria**
- One‑time point events:
  - `PROFILE_GITHUB_ADDED` → +10 (first time `github_url` becomes non‑null).
  - `PROFILE_LINKEDIN_ADDED` → +10.
  - `PROFILE_RESUME_UPLOADED` → +15.
- Each event is inserted into `points_log` with `candidate_id`, `event`, and `points`.
- A unique index on `(candidate_id, event)` prevents duplicate points for one‑time events.
- `candidate_profiles.total_points` equals the sum of that candidate’s `points_log.points`.
- Dashboard shows total points.

---

## EPIC 3 – Assessment Management

### Story 3.1 – Admin Creates Assessment

**As an** admin  
**I want** to create coding assessments with problem statements  
**So that** candidates can attempt them

**Acceptance Criteria**
- `POST /admin/assessments` (admin only) accepts:
  - `title`
  - `description`
  - `problem_statement`
  - `code_weight`
  - `reasoning_weight`
- Created assessment is stored with `is_active = true`.
- `GET /admin/assessments` returns a list of all assessments.

---

### Story 3.2 – Candidate Views Active Assessments

**As a** candidate  
**I want** to see the list of available assessments  
**So that** I can decide which to attempt

**Acceptance Criteria**
- `GET /assessments/active` returns only assessments where `is_active = true`.
- `GET /assessments/{id}` returns full details including the `problem_statement`.

---

## EPIC 4 – Submissions & AI Scoring

### Story 4.1 – Submit Assessment Solution

**As a** candidate  
**I want** to submit my GitHub repo URL and explanation  
**So that** the platform can score my solution

**Acceptance Criteria**
- `POST /submissions` accepts:
  - `assessment_id`
  - `github_repo_url`
  - `explanation_text`
- Assessment must exist and be active; invalid cases return a clear error.
- A new submission row is created with:
  - `status = 'SUBMITTED'` immediately, then set to `'QUEUED'` once the job is enqueued.
- A scoring job is pushed into Redis.
- Points event `ASSESSMENT_SUBMITTED` is logged once for this submission.

---

### Story 4.2 – Worker Evaluates Submission

**As** the platform  
**I want** a worker to evaluate submissions asynchronously  
**So that** the API remains fast and responsive

**Acceptance Criteria**
- Worker process listens on a Redis queue (e.g. `scoring`).
- For each job, the worker:
  - Loads the submission and corresponding assessment.
  - Clones the GitHub repo (shallow clone) from `github_repo_url`.
  - Collects relevant source files (e.g. `.py`, `.js`, `.ts`, `.tsx`), ignoring directories like `node_modules`.
  - Optionally runs minimal checks/tests.
  - Calls the LLM for:
    - Code scoring (correctness, quality, readability, robustness).
    - Reasoning scoring (clarity, depth, structure).
  - Writes numeric rubric scores to `ai_scores`.
  - Computes `overall_code_score`, `overall_reasoning_score`, and `final_score` based on assessment weights.
  - Updates `submissions.final_score` and sets `status = 'EVALUATED'` on success.
  - On failure (clone error, LLM error, etc.) sets `status = 'FAILED'` and writes `error_message`.
- When `final_score >= threshold` (e.g. 70), a `ASSESSMENT_SCORE_70_PLUS` points event is logged.

---

### Story 4.3 – Candidate Checks Submission Status

**As a** candidate  
**I want** to see the status and score of my submission  
**So that** I know when results are ready

**Acceptance Criteria**
- `GET /submissions/{id}` returns:
  - `status`
  - `final_score` when evaluated
  - Rubric scores from `ai_scores` when evaluated
  - `error_message` when failed
- Status transitions follow the sequence:
  - `SUBMITTED → QUEUED → SCORING → EVALUATED` or `FAILED`.
- Frontend polls this endpoint until a terminal state (`EVALUATED` or `FAILED`) is reached.

---

## EPIC 5 – Candidate Dashboard

### Story 5.1 – Dashboard Overview

**As a** candidate  
**I want** a dashboard that summarizes my profile, points, and submissions  
**So that** I can understand my standing at a glance

**Acceptance Criteria**
- Dashboard is backed by `GET /profile/me` and `GET /submissions/me` plus `GET /assessments/active`.
- It displays:
  - Candidate name
  - Vibe score
  - Total points
  - Profile completion percentage
  - List of active assessments with per‑assessment status for the candidate (not started, submitted, evaluated).
- If no submissions exist, a clear CTA “Start Assessment” is shown.

---

## EPIC 6 – Admin Overview

### Story 6.1 – Admin Views Candidates with Scores & Points

**As an** admin  
**I want** to view candidates with their scores and points  
**So that** I can shortlist them for further evaluation or hiring

**Acceptance Criteria**
- `GET /admin/candidates` (admin only) returns a list with:
  - `id`
  - name
  - email
  - `total_points`
  - `vibe_score`
  - latest `final_score` (if available)
- Optional filters (e.g. minimum score) may be added without breaking the core contract.

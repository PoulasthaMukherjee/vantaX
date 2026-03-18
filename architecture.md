# Vibe Coding Platform – Phase-1 Architecture

## 1. Logical Architecture

```text
[ Browser / Frontend (React) ]
            │
            ▼
[ Backend API (FastAPI) ]
            │
   ┌────────┴───────────────┐
   ▼                        ▼
[ Postgres + PGVector ]   [ Redis (Job Queue) ]
                                │
                                ▼
                        [ Worker Service ]
                     (GitHub clone + AI scoring)
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
 [ GitHub Repos (candidate code) ]            [ LLM API (Groq / similar) ]
```

### Components

- **React Frontend (SPA)**
  - Responsible for authentication, profile management, viewing assessments, submitting GitHub URLs and explanations, and showing scores, points, and submission status.
  - Communicates with the backend over HTTPS using a JSON REST API.

- **FastAPI Backend API**
  - Handles authentication (JWT), authorization, and validation.
  - Implements business logic for profiles, points, assessments, and submissions.
  - Persists and reads data from Postgres + PGVector.
  - Enqueues long‑running scoring jobs into Redis for asynchronous processing by workers.

- **Worker Service (RQ / Celery)**
  - Runs as a separate process using the same codebase.
  - Dequeues scoring jobs from Redis.
  - For each submission:
    - Clones the candidate’s GitHub repository (shallow clone).
    - Collects relevant source files.
    - Optionally runs lightweight checks/tests.
    - Calls the LLM API (Groq or compatible) with fixed rubrics to score code and reasoning.
    - Writes AI scores and final score into Postgres.
    - Updates submission status and triggers point awards.

- **Postgres + PGVector**
  - Stores users, candidate profiles, assessments, submissions, AI scores, and points logs.
  - PGVector is prepared for future semantic search (e.g., over resumes and answers).

- **Redis (Job Queue)**
  - Stores scoring jobs for submissions.
  - Decouples submission API from heavy evaluation work.

- **External Services**
  - **GitHub**: source of truth for candidate code. The platform clones repos in ephemeral environments and does not store code long‑term.
  - **LLM API (Groq / compatible)**: used for rubric‑based evaluation of code and reasoning with deterministic settings (temperature = 0).

## 2. Physical Architecture (MVP)

A simple 3‑tier deployment is sufficient for Phase‑1:

```text
           INTERNET
               │
         (HTTPS / TLS)
               │
        ┌───────────────┐
        │ Load Balancer │   (optional or provided by the PaaS)
        └───────┬───────┘
                │
      ┌─────────┴──────────┐
      ▼                    ▼
[ App Server ]        [ Worker Server ]

App Server:
- Runs FastAPI backend (e.g., behind Uvicorn/Gunicorn).
- Serves the built React SPA as static assets (or via a separate static host).
- Connects to Postgres, Redis, GitHub, and the LLM API.

Worker Server:
- Runs one or more worker processes (RQ/Celery workers).
- Connects to the same Postgres and Redis instances.
- Has Git installed for repo cloning.
- Talks to GitHub and the LLM API.

Shared Services (can be managed or self‑hosted for MVP):
- **Postgres**: primary transactional store.
- **Redis**: job queue.
- **Object Storage** (optional in Phase‑1) for resumes.
- **LLM Provider** (Groq / compatible OpenAI‑style endpoint).

## 3. Multi-Tenancy Scope

- Tenants are `organizations`; memberships live in `organization_users` with roles (`owner`, `admin`, `reviewer`, `candidate`).
- All tenant-owned rows carry `organization_id` (profiles, assessments, submissions, scores, points, activity/audit logs).
- API requires an active `organization_id` context per request; authorization is evaluated per-org.
- Worker jobs include `organization_id` and only read/write org-scoped data.
```

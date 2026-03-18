-- ============================================================
-- Vibe Coding Platform - Fresh Local Database Setup
-- ============================================================
-- Run this against a fresh PostgreSQL 16+ database:
--   psql -U vibe -d vibe -f fresh-local-setup.sql
--
-- Prerequisites:
--   1. PostgreSQL 16+ with pgvector extension installed
--   2. Database "vibe" created:  CREATE DATABASE vibe;
--   3. User "vibe" with access:  CREATE USER vibe WITH PASSWORD 'vibe_dev_password';
--                                GRANT ALL PRIVILEGES ON DATABASE vibe TO vibe;
-- ============================================================

BEGIN;

-- ========================
-- Extensions
-- ========================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================
-- Enum Types
-- ========================
CREATE TYPE organization_user_role AS ENUM ('owner', 'admin', 'reviewer', 'candidate');
CREATE TYPE assessment_visibility AS ENUM ('active', 'invite_only', 'public');
CREATE TYPE evaluation_mode AS ENUM ('ai_only', 'hybrid', 'human_only');
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE submission_status AS ENUM ('DRAFT', 'SUBMITTED', 'QUEUED', 'CLONING', 'CLONE_FAILED', 'SCORING', 'SCORE_FAILED', 'EVALUATED');
CREATE TYPE event_status AS ENUM ('draft', 'upcoming', 'active', 'ended', 'archived');
CREATE TYPE event_visibility AS ENUM ('public', 'invite_only', 'private');

-- ========================
-- Tables
-- ========================

-- Users (Firebase auth identities)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_users_email ON users (email);

-- Organizations (multi-tenant containers)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    llm_budget_cents INTEGER,  -- NULL = unlimited
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_slug ON organizations (slug);

-- Organization users (memberships)
CREATE TABLE organization_users (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role organization_user_role NOT NULL DEFAULT 'candidate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- Admin invites
CREATE TABLE admin_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role organization_user_role NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_admin_invites_org_email UNIQUE (organization_id, email)
);
CREATE INDEX idx_admin_invites_org ON admin_invites (organization_id);

-- Candidate profiles
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    mobile VARCHAR(20),
    github_url TEXT,
    github_verified BOOLEAN NOT NULL DEFAULT FALSE,
    linkedin_url TEXT,
    resume_file_path TEXT,
    resume_filename VARCHAR(255),
    about_me TEXT,
    vibe_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    slug VARCHAR(100),
    skills VARCHAR[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_candidate_profiles_org_user UNIQUE (organization_id, user_id),
    CONSTRAINT uq_candidate_profiles_slug UNIQUE (slug)
);
CREATE INDEX idx_candidate_profiles_org ON candidate_profiles (organization_id);
CREATE INDEX idx_candidate_profiles_user ON candidate_profiles (user_id);
CREATE INDEX idx_candidate_profiles_public ON candidate_profiles (is_public);
CREATE INDEX idx_candidate_profiles_vibe_score ON candidate_profiles (vibe_score);

-- Assessments (coding challenges with 7-weight rubric)
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    problem_statement TEXT NOT NULL,
    build_requirements TEXT NOT NULL,
    input_output_examples TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL,
    constraints TEXT NOT NULL,
    starter_code TEXT,
    helpful_docs TEXT,
    submission_instructions TEXT NOT NULL,
    visibility assessment_visibility NOT NULL DEFAULT 'active',
    evaluation_mode evaluation_mode NOT NULL DEFAULT 'ai_only',
    status assessment_status NOT NULL DEFAULT 'published',
    time_limit_days INTEGER,
    tags VARCHAR[],
    file_patterns VARCHAR[],
    weight_correctness INTEGER NOT NULL DEFAULT 25,
    weight_quality INTEGER NOT NULL DEFAULT 20,
    weight_readability INTEGER NOT NULL DEFAULT 15,
    weight_robustness INTEGER NOT NULL DEFAULT 10,
    weight_clarity INTEGER NOT NULL DEFAULT 10,
    weight_depth INTEGER NOT NULL DEFAULT 10,
    weight_structure INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_assessments_weights_sum_100
        CHECK (weight_correctness + weight_quality + weight_readability + weight_robustness + weight_clarity + weight_depth + weight_structure = 100)
);
CREATE INDEX idx_assessments_org ON assessments (organization_id);
CREATE INDEX idx_assessments_tags ON assessments USING gin (tags);

-- Assessment invites
CREATE TABLE assessment_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_assessment_invites_assessment_email UNIQUE (assessment_id, email)
);
CREATE INDEX idx_assessment_invites_org ON assessment_invites (organization_id);
CREATE INDEX idx_assessment_invites_assessment ON assessment_invites (assessment_id);

-- Events (hackathons/competitions)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    banner_url TEXT,
    logo_url TEXT,
    theme_color VARCHAR(7),
    status event_status NOT NULL DEFAULT 'draft',
    visibility event_visibility NOT NULL DEFAULT 'public',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    registration_opens_at TIMESTAMPTZ,
    registration_closes_at TIMESTAMPTZ,
    max_participants INTEGER,
    max_submissions_per_user INTEGER NOT NULL DEFAULT 1,
    rules TEXT,
    prizes TEXT,
    sponsors JSONB,
    certificates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    certificate_template TEXT,
    min_score_for_certificate INTEGER NOT NULL DEFAULT 0,
    tags VARCHAR[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_events_org_slug UNIQUE (organization_id, slug)
);
CREATE INDEX idx_events_org ON events (organization_id);
CREATE INDEX idx_events_org_status ON events (organization_id, status);
CREATE INDEX idx_events_dates ON events (starts_at, ends_at);

-- Submissions
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    github_repo_url TEXT,  -- nullable for file uploads
    submission_type VARCHAR(20) NOT NULL DEFAULT 'github',
    uploaded_files_path TEXT,
    uploaded_file_count INTEGER,
    explanation_text TEXT,
    status submission_status NOT NULL DEFAULT 'SUBMITTED',
    commit_sha VARCHAR(40),
    analyzed_files JSONB,
    clone_started_at TIMESTAMPTZ,
    clone_completed_at TIMESTAMPTZ,
    job_id VARCHAR(100),
    job_started_at TIMESTAMPTZ,
    job_completed_at TIMESTAMPTZ,
    final_score NUMERIC(5,2),
    points_awarded INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_submissions_org_candidate_assessment UNIQUE (organization_id, candidate_id, assessment_id)
);
CREATE INDEX idx_submissions_org_status ON submissions (organization_id, status);
CREATE INDEX idx_submissions_org_candidate ON submissions (organization_id, candidate_id);
CREATE INDEX idx_submissions_event ON submissions (event_id);

-- AI Scores (7-dimension rubric scores)
CREATE TABLE ai_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    code_correctness INTEGER NOT NULL,
    code_quality INTEGER NOT NULL,
    code_readability INTEGER NOT NULL,
    code_robustness INTEGER NOT NULL,
    reasoning_clarity INTEGER NOT NULL,
    reasoning_depth INTEGER NOT NULL,
    reasoning_structure INTEGER NOT NULL,
    overall_comment TEXT,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_ai_scores_correctness CHECK (code_correctness BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_quality CHECK (code_quality BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_readability CHECK (code_readability BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_robustness CHECK (code_robustness BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_clarity CHECK (reasoning_clarity BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_depth CHECK (reasoning_depth BETWEEN 1 AND 10),
    CONSTRAINT ck_ai_scores_structure CHECK (reasoning_structure BETWEEN 1 AND 10)
);
CREATE INDEX idx_ai_scores_org ON ai_scores (organization_id);

-- Event registrations
CREATE TABLE event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    certificate_issued BOOLEAN NOT NULL DEFAULT FALSE,
    certificate_issued_at TIMESTAMPTZ,
    certificate_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_registrations_event_user UNIQUE (event_id, user_id)
);
CREATE INDEX idx_event_registrations_event ON event_registrations (event_id);
CREATE INDEX idx_event_registrations_user ON event_registrations (user_id);

-- Event assessments (many-to-many link)
CREATE TABLE event_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    points_multiplier FLOAT NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_assessments_event_assessment UNIQUE (event_id, assessment_id)
);
CREATE INDEX idx_event_assessments_event ON event_assessments (event_id);
CREATE INDEX idx_event_assessments_assessment ON event_assessments (assessment_id);

-- Event invites
CREATE TABLE event_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_invites_event_email UNIQUE (event_id, email)
);
CREATE INDEX idx_event_invites_event ON event_invites (event_id);
CREATE INDEX idx_event_invites_email ON event_invites (email);

-- Points log (gamification)
CREATE TABLE points_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    points INTEGER NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_points_log_org_user_event UNIQUE (organization_id, user_id, event)
);
CREATE INDEX idx_points_log_org ON points_log (organization_id);
CREATE INDEX idx_points_log_user ON points_log (user_id);

-- Activity log (feed/notifications)
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id),
    target_type VARCHAR(50),
    target_id UUID,
    message TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_org ON activity_log (organization_id, created_at);
CREATE INDEX idx_activity_log_target ON activity_log (target_type, target_id);

-- Admin audit log
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_org ON admin_audit_log (organization_id, created_at);
CREATE INDEX idx_audit_log_admin ON admin_audit_log (admin_id);
CREATE INDEX idx_audit_log_target ON admin_audit_log (target_type, target_id);

-- LLM usage log (cost tracking)
CREATE TABLE llm_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost_usd NUMERIC(10,6),
    latency_ms INTEGER,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    success BOOLEAN NOT NULL,
    error_type VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_llm_usage_org ON llm_usage_log (organization_id, created_at);
CREATE INDEX idx_llm_usage_submission ON llm_usage_log (submission_id);

-- System config (key-value store)
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Talent shortlists
CREATE TABLE talent_shortlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_talent_shortlist_org_profile UNIQUE (organization_id, profile_id)
);
CREATE INDEX idx_talent_shortlist_org ON talent_shortlists (organization_id);

-- ========================
-- Alembic version tracking
-- ========================
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
INSERT INTO alembic_version (version_num) VALUES ('0007');

-- ========================
-- Seed data
-- ========================
INSERT INTO system_config (key, value) VALUES ('maintenance_mode', 'false');

COMMIT;

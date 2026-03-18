/**
 * TypeScript types matching backend Pydantic schemas.
 */

// =============================================================================
// Common Types
// =============================================================================

export interface APIResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
}

// =============================================================================
// User & Auth Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  photoUrl?: string;
}

export interface OrganizationMembership {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: 'owner' | 'admin' | 'reviewer' | 'candidate';
}

export interface AuthMeResponse {
  user: User;
  organizations: OrganizationMembership[];
}

// =============================================================================
// Organization Types
// =============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: 'free' | 'pro' | 'enterprise';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

export interface OrganizationCreateInput {
  name: string;
  slug: string;
}

export interface OrganizationUpdateInput {
  name?: string;
}

export interface MemberAddInput {
  user_id: string;
  role: 'owner' | 'admin' | 'reviewer' | 'candidate';
}

export interface MemberUpdateInput {
  role: 'owner' | 'admin' | 'reviewer' | 'candidate';
}

// =============================================================================
// Admin Invite Types
// =============================================================================

export interface AdminInvite {
  id: string;
  email: string;
  role: 'admin' | 'reviewer';
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface AdminInviteCreateInput {
  email: string;
  role: 'admin' | 'reviewer';
}

// =============================================================================
// Assessment Types
// =============================================================================

export type AssessmentVisibility = 'public' | 'active' | 'invite_only' | 'hidden';
export type AssessmentStatus = 'draft' | 'published' | 'archived';
export type EvaluationMode = 'ai_only' | 'hybrid' | 'manual_only';

export interface Assessment {
  id: string;
  organization_id: string;
  created_by: string;

  title: string;
  problem_statement: string;
  build_requirements: string;
  input_output_examples: string;
  acceptance_criteria: string;
  constraints: string;
  submission_instructions: string;

  starter_code: string | null;
  helpful_docs: string | null;

  visibility: AssessmentVisibility;
  evaluation_mode: EvaluationMode;
  status: AssessmentStatus;
  time_limit_days: number | null;
  tags: string[] | null;
  file_patterns: string[] | null;

  weight_correctness: number;
  weight_quality: number;
  weight_readability: number;
  weight_robustness: number;
  weight_clarity: number;
  weight_depth: number;
  weight_structure: number;

  created_at: string;
  updated_at: string;
}

export interface AssessmentListItem {
  id: string;
  title: string;
  problem_statement: string;
  visibility: AssessmentVisibility;
  status: AssessmentStatus;
  time_limit_days: number | null;
  tags: string[] | null;
  created_at: string;
}

export interface AssessmentCreateInput {
  title: string;
  problem_statement: string;
  build_requirements: string;
  input_output_examples: string;
  acceptance_criteria: string;
  constraints: string;
  submission_instructions: string;
  starter_code?: string;
  helpful_docs?: string;
  visibility?: AssessmentVisibility;
  evaluation_mode?: EvaluationMode;
  status?: AssessmentStatus;
  time_limit_days?: number;
  tags?: string[];
  file_patterns?: string[];
  weight_correctness?: number;
  weight_quality?: number;
  weight_readability?: number;
  weight_robustness?: number;
  weight_clarity?: number;
  weight_depth?: number;
  weight_structure?: number;
}

export interface AssessmentUpdateInput {
  title?: string;
  problem_statement?: string;
  build_requirements?: string;
  input_output_examples?: string;
  acceptance_criteria?: string;
  constraints?: string;
  submission_instructions?: string;
  starter_code?: string;
  helpful_docs?: string;
  visibility?: AssessmentVisibility;
  evaluation_mode?: EvaluationMode;
  status?: AssessmentStatus;
  time_limit_days?: number;
  tags?: string[];
  file_patterns?: string[];
  weight_correctness?: number;
  weight_quality?: number;
  weight_readability?: number;
  weight_robustness?: number;
  weight_clarity?: number;
  weight_depth?: number;
  weight_structure?: number;
}

export interface AssessmentGenerateInput {
  description: string;
  difficulty?: 'easy' | 'intermediate' | 'hard';
  role?: string;
  time_limit_days?: number;
  tags?: string[];
}

export interface AssessmentGenerateResponse {
  title: string;
  problem_statement: string;
  build_requirements: string;
  input_output_examples: string;
  acceptance_criteria: string;
  constraints: string;
  submission_instructions: string;
  starter_code?: string | null;
  helpful_docs?: string | null;
  suggested_tags?: string[] | null;
}

// =============================================================================
// Submission Types
// =============================================================================

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'QUEUED'
  | 'CLONING'
  | 'CLONE_FAILED'
  | 'SCORING'
  | 'SCORE_FAILED'
  | 'EVALUATED';

export type SubmissionType = 'github' | 'file_upload';

export interface Submission {
  id: string;
  organization_id: string;
  candidate_id: string;
  assessment_id: string;
  event_id: string | null;

  submission_type: SubmissionType;
  github_repo_url: string | null;
  uploaded_files_path: string | null;
  uploaded_file_count: number | null;
  explanation_text: string | null;

  status: SubmissionStatus;
  commit_sha: string | null;
  analyzed_files: string[] | null;

  clone_started_at: string | null;
  clone_completed_at: string | null;
  job_started_at: string | null;
  job_completed_at: string | null;

  final_score: number | null;
  points_awarded: number;

  error_message: string | null;
  retry_count: number;

  submitted_at: string | null;
  evaluated_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface SubmissionListItem {
  id: string;
  assessment_id: string;
  event_id: string | null;
  submission_type: SubmissionType;
  github_repo_url: string | null;
  uploaded_file_count: number | null;
  status: SubmissionStatus;
  final_score: number | null;
  submitted_at: string | null;
  evaluated_at: string | null;
  assessment_title: string | null;
  event_title: string | null;
  created_at?: string;
}

export interface SubmissionStatusResponse {
  id: string;
  status: SubmissionStatus;
  final_score: number | null;
  error_message: string | null;
  evaluated_at: string | null;
}

export interface AIScore {
  id: string;
  submission_id: string;
  code_correctness: number;
  code_quality: number;
  code_readability: number;
  code_robustness: number;
  reasoning_clarity: number;
  reasoning_depth: number;
  reasoning_structure: number;
  overall_comment: string | null;
  created_at: string;
}

export interface SubmissionDetail extends Submission {
  ai_score: AIScore | null;
  assessment_title: string | null;
}

export interface SubmissionCreateInput {
  assessment_id: string;
  github_repo_url: string;
  explanation_text?: string;
  event_id?: string; // Optional event context for hackathons
}

export interface SubmissionFileUploadInput {
  assessment_id: string;
  files: File[];
  explanation_text?: string;
  event_id?: string;
}

// =============================================================================
// Event Types
// =============================================================================

export type EventStatus = 'draft' | 'upcoming' | 'active' | 'ended' | 'archived';
export type EventVisibility = 'public' | 'invite_only' | 'private';

export interface SponsorInfo {
  name: string;
  logo_url?: string | null;
  website_url?: string | null;
  tier?: string | null; // e.g., "gold", "silver", "bronze"
}

export interface Event {
  id: string;
  organization_id: string;
  created_by: string;

  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;

  banner_url: string | null;
  logo_url: string | null;
  theme_color: string | null;

  status: EventStatus;
  visibility: EventVisibility;

  starts_at: string;
  ends_at: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;

  max_participants: number | null;
  max_submissions_per_user: number;

  rules: string | null;
  prizes: string | null;
  sponsors: SponsorInfo[] | null;

  certificates_enabled: boolean;
  certificate_template: string | null;
  min_score_for_certificate: number;

  tags: string[] | null;

  created_at: string;
  updated_at: string;

  // Computed fields
  participant_count?: number | null;
  is_registered?: boolean | null;
  assessment_count?: number | null;
}

export interface EventListItem {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  banner_url: string | null;
  status: EventStatus;
  visibility: EventVisibility;
  starts_at: string;
  ends_at: string;
  max_participants: number | null;
  tags: string[] | null;
  created_at: string;
  participant_count?: number | null;
}

export interface EventCreateInput {
  title: string;
  slug: string;
  description?: string;
  short_description?: string;
  banner_url?: string;
  logo_url?: string;
  theme_color?: string;
  visibility?: EventVisibility;
  starts_at: string;
  ends_at: string;
  registration_opens_at?: string;
  registration_closes_at?: string;
  max_participants?: number;
  max_submissions_per_user?: number;
  rules?: string;
  prizes?: string;
  sponsors?: SponsorInfo[];
  certificates_enabled?: boolean;
  certificate_template?: string;
  min_score_for_certificate?: number;
  tags?: string[];
  assessment_ids?: string[];
}

export interface EventUpdateInput {
  title?: string;
  slug?: string;
  description?: string;
  short_description?: string;
  banner_url?: string;
  logo_url?: string;
  theme_color?: string;
  status?: EventStatus;
  visibility?: EventVisibility;
  starts_at?: string;
  ends_at?: string;
  registration_opens_at?: string;
  registration_closes_at?: string;
  max_participants?: number;
  max_submissions_per_user?: number;
  rules?: string;
  prizes?: string;
  sponsors?: SponsorInfo[];
  certificates_enabled?: boolean;
  certificate_template?: string;
  min_score_for_certificate?: number;
  tags?: string[];
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  registered_at: string;
  certificate_issued: boolean;
  certificate_issued_at: string | null;
  certificate_url: string | null;
}

export interface EventAssessment {
  id: string;
  event_id: string;
  assessment_id: string;
  display_order: number;
  points_multiplier: number;
  assessment_title?: string | null;
}

export interface EventAssessmentCreateInput {
  assessment_id: string;
  display_order?: number;
  points_multiplier?: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string | null;
  total_score: number;
  submission_count: number;
  best_submission_id: string | null;
  evaluated_at: string | null;
}

export interface EventLeaderboard {
  event_id: string;
  event_title: string;
  total_participants: number;
  entries: LeaderboardEntry[];
}

export interface CertificateResponse {
  certificate_url: string;
  issued_at: string;
}

// Event Invites
export interface EventInvite {
  id: string;
  event_id: string;
  email: string;
  user_id: string | null;
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  inviter_name: string | null;
  user_name: string | null;
}

export interface EventInviteCreateInput {
  email: string;
}

export interface EventInviteBulkCreateInput {
  emails: string[];
}

export interface EventInviteBulkResult {
  created: number;
  skipped: number;
  total: number;
}

export interface EventInviteCheckResult {
  has_invite: boolean;
  invite_id: string | null;
}

// =============================================================================
// Profile Types
// =============================================================================

export interface Profile {
  id: string;
  organization_id: string;
  user_id: string;

  name: string | null;
  mobile: string | null;
  slug: string | null;

  github_url: string | null;
  github_verified: boolean;
  linkedin_url: string | null;

  resume_file_path: string | null;
  resume_filename: string | null;

  about_me: string | null;
  skills: string[] | null;

  vibe_score: number;
  total_points: number;

  is_public: boolean;
  is_complete: boolean;

  created_at: string;
  updated_at: string;
}

export interface ProfileUpdateInput {
  name?: string;
  mobile?: string;
  slug?: string;
  github_url?: string;
  linkedin_url?: string;
  about_me?: string;
  skills?: string[];
  is_public?: boolean;
}

// Public profile (no auth required)
export interface PublicProfile {
  id: string;
  slug: string | null;
  name: string | null;
  github_url: string | null;
  github_verified: boolean;
  linkedin_url: string | null;
  about_me: string | null;
  skills: string[] | null;
  vibe_score: number;
  total_points: number;
}

// =============================================================================
// Talent Search Types
// =============================================================================

export interface TalentSearchParams {
  q?: string;
  min_vibe_score?: number;
  github_verified?: boolean;
  has_resume?: boolean;
  skills?: string[];
  event_id?: string;
  limit?: number;
  offset?: number;
}

export interface TalentSearchResult {
  profiles: PublicProfile[];
  total: number;
  limit: number;
  offset: number;
}

export interface ShortlistEntry {
  id: string;
  organization_id: string;
  profile_id: string;
  added_by: string;
  notes: string | null;
  created_at: string;
  profile: PublicProfile | null;
}

export interface ShortlistCreateInput {
  profile_id: string;
  notes?: string;
}

export interface ShortlistUpdateInput {
  notes?: string;
}

// =============================================================================
// Type Aliases for backward compatibility
// =============================================================================

/** Alias for User type (used in AuthContext) */
export type AuthUser = User;

/** Alias for OrganizationMembership (used in AuthContext) */
export type UserOrganization = OrganizationMembership;

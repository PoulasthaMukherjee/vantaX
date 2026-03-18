/**
 * API client for backend communication.
 */

import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import type {
  AdminInvite,
  AdminInviteCreateInput,
  Assessment,
  AssessmentCreateInput,
  AssessmentGenerateInput,
  AssessmentGenerateResponse,
  AssessmentListItem,
  AssessmentUpdateInput,
  AuthMeResponse,
  CertificateResponse,
  Event,
  EventAssessment,
  EventAssessmentCreateInput,
  EventCreateInput,
  EventInvite,
  EventInviteBulkCreateInput,
  EventInviteBulkResult,
  EventInviteCheckResult,
  EventInviteCreateInput,
  EventLeaderboard,
  EventListItem,
  EventRegistration,
  EventUpdateInput,
  Organization,
  OrganizationCreateInput,
  OrganizationListItem,
  OrganizationMember,
  OrganizationUpdateInput,
  Profile,
  ProfileUpdateInput,
  PublicProfile,
  ShortlistCreateInput,
  ShortlistEntry,
  ShortlistUpdateInput,
  Submission,
  SubmissionCreateInput,
  SubmissionDetail,
  SubmissionListItem,
  SubmissionStatusResponse,
  TalentSearchParams,
  TalentSearchResult,
} from '../types/api';

// API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance
export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Current organization ID (set after login)
let currentOrgId: string | null = null;

export function setCurrentOrganization(orgId: string | null) {
  currentOrgId = orgId;
}

export function getCurrentOrganization(): string | null {
  return currentOrgId;
}

function isE2ETestMode(): boolean {
  return import.meta.env.VITE_E2E_TEST_MODE === 'true' || import.meta.env.VITE_AUTH_MODE === 'mock';
}

function getMockBearerToken(): string | null {
  try {
    const raw = window.localStorage.getItem('mock_auth_user');
    if (!raw) return 'mock-token-e2e';
    const parsed = JSON.parse(raw) as { uid?: string; id?: string };
    const uid = parsed.uid || parsed.id;
    return uid ? `mock-token-${uid}` : 'mock-token-e2e';
  } catch {
    return 'mock-token-e2e';
  }
}

// Request interceptor - add auth token and org header
api.interceptors.request.use(
  async (config) => {
    if (isE2ETestMode()) {
      const token = getMockBearerToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Get Firebase token
      const { auth } = await import('./firebase');
      const user = auth.currentUser;

      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // Add organization header if set
    if (currentOrgId) {
      config.headers['X-Organization-Id'] = currentOrgId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code: string; message: string } }>) => {
    // Handle specific error codes
    if (error.response?.status === 401) {
      // Token expired or invalid - sign out
      if (!isE2ETestMode()) {
        import('./firebase').then(({ signOut }) => signOut());
      }
    }

    // Extract error message and code
    const apiError = error.response?.data?.error;
    const message = apiError?.message || error.message || 'An error occurred';
    const code = apiError?.code || 'UNKNOWN_ERROR';

    const err = new Error(message) as Error & { code: string; status: number };
    err.code = code;
    err.status = error.response?.status || 0;

    return Promise.reject(err);
  }
);

// Type-safe API response
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

// Helper functions for API calls
async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<APIResponse<T>>(url, config);
  return response.data.data;
}

async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<APIResponse<T>>(url, data, config);
  return response.data.data;
}

async function apiPut<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.put<APIResponse<T>>(url, data, config);
  return response.data.data;
}

async function apiPatch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.patch<APIResponse<T>>(url, data, config);
  return response.data.data;
}

async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.delete<APIResponse<T>>(url, config);
  return response.data.data;
}

// =============================================================================
// Auth API
// =============================================================================

export const authAPI = {
  getMe: () => apiGet<AuthMeResponse>('/auth/me'),
};

// =============================================================================
// Organizations API
// =============================================================================

export const organizationsAPI = {
  list: () => apiGet<OrganizationListItem[]>('/organizations'),

  getCurrent: () => apiGet<Organization>('/organizations/current'),

  create: (data: OrganizationCreateInput) =>
    apiPost<Organization>('/organizations', data),

  updateCurrent: (data: OrganizationUpdateInput) =>
    apiPatch<Organization>('/organizations/current', data),

  // Members
  listMembers: () => apiGet<OrganizationMember[]>('/organizations/current/members'),

  addMember: (data: { user_id: string; role: string }) =>
    apiPost<OrganizationMember>('/organizations/current/members', data),

  updateMember: (userId: string, data: { role: string }) =>
    apiPatch<OrganizationMember>(`/organizations/current/members/${userId}`, data),

  removeMember: (userId: string) =>
    apiDelete<void>(`/organizations/current/members/${userId}`),
};

// =============================================================================
// Admin Invites API
// =============================================================================

export const adminInvitesAPI = {
  list: (pendingOnly = true) =>
    apiGet<AdminInvite[]>(`/admin-invites?pending_only=${pendingOnly}`),

  create: (data: AdminInviteCreateInput) =>
    apiPost<AdminInvite>('/admin-invites', data),

  revoke: (inviteId: string) =>
    apiDelete<void>(`/admin-invites/${inviteId}`),

  accept: (inviteId: string) =>
    apiPost<void>(`/admin-invites/${inviteId}/accept`),
};

// =============================================================================
// Assessments API
// =============================================================================

export const assessmentsAPI = {
  list: (params?: { status?: string; tag?: string; limit?: number; offset?: number }) =>
    apiGet<AssessmentListItem[]>('/assessments', { params }),

  get: (id: string) => apiGet<Assessment>(`/assessments/${id}`),

  create: (data: AssessmentCreateInput) =>
    apiPost<Assessment>('/assessments', data),

  update: (id: string, data: AssessmentUpdateInput) =>
    apiPatch<Assessment>(`/assessments/${id}`, data),

  archive: (id: string) =>
    apiPost<Assessment>(`/assessments/${id}/archive`),

  generate: (data: AssessmentGenerateInput) =>
    apiPost<AssessmentGenerateResponse>('/assessments/generate', data),
};

// =============================================================================
// Submissions API
// =============================================================================

export const submissionsAPI = {
  // Candidate endpoints
  list: (params?: { assessment_id?: string; event_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiGet<SubmissionListItem[]>('/submissions', { params }),

  listMine: (params?: { assessment_id?: string; event_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiGet<SubmissionListItem[]>('/submissions', { params }),

  get: (id: string) => apiGet<SubmissionDetail>(`/submissions/${id}`),

  getStatus: (id: string) => apiGet<SubmissionStatusResponse>(`/submissions/${id}/status`),

  create: (data: SubmissionCreateInput) =>
    apiPost<Submission>('/submissions', data),

  createWithFiles: async (data: {
    assessment_id: string;
    files: File[];
    explanation_text?: string;
    event_id?: string;
  }): Promise<Submission> => {
    const formData = new FormData();
    formData.append('assessment_id', data.assessment_id);
    if (data.event_id) formData.append('event_id', data.event_id);
    if (data.explanation_text) formData.append('explanation_text', data.explanation_text);

    for (const file of data.files) {
      formData.append('files', file);
    }

    const response = await api.post<APIResponse<Submission>>(
      '/submissions/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data;
  },

  // Admin endpoints
  listAll: (params?: { assessment_id?: string; event_id?: string; candidate_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiGet<SubmissionListItem[]>('/submissions/admin/all', { params }),

  rescore: (id: string) =>
    apiPost<Submission>(`/submissions/${id}/rescore`),
};

// =============================================================================
// Events API
// =============================================================================

export const eventsAPI = {
  // List events (public or all depending on role)
  list: (params?: {
    status?: string;
    visibility?: string;
    tag?: string;
    include_past?: boolean;
    limit?: number;
    offset?: number;
  }) => apiGet<EventListItem[]>('/events', { params }),

  // Get single event
  get: (eventIdOrSlug: string) => apiGet<Event>(`/events/${eventIdOrSlug}`),

  // Create event (admin)
  create: (data: EventCreateInput) => apiPost<Event>('/events', data),

  // Update event (admin)
  update: (eventId: string, data: EventUpdateInput) =>
    apiPatch<Event>(`/events/${eventId}`, data),

  // Delete event (admin)
  delete: (eventId: string) => apiDelete<void>(`/events/${eventId}`),

  // Registration
  register: (eventId: string) =>
    apiPost<EventRegistration>(`/events/${eventId}/register`),

  unregister: (eventId: string) =>
    apiDelete<void>(`/events/${eventId}/register`),

  listRegistrations: (eventId: string, params?: { limit?: number; offset?: number }) =>
    apiGet<EventRegistration[]>(`/events/${eventId}/registrations`, { params }),

  // Event assessments
  listAssessments: (eventId: string) =>
    apiGet<EventAssessment[]>(`/events/${eventId}/assessments`),

  addAssessment: (eventId: string, data: EventAssessmentCreateInput) =>
    apiPost<EventAssessment>(`/events/${eventId}/assessments`, data),

  removeAssessment: (eventId: string, assessmentId: string) =>
    apiDelete<void>(`/events/${eventId}/assessments/${assessmentId}`),

  // Leaderboard
  getLeaderboard: (eventId: string, params?: { limit?: number; offset?: number }) =>
    apiGet<EventLeaderboard>(`/events/${eventId}/leaderboard`, { params }),

  // Certificates
  generateCertificate: (eventId: string) =>
    apiPost<CertificateResponse>(`/events/${eventId}/certificate`),

  // Invites (for invite_only events)
  listInvites: (eventId: string, params?: { include_revoked?: boolean; limit?: number; offset?: number }) =>
    apiGet<EventInvite[]>(`/events/${eventId}/invites`, { params }),

  createInvite: (eventId: string, data: EventInviteCreateInput) =>
    apiPost<EventInvite>(`/events/${eventId}/invites`, data),

  createInvitesBulk: (eventId: string, data: EventInviteBulkCreateInput) =>
    apiPost<EventInviteBulkResult>(`/events/${eventId}/invites/bulk`, data),

  revokeInvite: (eventId: string, inviteId: string) =>
    apiDelete<void>(`/events/${eventId}/invites/${inviteId}`),

  checkInvite: (eventId: string) =>
    apiGet<EventInviteCheckResult>(`/events/${eventId}/invites/check`),
};

// =============================================================================
// Profiles API
// =============================================================================

export const profilesAPI = {
  getMe: () => apiGet<Profile>('/profiles/me'),

  updateMe: (data: ProfileUpdateInput) =>
    apiPut<Profile>('/profiles/me', data),

  get: (id: string) => apiGet<Profile>(`/profiles/${id}`),

  uploadResume: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<APIResponse<Profile>>('/profiles/me/resume', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  deleteResume: () => apiDelete<Profile>('/profiles/me/resume'),
};

// =============================================================================
// Leaderboard API
// =============================================================================

export interface LeaderboardEntry {
  rank: number;
  candidate_id: string;
  name: string;
  email?: string;
  score: number;
  evaluated_at?: string;
}

export interface LeaderboardStats {
  total_submissions: number;
  avg_score?: number;
  max_score?: number;
  min_score?: number;
}

export const leaderboardAPI = {
  get: (params?: { assessment_id?: string; limit?: number }) =>
    apiGet<LeaderboardEntry[]>('/leaderboard', { params }),

  getStats: (params?: { assessment_id?: string }) =>
    apiGet<LeaderboardStats>('/leaderboard/stats', { params }),
};

// =============================================================================
// Metrics API
// =============================================================================

export interface Metrics {
  queue_depth: number;
  job_latency_p95_ms?: number;
  error_rate_5min: number;
  submissions_by_status: Record<string, number>;
  llm_stats: {
    total_calls_1hr: number;
    total_cost_1hr: number;
    avg_latency_ms: number;
    success_rate_1hr: number;
  };
}

export const metricsAPI = {
  get: () => apiGet<Metrics>('/metrics'),
};

// =============================================================================
// Admin API
// =============================================================================

export interface MaintenanceStatus {
  enabled: boolean;
  updated_by?: string;
  updated_at?: string;
}

export interface BudgetStatus {
  current_spend_usd: number;
  budget_usd?: number;
  usage_percent?: number;
  is_allowed: boolean;
  warning?: string;
}

export const adminAPI = {
  getMaintenanceStatus: () =>
    apiGet<MaintenanceStatus>('/admin/system/maintenance'),

  setMaintenanceMode: (data: { enabled: boolean; reason?: string }) =>
    apiPut<MaintenanceStatus>('/admin/system/maintenance', data),

  getBudgetStatus: () =>
    apiGet<BudgetStatus>('/admin/system/budget'),
};

// =============================================================================
// Admin Jobs API
// =============================================================================

export interface QueueJob {
  job_id: string;
  submission_id: string | null;
  status: string;
  enqueued_at: string | null;
  started_at: string | null;
}

export interface QueueStatus {
  queue_depth: number;
  active_jobs: number;
  failed_count: number;
  jobs: QueueJob[];
  error?: string;
}

export interface FailedSubmission {
  id: string;
  candidate_id: string;
  assessment_id: string;
  github_repo_url: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  submitted_at: string | null;
  updated_at: string | null;
}

export interface StuckSubmission {
  id: string;
  candidate_id: string;
  assessment_id: string;
  github_repo_url: string;
  status: string;
  submitted_at: string | null;
  updated_at: string | null;
  stuck_for_minutes: number;
}

export interface StuckJobsResponse {
  count: number;
  threshold_minutes: number;
  submissions: StuckSubmission[];
}

export interface RescoreResult {
  id: string;
  status: string;
  message: string;
}

export interface RescoreAllResult {
  requeued_count: number;
  message: string;
}

export const adminJobsAPI = {
  getQueueStatus: () =>
    apiGet<QueueStatus>('/admin/jobs/queue'),

  getFailedJobs: (limit = 50) =>
    apiGet<{ count: number; submissions: FailedSubmission[] }>(`/admin/jobs/failed?limit=${limit}`),

  getStuckJobs: () =>
    apiGet<StuckJobsResponse>('/admin/jobs/stuck'),

  rescoreSubmission: (submissionId: string) =>
    apiPost<RescoreResult>(`/admin/jobs/${submissionId}/rescore`),

  rescoreAllFailed: () =>
    apiPost<RescoreAllResult>('/admin/jobs/rescore-failed'),

  cleanupStuck: () =>
    apiPost<{ failed_count: number; requeued_count: number }>('/admin/jobs/cleanup-stuck'),
};

// =============================================================================
// Public API (no authentication required)
// =============================================================================

// Create a separate axios instance for public endpoints (no auth interceptor)
const publicApi = axios.create({
  baseURL: `${API_BASE_URL}/api/public`,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function publicApiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await publicApi.get<APIResponse<T>>(url, config);
  return response.data.data;
}

export const publicAPI = {
  // Get public profile by ID or slug (no auth required)
  getProfile: (idOrSlug: string) =>
    publicApiGet<PublicProfile>(`/profiles/${idOrSlug}`),
};

// =============================================================================
// Talent API (for companies to search public profiles)
// =============================================================================

export const talentAPI = {
  // Search public profiles
  search: (params?: TalentSearchParams) =>
    apiGet<TalentSearchResult>('/talent/search', { params }),

  // Shortlist management
  getShortlist: (params?: { limit?: number; offset?: number }) =>
    apiGet<ShortlistEntry[]>('/talent/shortlist', { params }),

  addToShortlist: (data: ShortlistCreateInput) =>
    apiPost<ShortlistEntry>('/talent/shortlist', data),

  updateShortlistEntry: (entryId: string, data: ShortlistUpdateInput) =>
    apiPatch<ShortlistEntry>(`/talent/shortlist/${entryId}`, data),

  removeFromShortlist: (entryId: string) =>
    apiDelete<{ message: string }>(`/talent/shortlist/${entryId}`),

  // Export shortlist as CSV
  exportShortlist: async () => {
    const response = await api.get('/talent/shortlist/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};

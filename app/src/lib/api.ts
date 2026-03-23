const BASE = '/api';

export interface AssessmentDraft {
  problemStatement: {
    title: string;
    summary: string;
    candidatePrompt: string;
  };
  round1: {
    title: string;
    objective: string;
    task: string;
  };
  round2: {
    title: string;
    objective: string;
    task: string;
  };
  round3: {
    title: string;
    objective: string;
    task: string;
  };
  evaluationCriteria: string[];
  deliverables: string[];
  constraints: string[];
  reviewNotes: string[];
}

export interface CompanyFlowDraft {
  id: number;
  status: string;
  contactName: string;
  companyName: string;
  workEmail: string;
  emailVerifiedAt: string | null;
  websiteUrl: string | null;
  companySize: string | null;
  industry: string | null;
  rolesHiringFor: string[];
  numberRoles: string | null;
  techStack: string | null;
  skillsToEvaluate: string[];
  problemContext: string | null;
  strongSolutionCriteria: string | null;
  suggestChallenge: boolean;
  generatedDraft: AssessmentDraft | null;
  editedDraft: AssessmentDraft | null;
  generationCount: number;
  lastGeneratedAt: string | null;
  finalRoundAttendeeName: string | null;
  finalRoundAttendeeRole: string | null;
  preferredTimeline: string | null;
  contactLinkedin: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function submitCompany(data: Record<string, any>) {
  const res = await fetch(`${BASE}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Submission failed');
  }
  return res.json();
}

export async function submitJury(data: Record<string, any>) {
  const res = await fetch(`${BASE}/jury`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Submission failed');
  }
  return res.json();
}

export async function startCompanyFlow(data: {
  contactName: string;
  companyName: string;
  workEmail: string;
}) {
  const res = await fetch(`${BASE}/company-flow/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start company flow');
  }
  return res.json() as Promise<{ draftId: number; emailSent: boolean; debugCode?: string; expiresAt: string }>;
}

export async function verifyCompanyFlowEmail(data: { draftId: number; code: string }) {
  const res = await fetch(`${BASE}/company-flow/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to verify email');
  }
  return res.json() as Promise<{ success: true; draft: CompanyFlowDraft }>;
}

export async function generateCompanyFlowDraft(draftId: number, data: Record<string, any>) {
  const res = await fetch(`${BASE}/company-flow/${draftId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to generate draft');
  }
  return res.json() as Promise<CompanyFlowDraft>;
}

export async function getCompanyFlowDraft(draftId: number) {
  const res = await fetch(`${BASE}/company-flow/${draftId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to load draft');
  }
  return res.json() as Promise<CompanyFlowDraft>;
}

export async function updateCompanyFlowDraft(draftId: number, data: Record<string, any>) {
  const res = await fetch(`${BASE}/company-flow/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update draft');
  }
  return res.json() as Promise<CompanyFlowDraft>;
}

export async function regenerateCompanyFlowDraft(draftId: number) {
  const res = await fetch(`${BASE}/company-flow/${draftId}/regenerate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to regenerate draft');
  }
  return res.json() as Promise<CompanyFlowDraft>;
}

export async function submitCompanyFlowDraft(draftId: number, data: Record<string, any>) {
  const res = await fetch(`${BASE}/company-flow/${draftId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to submit draft');
  }
  return res.json() as Promise<{ success: true; companyId: number; draft: CompanyFlowDraft }>;
}

export async function createPaymentOrder(candidateId: number) {
  const res = await fetch(`${BASE}/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create payment order');
  }
  return res.json();
}

export async function verifyPayment(orderId: string) {
  const res = await fetch(`${BASE}/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to verify payment');
  }
  return res.json();
}

import { auth } from './firebase';

export async function getAuthToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export async function authedFetch(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

export async function getMe() {
  const res = await authedFetch(`${BASE}/auth/me`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch user');
  }
  return res.json();
}

export async function submitProfile(fd: FormData) {
  const res = await authedFetch(`${BASE}/candidates/profile`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to submit profile');
  }
  return res.json();
}

export async function updateProfile(fd: FormData) {
  const res = await authedFetch(`${BASE}/candidates/profile`, {
    method: 'PUT',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update profile');
  }
  return res.json();
}

// ==========================================
// Phase 1: Auditions
// ==========================================

export async function getAuditions() {
  const res = await fetch(`${BASE}/auditions`);
  if (!res.ok) throw new Error('Failed to fetch auditions');
  return res.json();
}

export async function getAudition(slug: string) {
  const res = await fetch(`${BASE}/auditions/${slug}`);
  if (!res.ok) throw new Error('Failed to fetch audition');
  return res.json();
}

export async function registerForAudition(slug: string) {
  const res = await authedFetch(`${BASE}/auditions/${slug}/register`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to register');
  }
  return res.json();
}

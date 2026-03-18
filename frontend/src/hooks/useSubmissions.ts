/**
 * React Query hooks for submissions.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submissionsAPI } from '../lib/api';
import type { SubmissionCreateInput } from '../types/api';

// Query keys
export const submissionKeys = {
  all: ['submissions'] as const,
  lists: () => [...submissionKeys.all, 'list'] as const,
  listMine: (params?: Record<string, unknown>) => [...submissionKeys.lists(), 'mine', params] as const,
  listAll: (params?: Record<string, unknown>) => [...submissionKeys.lists(), 'all', params] as const,
  details: () => [...submissionKeys.all, 'detail'] as const,
  detail: (id: string) => [...submissionKeys.details(), id] as const,
  status: (id: string) => [...submissionKeys.all, 'status', id] as const,
};

/**
 * Hook to list current user's submissions.
 */
export function useMySubmissions(params?: {
  assessment_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: submissionKeys.listMine(params),
    queryFn: () => submissionsAPI.listMine(params),
  });
}

/**
 * Hook to list all submissions (admin).
 */
export function useAllSubmissions(params?: {
  assessment_id?: string;
  candidate_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: submissionKeys.listAll(params),
    queryFn: () => submissionsAPI.listAll(params),
  });
}

/**
 * Hook to get a single submission with details.
 */
export function useSubmission(id: string) {
  return useQuery({
    queryKey: submissionKeys.detail(id),
    queryFn: () => submissionsAPI.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to poll submission status.
 * Automatically refetches until submission is in terminal state.
 */
export function useSubmissionStatus(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: submissionKeys.status(id),
    queryFn: () => submissionsAPI.getStatus(id),
    enabled: !!id && options?.enabled !== false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      // Stop polling when in terminal state
      const terminalStates = ['EVALUATED', 'CLONE_FAILED', 'SCORE_FAILED'];
      if (terminalStates.includes(data.status)) return false;
      return 2000; // Poll every 2 seconds
    },
  });
}

/**
 * Hook to create a submission.
 */
export function useCreateSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SubmissionCreateInput) => submissionsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

/**
 * Hook to rescore a submission (admin).
 */
export function useRescoreSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => submissionsAPI.rescore(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: submissionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: submissionKeys.status(id) });
      queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

/**
 * React Query hooks for assessments.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assessmentsAPI } from '../lib/api';
import type { AssessmentCreateInput, AssessmentUpdateInput } from '../types/api';

// Query keys
export const assessmentKeys = {
  all: ['assessments'] as const,
  lists: () => [...assessmentKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...assessmentKeys.lists(), params] as const,
  details: () => [...assessmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...assessmentKeys.details(), id] as const,
};

/**
 * Hook to list assessments.
 */
export function useAssessments(params?: {
  status?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: assessmentKeys.list(params),
    queryFn: () => assessmentsAPI.list(params),
  });
}

/**
 * Hook to get a single assessment.
 */
export function useAssessment(id: string) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: () => assessmentsAPI.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to create an assessment.
 */
export function useCreateAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AssessmentCreateInput) => assessmentsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
    },
  });
}

/**
 * Hook to update an assessment.
 */
export function useUpdateAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssessmentUpdateInput }) =>
      assessmentsAPI.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
    },
  });
}

/**
 * Hook to archive an assessment.
 */
export function useArchiveAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => assessmentsAPI.archive(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
    },
  });
}

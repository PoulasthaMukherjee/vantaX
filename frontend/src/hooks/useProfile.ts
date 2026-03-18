/**
 * React Query hooks for profiles.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profilesAPI } from '../lib/api';
import type { ProfileUpdateInput } from '../types/api';

// Query keys
export const profileKeys = {
  all: ['profiles'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  detail: (id: string) => [...profileKeys.all, 'detail', id] as const,
};

/**
 * Hook to get current user's profile.
 */
export function useMyProfile() {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: () => profilesAPI.getMe(),
  });
}

/**
 * Hook to get a profile by ID.
 */
export function useProfile(id: string) {
  return useQuery({
    queryKey: profileKeys.detail(id),
    queryFn: () => profilesAPI.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to update current user's profile.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProfileUpdateInput) => profilesAPI.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() });
    },
  });
}

/**
 * Hook to upload resume.
 */
export function useUploadResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => profilesAPI.uploadResume(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() });
    },
  });
}

/**
 * Hook to delete resume.
 */
export function useDeleteResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => profilesAPI.deleteResume(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() });
    },
  });
}

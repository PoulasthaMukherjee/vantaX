/**
 * React Query hooks for admin invites.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminInvitesAPI } from '../lib/api';
import type { AdminInviteCreateInput } from '../types/api';

// Query keys
export const adminInviteKeys = {
  all: ['adminInvites'] as const,
  list: (pendingOnly?: boolean) => [...adminInviteKeys.all, 'list', pendingOnly] as const,
};

/**
 * Hook to list admin invites.
 */
export function useAdminInvites(pendingOnly = true) {
  return useQuery({
    queryKey: adminInviteKeys.list(pendingOnly),
    queryFn: () => adminInvitesAPI.list(pendingOnly),
  });
}

/**
 * Hook to create an admin invite.
 */
export function useCreateAdminInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminInviteCreateInput) => adminInvitesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminInviteKeys.all });
    },
  });
}

/**
 * Hook to revoke an admin invite.
 */
export function useRevokeAdminInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => adminInvitesAPI.revoke(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminInviteKeys.all });
    },
  });
}

/**
 * Hook to accept an admin invite.
 */
export function useAcceptAdminInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => adminInvitesAPI.accept(inviteId),
    onSuccess: () => {
      // Invalidate auth to refresh organization list
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}

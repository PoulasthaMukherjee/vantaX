/**
 * React Query hooks for organizations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationsAPI } from '../lib/api';
import type { OrganizationCreateInput, OrganizationUpdateInput } from '../types/api';

// Query keys
export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all, 'list'] as const,
  current: () => [...organizationKeys.all, 'current'] as const,
  members: () => [...organizationKeys.all, 'members'] as const,
};

/**
 * Hook to list user's organizations.
 */
export function useOrganizations() {
  return useQuery({
    queryKey: organizationKeys.lists(),
    queryFn: () => organizationsAPI.list(),
  });
}

/**
 * Hook to get current organization.
 */
export function useCurrentOrganization() {
  return useQuery({
    queryKey: organizationKeys.current(),
    queryFn: () => organizationsAPI.getCurrent(),
  });
}

/**
 * Hook to create an organization.
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrganizationCreateInput) => organizationsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}

/**
 * Hook to update current organization.
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrganizationUpdateInput) => organizationsAPI.updateCurrent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.current() });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

/**
 * Hook to list organization members.
 */
export function useOrganizationMembers() {
  return useQuery({
    queryKey: organizationKeys.members(),
    queryFn: () => organizationsAPI.listMembers(),
  });
}

/**
 * Hook to add an organization member.
 */
export function useAddMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { user_id: string; role: string }) =>
      organizationsAPI.addMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
    },
  });
}

/**
 * Hook to update a member's role.
 */
export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      organizationsAPI.updateMember(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
    },
  });
}

/**
 * Hook to remove a member.
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => organizationsAPI.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
    },
  });
}

/**
 * React Query hooks for events (hackathons).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsAPI } from '../lib/api';
import type {
  EventCreateInput,
  EventUpdateInput,
  EventAssessmentCreateInput,
  EventInviteCreateInput,
  EventInviteBulkCreateInput,
} from '../types/api';

// Query keys
export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...eventKeys.lists(), params] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (idOrSlug: string) => [...eventKeys.details(), idOrSlug] as const,
  registrations: (eventId: string) => [...eventKeys.all, 'registrations', eventId] as const,
  assessments: (eventId: string) => [...eventKeys.all, 'assessments', eventId] as const,
  leaderboard: (eventId: string, params?: Record<string, unknown>) =>
    [...eventKeys.all, 'leaderboard', eventId, params] as const,
  invitesRoot: (eventId: string) => [...eventKeys.all, 'invites', eventId] as const,
  invites: (eventId: string, params?: Record<string, unknown>) =>
    [...eventKeys.invitesRoot(eventId), params] as const,
  inviteCheck: (eventId: string) => [...eventKeys.all, 'inviteCheck', eventId] as const,
};

/**
 * Hook to list events.
 */
export function useEvents(params?: {
  status?: string;
  visibility?: string;
  tag?: string;
  include_past?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: eventKeys.list(params),
    queryFn: () => eventsAPI.list(params),
  });
}

/**
 * Hook to get a single event by ID or slug.
 */
export function useEvent(idOrSlug: string) {
  return useQuery({
    queryKey: eventKeys.detail(idOrSlug),
    queryFn: () => eventsAPI.get(idOrSlug),
    enabled: !!idOrSlug,
  });
}

/**
 * Hook to create an event.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EventCreateInput) => eventsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

/**
 * Hook to update an event.
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventUpdateInput }) =>
      eventsAPI.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

/**
 * Hook to delete an event.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

/**
 * Hook to register for an event.
 */
export function useRegisterForEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsAPI.register(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.registrations(eventId) });
    },
  });
}

/**
 * Hook to unregister from an event.
 */
export function useUnregisterFromEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsAPI.unregister(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.registrations(eventId) });
    },
  });
}

/**
 * Hook to list event registrations.
 */
export function useEventRegistrations(eventId: string, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: eventKeys.registrations(eventId),
    queryFn: () => eventsAPI.listRegistrations(eventId, params),
    enabled: !!eventId,
  });
}

/**
 * Hook to list event assessments.
 */
export function useEventAssessments(eventId: string) {
  return useQuery({
    queryKey: eventKeys.assessments(eventId),
    queryFn: () => eventsAPI.listAssessments(eventId),
    enabled: !!eventId,
  });
}

/**
 * Hook to add an assessment to an event.
 */
export function useAddEventAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: EventAssessmentCreateInput }) =>
      eventsAPI.addAssessment(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.assessments(eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
    },
  });
}

/**
 * Hook to remove an assessment from an event.
 */
export function useRemoveEventAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, assessmentId }: { eventId: string; assessmentId: string }) =>
      eventsAPI.removeAssessment(eventId, assessmentId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.assessments(eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
    },
  });
}

/**
 * Hook to get event leaderboard.
 */
export function useEventLeaderboard(eventId: string, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: eventKeys.leaderboard(eventId, params),
    queryFn: () => eventsAPI.getLeaderboard(eventId, params),
    enabled: !!eventId,
  });
}

/**
 * Hook to generate certificate.
 */
export function useGenerateCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsAPI.generateCertificate(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
    },
  });
}

// =============================================================================
// Event Invite Hooks
// =============================================================================

/**
 * Hook to list event invites.
 */
export function useEventInvites(
  eventId: string,
  params?: { include_revoked?: boolean },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: eventKeys.invites(eventId, params),
    queryFn: () => eventsAPI.listInvites(eventId, params),
    enabled: !!eventId && options?.enabled !== false,
  });
}

/**
 * Hook to check if current user has an invite.
 */
export function useCheckEventInvite(eventId: string) {
  return useQuery({
    queryKey: eventKeys.inviteCheck(eventId),
    queryFn: () => eventsAPI.checkInvite(eventId),
    enabled: !!eventId,
  });
}

/**
 * Hook to create a single event invite.
 */
export function useCreateEventInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: EventInviteCreateInput }) =>
      eventsAPI.createInvite(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.invitesRoot(eventId) });
    },
  });
}

/**
 * Hook to create bulk event invites.
 */
export function useCreateEventInvitesBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: EventInviteBulkCreateInput }) =>
      eventsAPI.createInvitesBulk(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.invitesRoot(eventId) });
    },
  });
}

/**
 * Hook to revoke an event invite.
 */
export function useRevokeEventInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, inviteId }: { eventId: string; inviteId: string }) =>
      eventsAPI.revokeInvite(eventId, inviteId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.invitesRoot(eventId) });
    },
  });
}

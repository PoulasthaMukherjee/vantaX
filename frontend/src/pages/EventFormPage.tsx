/**
 * Event create/edit form page (admin only).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, GripVertical } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import {
  useCreateEvent,
  useEvent,
  useUpdateEvent,
  useEventAssessments,
  useAddEventAssessment,
  useRemoveEventAssessment,
} from '../hooks/useEvents';
import { useAssessments } from '../hooks/useAssessments';
import type { EventStatus, EventVisibility, EventAssessment } from '../types/api';

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = !!id;

  const { data: existingEvent, isLoading: loadingEvent } = useEvent(id || '');
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();

  // Assessment management (only for edit mode)
  const { data: eventAssessments, isLoading: loadingAssessments } = useEventAssessments(id || '');
  const { data: allAssessments } = useAssessments({ status: 'published' });
  const addAssessmentMutation = useAddEventAssessment();
  const removeAssessmentMutation = useRemoveEventAssessment();

  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [pointsMultiplier, setPointsMultiplier] = useState('1.0');

  const [form, setForm] = useState({
    title: '',
    slug: '',
    short_description: '',
    description: '',
    banner_url: '',
    logo_url: '',
    theme_color: '',
    visibility: 'public' as EventVisibility,
    starts_at: '',
    ends_at: '',
    max_participants: '',
    max_submissions_per_user: '1',
    status: 'draft' as EventStatus,
    rules: '',
    prizes: '',
    certificates_enabled: true,
    min_score_for_certificate: '0',
    tags: '',
  });

  const [error, setError] = useState<string | null>(null);

  const initialStartsAt = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const initialEndsAt = useMemo(() => new Date(Date.now() + 2 * 60 * 60 * 1000), []);

  useEffect(() => {
    if (!isEdit && !form.starts_at && !form.ends_at) {
      setForm((prev) => ({
        ...prev,
        starts_at: toDatetimeLocal(initialStartsAt.toISOString()),
        ends_at: toDatetimeLocal(initialEndsAt.toISOString()),
      }));
    }
  }, [isEdit, form.starts_at, form.ends_at, initialStartsAt, initialEndsAt]);

  useEffect(() => {
    if (!existingEvent) return;
    setForm({
      title: existingEvent.title,
      slug: existingEvent.slug,
      short_description: existingEvent.short_description || '',
      description: existingEvent.description || '',
      banner_url: existingEvent.banner_url || '',
      logo_url: existingEvent.logo_url || '',
      theme_color: existingEvent.theme_color || '',
      visibility: existingEvent.visibility as EventVisibility,
      starts_at: toDatetimeLocal(existingEvent.starts_at),
      ends_at: toDatetimeLocal(existingEvent.ends_at),
      max_participants: existingEvent.max_participants?.toString() || '',
      max_submissions_per_user: existingEvent.max_submissions_per_user?.toString() || '1',
      status: existingEvent.status as EventStatus,
      rules: existingEvent.rules || '',
      prizes: existingEvent.prizes || '',
      certificates_enabled: existingEvent.certificates_enabled,
      min_score_for_certificate: existingEvent.min_score_for_certificate?.toString() || '0',
      tags: existingEvent.tags?.join(', ') || '',
    });
  }, [existingEvent]);

  if (!isAdmin) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600 mt-2">Only admins can create or edit events.</p>
        </div>
      </Layout>
    );
  }

  if (isEdit && loadingEvent) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const tags = form.tags
      ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    try {
      if (isEdit && id) {
        const payload = {
          title: form.title,
          slug: form.slug,
          short_description: form.short_description || undefined,
          description: form.description || undefined,
          banner_url: form.banner_url || undefined,
          logo_url: form.logo_url || undefined,
          theme_color: form.theme_color || undefined,
          visibility: form.visibility,
          status: form.status,
          starts_at: form.starts_at ? fromDatetimeLocal(form.starts_at) : undefined,
          ends_at: form.ends_at ? fromDatetimeLocal(form.ends_at) : undefined,
          max_participants: form.max_participants ? Number(form.max_participants) : undefined,
          max_submissions_per_user: form.max_submissions_per_user ? Number(form.max_submissions_per_user) : undefined,
          rules: form.rules || undefined,
          prizes: form.prizes || undefined,
          certificates_enabled: form.certificates_enabled,
          min_score_for_certificate: form.min_score_for_certificate ? Number(form.min_score_for_certificate) : undefined,
          tags,
        };

        await updateMutation.mutateAsync({ id, data: payload });
        navigate(`/events/${id}`);
      } else {
        const payload = {
          title: form.title,
          slug: form.slug,
          short_description: form.short_description || undefined,
          description: form.description || undefined,
          banner_url: form.banner_url || undefined,
          logo_url: form.logo_url || undefined,
          theme_color: form.theme_color || undefined,
          visibility: form.visibility,
          starts_at: fromDatetimeLocal(form.starts_at),
          ends_at: fromDatetimeLocal(form.ends_at),
          max_participants: form.max_participants ? Number(form.max_participants) : undefined,
          max_submissions_per_user: form.max_submissions_per_user ? Number(form.max_submissions_per_user) : undefined,
          rules: form.rules || undefined,
          prizes: form.prizes || undefined,
          certificates_enabled: form.certificates_enabled,
          min_score_for_certificate: form.min_score_for_certificate ? Number(form.min_score_for_certificate) : undefined,
          tags,
        };

        const created = await createMutation.mutateAsync(payload);
        navigate(`/events/${created.slug || created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Filter out assessments already added to this event
  const availableAssessments = allAssessments?.filter(
    (a) => !eventAssessments?.some((ea) => ea.assessment_id === a.id)
  ) || [];

  const handleAddAssessment = async () => {
    if (!id || !selectedAssessmentId) return;

    try {
      await addAssessmentMutation.mutateAsync({
        eventId: id,
        data: {
          assessment_id: selectedAssessmentId,
          display_order: (eventAssessments?.length || 0) + 1,
          points_multiplier: parseFloat(pointsMultiplier) || 1.0,
        },
      });
      setSelectedAssessmentId('');
      setPointsMultiplier('1.0');
    } catch (err) {
      console.error('Failed to add assessment:', err);
    }
  };

  const handleRemoveAssessment = async (assessmentId: string) => {
    if (!id) return;

    try {
      await removeAssessmentMutation.mutateAsync({
        eventId: id,
        assessmentId,
      });
    } catch (err) {
      console.error('Failed to remove assessment:', err);
    }
  };

  return (
    <Layout>
      <Link
        to={isEdit ? `/events/${id}` : '/events'}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {isEdit ? 'Back to event' : 'Back to events'}
      </Link>

      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isEdit ? 'Edit Event' : 'New Event'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6 space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
                  Slug <span className="text-red-500">*</span>
                </label>
                <input
                  id="slug"
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="hackathon-2026"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens.</p>
              </div>
            </div>

            <div>
              <label htmlFor="short_description" className="block text-sm font-medium text-gray-700 mb-1">
                Short description
              </label>
              <input
                id="short_description"
                type="text"
                value={form.short_description}
                onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="One-line pitch shown in the event list"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Overview, schedule, expectations..."
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="starts_at" className="block text-sm font-medium text-gray-700 mb-1">
                  Starts at <span className="text-red-500">*</span>
                </label>
                <input
                  id="starts_at"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="ends_at" className="block text-sm font-medium text-gray-700 mb-1">
                  Ends at <span className="text-red-500">*</span>
                </label>
                <input
                  id="ends_at"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="visibility" className="block text-sm font-medium text-gray-700 mb-1">
                  Visibility
                </label>
                <select
                  id="visibility"
                  value={form.visibility}
                  onChange={(e) => setForm({ ...form, visibility: e.target.value as EventVisibility })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="public">Public</option>
                  <option value="invite_only">Invite only</option>
                  <option value="private">Private</option>
                </select>
              </div>

              {isEdit && (
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="max_participants" className="block text-sm font-medium text-gray-700 mb-1">
                  Max participants
                </label>
                <input
                  id="max_participants"
                  type="number"
                  min={1}
                  value={form.max_participants}
                  onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label htmlFor="max_submissions_per_user" className="block text-sm font-medium text-gray-700 mb-1">
                  Max submissions per user
                </label>
                <input
                  id="max_submissions_per_user"
                  type="number"
                  min={1}
                  max={10}
                  value={form.max_submissions_per_user}
                  onChange={(e) => setForm({ ...form, max_submissions_per_user: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="certificates_enabled" className="block text-sm font-medium text-gray-700 mb-1">
                  Certificates
                </label>
                <label className="flex items-center gap-2">
                  <input
                    id="certificates_enabled"
                    type="checkbox"
                    checked={form.certificates_enabled}
                    onChange={(e) => setForm({ ...form, certificates_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">Enable certificates</span>
                </label>
              </div>
              <div>
                <label htmlFor="min_score_for_certificate" className="block text-sm font-medium text-gray-700 mb-1">
                  Min score for certificate
                </label>
                <input
                  id="min_score_for_certificate"
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_score_for_certificate}
                  onChange={(e) => setForm({ ...form, min_score_for_certificate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rules" className="block text-sm font-medium text-gray-700 mb-1">
                Rules
              </label>
              <textarea
                id="rules"
                rows={4}
                value={form.rules}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label htmlFor="prizes" className="block text-sm font-medium text-gray-700 mb-1">
                Prizes
              </label>
              <textarea
                id="prizes"
                rows={3}
                value={form.prizes}
                onChange={(e) => setForm({ ...form, prizes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <input
                id="tags"
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="hackathon, frontend, beginners"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated.</p>
            </div>
          </div>

          {/* Assessment Management Section - Only for Edit Mode */}
          {isEdit && id && (
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Challenges / Assessments</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Add coding challenges to this event. Each challenge can have a points multiplier for scoring.
                </p>

                {/* Current Assessments List */}
                {loadingAssessments ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                  </div>
                ) : eventAssessments && eventAssessments.length > 0 ? (
                  <div className="space-y-2 mb-6">
                    {eventAssessments
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((ea, index) => (
                        <div
                          key={ea.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-500 w-6">
                              #{index + 1}
                            </span>
                            <div>
                              <p className="font-medium text-gray-900">
                                {ea.assessment_title || 'Untitled Assessment'}
                              </p>
                              <p className="text-xs text-gray-500">
                                Points multiplier: {ea.points_multiplier}x
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAssessment(ea.assessment_id)}
                            disabled={removeAssessmentMutation.isPending}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            title="Remove from event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-gray-50 rounded-lg mb-6">
                    <p className="text-gray-500">No challenges added yet.</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Add challenges below to create your multi-week hackathon.
                    </p>
                  </div>
                )}

                {/* Add New Assessment */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Add a Challenge</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <select
                        value={selectedAssessmentId}
                        onChange={(e) => setSelectedAssessmentId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                      >
                        <option value="">Select an assessment...</option>
                        {availableAssessments.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        value={pointsMultiplier}
                        onChange={(e) => setPointsMultiplier(e.target.value)}
                        step="0.1"
                        min="0.1"
                        max="10"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="1.0x"
                        title="Points multiplier"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAssessment}
                      disabled={!selectedAssessmentId || addAssessmentMutation.isPending}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Points multiplier affects how much this challenge counts toward the total score.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}


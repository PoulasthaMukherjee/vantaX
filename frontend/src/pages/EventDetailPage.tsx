/**
 * Event detail page.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Users,
  Tag,
  Trophy,
  Award,
  FileText,
  UserPlus,
  UserMinus,
  Clock,
  CheckCircle,
  Edit2,
  Mail,
  X,
  Send,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import {
  useEvent,
  useEventAssessments,
  useEventLeaderboard,
  useEventInvites,
  useCreateEventInvite,
  useCreateEventInvitesBulk,
  useRevokeEventInvite,
  useRegisterForEvent,
  useUnregisterFromEvent,
  useGenerateCertificate,
} from '../hooks/useEvents';
import type { EventStatus } from '../types/api';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getStatusBadge(status: EventStatus) {
  const styles: Record<EventStatus, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    upcoming: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Upcoming' },
    active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
    ended: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Ended' },
    archived: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Archived' },
  };
  return styles[status] || styles.draft;
}

export default function EventDetailPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const { isAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'assessments' | 'leaderboard' | 'invites'>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [showBulkForm, setShowBulkForm] = useState(false);

  const { data: event, isLoading: eventLoading } = useEvent(idOrSlug || '');
  const { data: assessments, isLoading: assessmentsLoading } = useEventAssessments(event?.id || '');
  const { data: leaderboard, isLoading: leaderboardLoading } = useEventLeaderboard(event?.id || '');
  const showInvitesTab = isAdmin && event?.visibility === 'invite_only';
  const { data: invites, isLoading: invitesLoading } = useEventInvites(
    event?.id || '',
    undefined,
    { enabled: showInvitesTab }
  );

  const registerMutation = useRegisterForEvent();
  const unregisterMutation = useUnregisterFromEvent();
  const certificateMutation = useGenerateCertificate();
  const createInviteMutation = useCreateEventInvite();
  const createBulkInvitesMutation = useCreateEventInvitesBulk();
  const revokeInviteMutation = useRevokeEventInvite();

  const handleRegister = async () => {
    if (!event) return;
    try {
      await registerMutation.mutateAsync(event.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to register');
    }
  };

  const handleUnregister = async () => {
    if (!event) return;
    if (!confirm('Are you sure you want to unregister from this event?')) return;
    try {
      await unregisterMutation.mutateAsync(event.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unregister');
    }
  };

  const handleGenerateCertificate = async () => {
    if (!event) return;
    try {
      const result = await certificateMutation.mutateAsync(event.id);
      window.open(result.certificate_url, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate certificate');
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !inviteEmail.trim()) return;
    try {
      await createInviteMutation.mutateAsync({
        eventId: event.id,
        data: { email: inviteEmail.trim() },
      });
      setInviteEmail('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create invite');
    }
  };

  const handleBulkInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !bulkEmails.trim()) return;
    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    if (emails.length === 0) return;
    try {
      const result = await createBulkInvitesMutation.mutateAsync({
        eventId: event.id,
        data: { emails },
      });
      setBulkEmails('');
      setShowBulkForm(false);
      alert(`Created ${result.created} invites, skipped ${result.skipped} (already invited)`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create invites');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!event) return;
    if (!confirm('Are you sure you want to revoke this invite?')) return;
    try {
      await revokeInviteMutation.mutateAsync({ eventId: event.id, inviteId });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke invite');
    }
  };

  if (eventLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Event not found</h2>
          <Link to="/events" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
            Back to events
          </Link>
        </div>
      </Layout>
    );
  }

  const statusBadge = getStatusBadge(event.status);
  const isRegistered = event.is_registered;
  const canRegister = ['upcoming', 'active'].includes(event.status) && !isRegistered;
  const canUnregister = ['upcoming', 'active'].includes(event.status) && isRegistered;
  const canSubmit = event.status === 'active' && isRegistered;
  const canGetCertificate = event.status === 'ended' && event.certificates_enabled && isRegistered;

  return (
    <Layout>
      {/* Back link */}
      <Link
        to="/events"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to events
      </Link>

      {/* Hero banner */}
      <div className="relative rounded-xl overflow-hidden mb-8">
        {event.banner_url ? (
          <div
            className="h-48 md:h-64 bg-cover bg-center"
            style={{ backgroundImage: `url(${event.banner_url})` }}
          />
        ) : (
          <div
            className="h-48 md:h-64"
            style={{
              background: event.theme_color
                ? `linear-gradient(135deg, ${event.theme_color}, ${event.theme_color}88)`
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {event.logo_url && (
                <img
                  src={event.logo_url}
                  alt={event.title}
                  className="w-16 h-16 rounded-lg bg-white shadow-lg"
                />
              )}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                    {statusBadge.label}
                  </span>
                  {event.visibility !== 'public' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                      {event.visibility === 'invite_only' ? 'Invite Only' : 'Private'}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{event.title}</h1>
              </div>
            </div>
            {isAdmin && (
              <Link
                to={`/events/${event.id}/edit`}
                className="btn bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'overview'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'assessments'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Challenges ({assessments?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'leaderboard'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Leaderboard
            </button>
            {showInvitesTab && (
              <button
                onClick={() => setActiveTab('invites')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'invites'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  Invites ({invites?.length || 0})
                </span>
              </button>
            )}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              {event.description && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">About</h2>
                  <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                    {event.description}
                  </div>
                </div>
              )}

              {/* Rules */}
              {event.rules && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Rules
                  </h2>
                  <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                    {event.rules}
                  </div>
                </div>
              )}

              {/* Prizes */}
              {event.prizes && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Prizes
                  </h2>
                  <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                    {event.prizes}
                  </div>
                </div>
              )}

              {/* Sponsors */}
              {event.sponsors && event.sponsors.length > 0 && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Sponsors</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {event.sponsors.map((sponsor, i) => (
                      <a
                        key={i}
                        href={sponsor.website_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 transition-colors text-center"
                      >
                        {sponsor.logo_url ? (
                          <img
                            src={sponsor.logo_url}
                            alt={sponsor.name}
                            className="h-12 mx-auto object-contain"
                          />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{sponsor.name}</div>
                        )}
                        {sponsor.tier && (
                          <div className="text-xs text-gray-500 mt-1 capitalize">{sponsor.tier}</div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assessments' && (
            <div className="space-y-4">
              {assessmentsLoading ? (
                <div className="card p-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
                </div>
              ) : assessments && assessments.length > 0 ? (
                assessments.map((ea) => (
                  <div key={ea.id} className="card p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {ea.assessment_title || 'Assessment'}
                        </h3>
                        {ea.points_multiplier !== 1 && (
                          <span className="text-xs text-primary-600 mt-1">
                            {ea.points_multiplier}x points
                          </span>
                        )}
                      </div>
                      {canSubmit ? (
                        <Link
                          to={`/assessments/${ea.assessment_id}?event=${event.id}`}
                          className="btn btn-primary text-sm"
                        >
                          Start Challenge
                        </Link>
                      ) : isRegistered ? (
                        <Link
                          to={`/assessments/${ea.assessment_id}`}
                          className="btn btn-ghost text-sm"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">Register to participate</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="card p-8 text-center text-gray-500">
                  No challenges have been added to this event yet.
                </div>
              )}
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="card overflow-hidden">
              {leaderboardLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
                </div>
              ) : leaderboard && leaderboard.entries.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Score</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Submissions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {leaderboard.entries.map((entry) => (
                      <tr
                        key={entry.user_id}
                        className={entry.user_id === user?.id ? 'bg-primary-50' : ''}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-bold ${
                            entry.rank === 1
                              ? 'text-yellow-500'
                              : entry.rank === 2
                              ? 'text-gray-400'
                              : entry.rank === 3
                              ? 'text-amber-600'
                              : 'text-gray-600'
                          }`}>
                            #{entry.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">
                            {entry.user_name || 'Anonymous'}
                          </span>
                          {entry.user_id === user?.id && (
                            <span className="ml-2 text-xs text-primary-600">(You)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {entry.total_score.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {entry.submission_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No submissions yet. Be the first to submit!
                </div>
              )}
            </div>
          )}

          {activeTab === 'invites' && showInvitesTab && (
            <div className="space-y-6">
              {/* Add Invite Form */}
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Invite Participants
                </h2>

                {!showBulkForm ? (
                  <div className="space-y-4">
                    <form onSubmit={handleCreateInvite} className="flex gap-2">
                      <input
                        type="email"
                        placeholder="Enter email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                      />
                      <button
                        type="submit"
                        disabled={createInviteMutation.isPending}
                        className="btn btn-primary"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {createInviteMutation.isPending ? 'Sending...' : 'Invite'}
                      </button>
                    </form>
                    <button
                      onClick={() => setShowBulkForm(true)}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      Invite multiple at once
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleBulkInvite} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email addresses (one per line or comma/semicolon separated)
                      </label>
                      <textarea
                        value={bulkEmails}
                        onChange={(e) => setBulkEmails(e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={createBulkInvitesMutation.isPending}
                        className="btn btn-primary"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {createBulkInvitesMutation.isPending ? 'Sending...' : 'Send Invites'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkForm(false);
                          setBulkEmails('');
                        }}
                        className="btn btn-ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Invites List */}
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">
                    Sent Invites ({invites?.length || 0})
                  </h3>
                </div>
                {invitesLoading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
                  </div>
                ) : invites && invites.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="px-6 py-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{invite.email}</div>
                          <div className="text-sm text-gray-500">
                            Invited {new Date(invite.invited_at).toLocaleDateString()}
                            {invite.inviter_name && ` by ${invite.inviter_name}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {invite.accepted_at ? (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Accepted
                            </span>
                          ) : (
                            <span className="text-sm text-yellow-600">Pending</span>
                          )}
                          {!invite.accepted_at && (
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              disabled={revokeInviteMutation.isPending}
                              className="text-red-600 hover:text-red-700 p-1"
                              title="Revoke invite"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    No invites sent yet. Add emails above to invite participants.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Registration card */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Participation</h2>

            {isRegistered ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">You're registered!</span>
                </div>
                {canUnregister && (
                  <button
                    onClick={handleUnregister}
                    disabled={unregisterMutation.isPending}
                    className="w-full btn btn-ghost text-red-600 hover:bg-red-50"
                  >
                    <UserMinus className="w-4 h-4 mr-2" />
                    {unregisterMutation.isPending ? 'Unregistering...' : 'Unregister'}
                  </button>
                )}
              </div>
            ) : canRegister ? (
              <button
                onClick={handleRegister}
                disabled={registerMutation.isPending}
                className="w-full btn btn-primary"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {registerMutation.isPending ? 'Registering...' : 'Register Now'}
              </button>
            ) : (
              <p className="text-gray-500 text-sm">
                {event.status === 'ended'
                  ? 'This event has ended.'
                  : event.status === 'draft'
                  ? 'This event is not yet open.'
                  : 'Registration is closed.'}
              </p>
            )}

            {/* Certificate button */}
            {canGetCertificate && (
              <button
                onClick={handleGenerateCertificate}
                disabled={certificateMutation.isPending}
                className="w-full btn btn-primary mt-4"
              >
                <Award className="w-4 h-4 mr-2" />
                {certificateMutation.isPending ? 'Generating...' : 'Get Certificate'}
              </button>
            )}
          </div>

          {/* Event info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs text-gray-500 uppercase">Duration</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900 mt-1">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatShortDate(event.starts_at)} - {formatShortDate(event.ends_at)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Start Time</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900 mt-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {formatDate(event.starts_at)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Participants</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900 mt-1">
                  <Users className="w-4 h-4 text-gray-400" />
                  {event.participant_count || 0}
                  {event.max_participants && ` / ${event.max_participants}`}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Submissions per user</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900 mt-1">
                  <FileText className="w-4 h-4 text-gray-400" />
                  {event.max_submissions_per_user}
                </dd>
              </div>

              {event.tags && event.tags.length > 0 && (
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Tags</dt>
                  <dd className="flex flex-wrap gap-1 mt-1">
                    {event.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </Layout>
  );
}

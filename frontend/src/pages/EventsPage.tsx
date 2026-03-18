/**
 * Events (hackathons) list page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Calendar, Users, Tag, Trophy } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import { useEvents } from '../hooks/useEvents';
import type { EventListItem, EventStatus } from '../types/api';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusBadge(status: EventStatus) {
  const styles: Record<EventStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    upcoming: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    ended: 'bg-yellow-100 text-yellow-700',
    archived: 'bg-gray-100 text-gray-500',
  };
  return styles[status] || 'bg-gray-100 text-gray-700';
}

function EventCard({ event }: { event: EventListItem }) {
  const isActive = event.status === 'active';
  const isUpcoming = event.status === 'upcoming';

  return (
    <Link
      to={`/events/${event.slug || event.id}`}
      className="card overflow-hidden hover:shadow-md transition-shadow group"
    >
      {/* Banner */}
      {event.banner_url ? (
        <div
          className="h-32 bg-cover bg-center"
          style={{ backgroundImage: `url(${event.banner_url})` }}
        />
      ) : (
        <div className="h-32 bg-gradient-to-r from-primary-500 to-primary-600" />
      )}

      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadge(event.status)}`}>
                {event.status}
              </span>
              {event.visibility !== 'public' && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                  {event.visibility === 'invite_only' ? 'Invite Only' : 'Private'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
              {event.title}
            </h3>
            {event.short_description && (
              <p className="mt-2 text-gray-600 text-sm line-clamp-2">
                {event.short_description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDate(event.starts_at)} - {formatDate(event.ends_at)}
          </span>
          {event.participant_count !== undefined && event.participant_count !== null && (
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {event.participant_count}
              {event.max_participants && ` / ${event.max_participants}`}
            </span>
          )}
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {event.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
            {event.tags.length > 3 && (
              <span className="text-xs text-gray-400">+{event.tags.length - 3} more</span>
            )}
          </div>
        )}

        {(isActive || isUpcoming) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span
              className={`text-sm font-medium ${
                isActive ? 'text-green-600' : 'text-blue-600'
              }`}
            >
              {isActive ? 'Happening now!' : `Starts ${formatDate(event.starts_at)}`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function EventsPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: events, isLoading } = useEvents({
    status: statusFilter || undefined,
    include_past: true,
  });

  const filteredEvents = events?.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.short_description?.toLowerCase().includes(search.toLowerCase())
  );

  // Group events by status for better display
  const activeEvents = filteredEvents?.filter((e) => e.status === 'active') || [];
  const upcomingEvents = filteredEvents?.filter((e) => e.status === 'upcoming') || [];
  const otherEvents = filteredEvents?.filter((e) =>
    !['active', 'upcoming'].includes(e.status)
  ) || [];

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-7 h-7 text-primary-600" />
            Events
          </h1>
          <p className="mt-1 text-gray-600">
            {isAdmin ? 'Manage hackathons and competitions' : 'Join hackathons and compete'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/events/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Event
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">All Events</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="ended">Ended</option>
            {isAdmin && <option value="draft">Draft</option>}
          </select>
        </div>
      </div>

      {/* Events */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : filteredEvents && filteredEvents.length > 0 ? (
        <div className="space-y-8">
          {/* Active Events */}
          {activeEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Happening Now
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Other Events */}
          {otherEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Past & Draft Events</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {search ? 'No events match your search.' : 'No events available yet.'}
          </p>
          {isAdmin && !search && (
            <Link to="/events/new" className="btn btn-primary mt-4 inline-flex">
              <Plus className="w-4 h-4 mr-2" />
              Create your first event
            </Link>
          )}
        </div>
      )}
    </Layout>
  );
}

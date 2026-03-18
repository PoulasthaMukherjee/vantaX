/**
 * Talent dashboard page for companies.
 * Search public profiles and manage shortlist.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { talentAPI } from '../lib/api';
import Header from '../components/layout/Header';
import type { PublicProfile, ShortlistEntry, TalentSearchParams } from '../types/api';

type TabType = 'search' | 'shortlist';

export default function TalentPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [searchParams, setSearchParams] = useState<TalentSearchParams>({
    limit: 20,
    offset: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Search query
  const { data: searchResult, isLoading: isSearching } = useQuery({
    queryKey: ['talent-search', searchParams],
    queryFn: () => talentAPI.search(searchParams),
    enabled: activeTab === 'search',
  });

  // Shortlist query
  const { data: shortlist, isLoading: isLoadingShortlist } = useQuery({
    queryKey: ['talent-shortlist'],
    queryFn: () => talentAPI.getShortlist(),
    enabled: activeTab === 'shortlist',
  });

  // Add to shortlist mutation
  const addToShortlistMutation = useMutation({
    mutationFn: (profileId: string) => talentAPI.addToShortlist({ profile_id: profileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-shortlist'] });
    },
  });

  // Remove from shortlist mutation
  const removeFromShortlistMutation = useMutation({
    mutationFn: (entryId: string) => talentAPI.removeFromShortlist(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-shortlist'] });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({
      ...searchParams,
      q: searchQuery || undefined,
      offset: 0,
    });
  };

  const handleExport = async () => {
    try {
      const blob = await talentAPI.exportShortlist();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shortlist.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export shortlist:', error);
    }
  };

  const shortlistedIds = new Set(shortlist?.map(s => s.profile_id) || []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Talent</h1>
          {activeTab === 'shortlist' && shortlist && shortlist.length > 0 && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Export CSV
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('search')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'search'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setActiveTab('shortlist')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'shortlist'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Shortlist {shortlist && shortlist.length > 0 && `(${shortlist.length})`}
            </button>
          </nav>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div>
            {/* Search Form */}
            <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or bio..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <select
                    value={searchParams.min_vibe_score || ''}
                    onChange={(e) => setSearchParams({
                      ...searchParams,
                      min_vibe_score: e.target.value ? Number(e.target.value) : undefined,
                      offset: 0,
                    })}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Any Vibe Score</option>
                    <option value="50">50+</option>
                    <option value="60">60+</option>
                    <option value="70">70+</option>
                    <option value="80">80+</option>
                    <option value="90">90+</option>
                  </select>
                </div>
                <div>
                  <select
                    value={searchParams.github_verified === undefined ? '' : String(searchParams.github_verified)}
                    onChange={(e) => setSearchParams({
                      ...searchParams,
                      github_verified: e.target.value === '' ? undefined : e.target.value === 'true',
                      offset: 0,
                    })}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Any GitHub Status</option>
                    <option value="true">GitHub Verified</option>
                    <option value="false">Not Verified</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Search Results */}
            {isSearching ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : searchResult ? (
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  {searchResult.total} profile{searchResult.total !== 1 ? 's' : ''} found
                </p>
                <div className="grid gap-4">
                  {searchResult.profiles.map((profile) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      isShortlisted={shortlistedIds.has(profile.id)}
                      onAddToShortlist={() => addToShortlistMutation.mutate(profile.id)}
                      isAdding={addToShortlistMutation.isPending}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {searchResult.total > searchResult.limit && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => setSearchParams({
                        ...searchParams,
                        offset: Math.max(0, (searchParams.offset || 0) - searchParams.limit!),
                      })}
                      disabled={(searchParams.offset || 0) === 0}
                      className="px-4 py-2 border rounded-lg disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setSearchParams({
                        ...searchParams,
                        offset: (searchParams.offset || 0) + searchParams.limit!,
                      })}
                      disabled={(searchParams.offset || 0) + searchParams.limit! >= searchResult.total}
                      className="px-4 py-2 border rounded-lg disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Shortlist Tab */}
        {activeTab === 'shortlist' && (
          <div>
            {isLoadingShortlist ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : shortlist && shortlist.length > 0 ? (
              <div className="grid gap-4">
                {shortlist.map((entry) => (
                  <ShortlistCard
                    key={entry.id}
                    entry={entry}
                    onRemove={() => removeFromShortlistMutation.mutate(entry.id)}
                    isRemoving={removeFromShortlistMutation.isPending}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No profiles shortlisted yet.</p>
                <button
                  onClick={() => setActiveTab('search')}
                  className="mt-4 text-primary-600 hover:underline"
                >
                  Search for talent
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// Profile Card Component
function ProfileCard({
  profile,
  isShortlisted,
  onAddToShortlist,
  isAdding,
}: {
  profile: PublicProfile;
  isShortlisted: boolean;
  onAddToShortlist: () => void;
  isAdding: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/u/${profile.slug || profile.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-primary-600"
            >
              {profile.name || 'Anonymous'}
            </Link>
            {profile.github_verified && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                GitHub Verified
              </span>
            )}
          </div>
          {profile.about_me && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{profile.about_me}</p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {profile.skills.slice(0, 5).map((skill, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  {skill}
                </span>
              ))}
              {profile.skills.length > 5 && (
                <span className="text-xs text-gray-400">+{profile.skills.length - 5} more</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-bold text-primary-600">
              {profile.vibe_score?.toFixed(1) || '0'}
            </div>
            <div className="text-xs text-gray-500">Vibe Score</div>
          </div>
          {isShortlisted ? (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm">
              Shortlisted
            </span>
          ) : (
            <button
              onClick={onAddToShortlist}
              disabled={isAdding}
              className="px-3 py-1 border border-primary-600 text-primary-600 rounded hover:bg-primary-50 disabled:opacity-50 text-sm"
            >
              {isAdding ? '...' : '+ Shortlist'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Shortlist Card Component
function ShortlistCard({
  entry,
  onRemove,
  isRemoving,
}: {
  entry: ShortlistEntry;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const profile = entry.profile;

  if (!profile) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/u/${profile.slug || profile.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-primary-600"
            >
              {profile.name || 'Anonymous'}
            </Link>
            {profile.github_verified && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                GitHub Verified
              </span>
            )}
          </div>
          {profile.about_me && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{profile.about_me}</p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {profile.skills.slice(0, 5).map((skill, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  {skill}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Added {new Date(entry.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-bold text-primary-600">
              {profile.vibe_score?.toFixed(1) || '0'}
            </div>
            <div className="text-xs text-gray-500">Vibe Score</div>
          </div>
          <button
            onClick={onRemove}
            disabled={isRemoving}
            className="px-3 py-1 border border-red-600 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 text-sm"
          >
            {isRemoving ? '...' : 'Remove'}
          </button>
        </div>
      </div>
      {entry.notes && (
        <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-600">
          <span className="font-medium">Notes:</span> {entry.notes}
        </div>
      )}
    </div>
  );
}

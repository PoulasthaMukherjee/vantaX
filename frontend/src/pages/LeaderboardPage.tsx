/**
 * Leaderboard page.
 * Shows ranked candidates by score.
 */

import { useQuery } from '@tanstack/react-query';
import {
  leaderboardAPI,
  type LeaderboardEntry,
  type LeaderboardStats,
} from '../lib/api';

export default function LeaderboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => leaderboardAPI.get(),
  });

  const { data: statsData } = useQuery({
    queryKey: ['leaderboard', 'stats'],
    queryFn: () => leaderboardAPI.getStats(),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load leaderboard. Please try again.
          </div>
        </div>
      </div>
    );
  }

  const entries: LeaderboardEntry[] = data || [];
  const stats: LeaderboardStats | undefined = statsData;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard</h1>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total_submissions}</p>
              <p className="text-sm text-gray-500">Submissions</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-2xl font-bold text-primary-600">
                {stats.avg_score?.toFixed(1) || '-'}
              </p>
              <p className="text-sm text-gray-500">Avg Score</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {stats.max_score?.toFixed(0) || '-'}
              </p>
              <p className="text-sm text-gray-500">High Score</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">
                {stats.min_score?.toFixed(0) || '-'}
              </p>
              <p className="text-sm text-gray-500">Low Score</p>
            </div>
          </div>
        )}

        {/* Leaderboard table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Candidate
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No submissions yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.candidate_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          entry.rank === 1
                            ? 'bg-yellow-100 text-yellow-800'
                            : entry.rank === 2
                            ? 'bg-gray-200 text-gray-800'
                            : entry.rank === 3
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{entry.name}</p>
                        {entry.email && (
                          <p className="text-sm text-gray-500">{entry.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-lg font-bold text-primary-600">
                        {entry.score.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {entry.evaluated_at
                        ? new Date(entry.evaluated_at).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

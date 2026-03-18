/**
 * Submissions list page.
 * Shows all submissions for the current user.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { submissionsAPI } from '../lib/api';
import Header from '../components/layout/Header';
import type { SubmissionListItem, SubmissionStatus } from '../types/api';

const statusColors: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  QUEUED: 'bg-yellow-100 text-yellow-800',
  CLONING: 'bg-yellow-100 text-yellow-800',
  SCORING: 'bg-purple-100 text-purple-800',
  EVALUATED: 'bg-green-100 text-green-800',
  CLONE_FAILED: 'bg-red-100 text-red-800',
  SCORE_FAILED: 'bg-red-100 text-red-800',
};

const statusLabels: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  QUEUED: 'Queued',
  CLONING: 'Cloning...',
  SCORING: 'Scoring...',
  EVALUATED: 'Evaluated',
  CLONE_FAILED: 'Clone Failed',
  SCORE_FAILED: 'Score Failed',
};

export default function SubmissionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['submissions'],
    queryFn: () => submissionsAPI.list(),
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
            Failed to load submissions. Please try again.
          </div>
        </div>
      </div>
    );
  }

  const submissions: SubmissionListItem[] = data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Submissions</h1>
          <Link
            to="/assessments"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            View Assessments
          </Link>
        </div>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">You haven't made any submissions yet.</p>
            <Link
              to="/assessments"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Browse available assessments
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {submissions.map((submission) => (
              <Link
                key={submission.id}
                to={`/submissions/${submission.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {submission.assessment_title || 'Assessment'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {submission.github_repo_url}
                    </p>
                    {submission.submitted_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted {new Date(submission.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {submission.final_score !== null && (
                      <span className="text-2xl font-bold text-primary-600">
                        {Number(submission.final_score).toFixed(0)}%
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[submission.status]
                      }`}
                    >
                      {statusLabels[submission.status]}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

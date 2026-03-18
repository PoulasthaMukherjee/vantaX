/**
 * Main dashboard page.
 */

import { Link } from 'react-router-dom';
import { FileCode, Award, Clock, ArrowRight } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import { useAssessments } from '../hooks/useAssessments';
import { useMySubmissions } from '../hooks/useSubmissions';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { data: assessments, isLoading: loadingAssessments } = useAssessments({ status: 'active', limit: 5 });
  const { data: submissions, isLoading: loadingSubmissions } = useMySubmissions({ limit: 5 });

  const assessmentCount = assessments?.length ?? 0;
  const submissionCount = submissions?.length ?? 0;
  const pendingCount = submissions?.filter(s =>
    s.status !== 'EVALUATED' && s.status !== 'CLONE_FAILED' && s.status !== 'SCORE_FAILED'
  ).length ?? 0;

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-gray-600">
          Welcome back, {user?.name || 'there'}!
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link to="/assessments" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileCode className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {isAdmin ? 'Assessments' : 'Available'}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {loadingAssessments ? '...' : assessmentCount}
              </p>
            </div>
          </div>
        </Link>

        <Link to="/submissions" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <Award className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">My Submissions</p>
              <p className="text-2xl font-bold text-gray-900">
                {loadingSubmissions ? '...' : submissionCount}
              </p>
            </div>
          </div>
        </Link>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {loadingSubmissions ? '...' : pendingCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent assessments */}
      <div className="card mb-8">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            {isAdmin ? 'Recent Assessments' : 'Available Assessments'}
          </h3>
          <Link to="/assessments" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {loadingAssessments ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
            </div>
          ) : assessments && assessments.length > 0 ? (
            assessments.map((assessment) => (
              <Link
                key={assessment.id}
                to={`/assessments/${assessment.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{assessment.title}</h4>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {assessment.description}
                    </p>
                  </div>
                  <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">
                    {assessment.time_limit_minutes} min
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-gray-500 text-center py-8">
              No assessments available yet.
            </p>
          )}
        </div>
      </div>

      {/* Recent submissions */}
      {submissions && submissions.length > 0 && (
        <div className="card">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Recent Submissions</h3>
            <Link to="/submissions" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {submissions.slice(0, 3).map((submission) => (
              <Link
                key={submission.id}
                to={`/submissions/${submission.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {submission.assessment_title || 'Assessment'}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {submission.created_at ? new Date(submission.created_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={submission.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

function SubmissionStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
    CLONING: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Cloning' },
    CLONED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Cloned' },
    SCORING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Scoring' },
    EVALUATED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Complete' },
    CLONE_FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
    SCORE_FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  };

  const config = statusConfig[status] || statusConfig.PENDING;

  return (
    <span className={`text-xs px-2 py-1 rounded ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

/**
 * Assessments list page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Clock, Tag, Archive } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import { useAssessments, useArchiveAssessment } from '../hooks/useAssessments';

export default function AssessmentsPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('published');

  const { data: assessments, isLoading } = useAssessments({
    status: statusFilter || undefined,
  });

  const archiveMutation = useArchiveAssessment();

  const filteredAssessments = assessments?.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.problem_statement?.toLowerCase().includes(search.toLowerCase())
  );

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm('Are you sure you want to archive this assessment?')) {
      await archiveMutation.mutateAsync(id);
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="mt-1 text-gray-600">
            {isAdmin ? 'Manage and create assessments' : 'Browse available assessments'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/assessments/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Assessment
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
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          {isAdmin && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="">All</option>
            </select>
          )}
        </div>
      </div>

      {/* Assessments list */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : filteredAssessments && filteredAssessments.length > 0 ? (
        <div className="grid gap-4">
          {filteredAssessments.map((assessment) => (
            <Link
              key={assessment.id}
              to={`/assessments/${assessment.id}`}
              className="card p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {assessment.title}
                    </h3>
                    {isAdmin && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        assessment.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : assessment.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {assessment.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-gray-600 line-clamp-2">
                    {assessment.problem_statement}
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                    {assessment.time_limit_days && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {assessment.time_limit_days} days
                      </span>
                    )}
                    {assessment.tags && assessment.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-4 h-4" />
                        {assessment.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && assessment.status !== 'archived' && (
                  <button
                    onClick={(e) => handleArchive(assessment.id, e)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    title="Archive assessment"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-gray-500">
            {search ? 'No assessments match your search.' : 'No assessments available.'}
          </p>
          {isAdmin && !search && (
            <Link to="/assessments/new" className="btn btn-primary mt-4 inline-flex">
              <Plus className="w-4 h-4 mr-2" />
              Create your first assessment
            </Link>
          )}
        </div>
      )}
    </Layout>
  );
}

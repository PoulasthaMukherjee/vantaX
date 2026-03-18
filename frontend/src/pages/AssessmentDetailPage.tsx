/**
 * Assessment detail page.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Tag, ExternalLink, Play, Edit2, Users, Upload, Github, File, X } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import { useAssessment } from '../hooks/useAssessments';
import { useCreateSubmission } from '../hooks/useSubmissions';
import { submissionsAPI } from '../lib/api';

type SubmissionMode = 'github' | 'files';

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  // Submission mode state
  const [mode, setMode] = useState<SubmissionMode>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventId = searchParams.get('event') || undefined;
  const { data: assessment, isLoading } = useAssessment(id || '');
  const createSubmission = useCreateSubmission();

  // File handling
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'github') {
        if (!repoUrl.trim()) return;
        const submission = await createSubmission.mutateAsync({
          assessment_id: id,
          github_repo_url: repoUrl.trim(),
          event_id: eventId,
        });
        navigate(`/submissions/${submission.id}`);
      } else {
        if (files.length === 0) return;
        const submission = await submissionsAPI.createWithFiles({
          assessment_id: id,
          files: files,
          event_id: eventId,
        });
        navigate(`/submissions/${submission.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create submission');
      setSubmitting(false);
    }
  };

  const isSubmitDisabled = submitting || (mode === 'github' ? !repoUrl.trim() : files.length === 0);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  if (!assessment) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900">Assessment not found</h2>
          <Link to="/assessments" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
            Back to assessments
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Back link */}
      <Link
        to={eventId ? `/events/${eventId}` : '/assessments'}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {eventId ? 'Back to event' : 'Back to assessments'}
      </Link>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{assessment.title}</h1>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {assessment.time_limit_minutes} minutes
                  </span>
                  {assessment.tags && assessment.tags.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-4 h-4" />
                      {assessment.tags.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Link
                  to={`/assessments/${id}/edit`}
                  className="btn btn-ghost text-sm"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Link>
              )}
            </div>

            <div className="prose prose-sm max-w-none">
              <p className="text-gray-600 whitespace-pre-wrap">{assessment.description}</p>
            </div>

            {assessment.starter_repo_url && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Starter Repository</h3>
                <a
                  href={assessment.starter_repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 flex items-center gap-2 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  {assessment.starter_repo_url}
                </a>
                <p className="text-xs text-gray-500 mt-2">
                  Fork this repository and push your changes to submit.
                </p>
              </div>
            )}
          </div>

          {/* Admin: Submission stats */}
          {isAdmin && (
            <div className="card p-6 mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">Submissions</h2>
              </div>
              <Link
                to={`/submissions?assessment_id=${id}`}
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                View all submissions for this assessment →
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar: Submit */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit Your Work</h2>

            {/* Submission mode tabs */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('github')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'github'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Github className="w-4 h-4" />
                GitHub URL
              </button>
              <button
                type="button"
                onClick={() => setMode('files')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'files'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload Files
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'github' ? (
                <div className="mb-4">
                  <label
                    htmlFor="repoUrl"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Repository URL
                  </label>
                  <input
                    type="url"
                    id="repoUrl"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the URL of your solution repository
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragActive
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600 mb-2">
                      Drag and drop files or a ZIP archive
                    </p>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                      accept=".py,.js,.ts,.jsx,.tsx,.java,.go,.rs,.cpp,.c,.h,.rb,.php,.cs,.swift,.kt,.scala,.zip"
                    />
                    <label
                      htmlFor="file-upload"
                      className="text-primary-600 hover:text-primary-700 cursor-pointer text-sm font-medium"
                    >
                      Browse files
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-gray-700">
                        {files.length} file(s) selected
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {files.map((file, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded px-2 py-1"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{file.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="text-gray-400 hover:text-red-500 flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full btn btn-primary"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Submit Assessment
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Your submission will be evaluated automatically
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

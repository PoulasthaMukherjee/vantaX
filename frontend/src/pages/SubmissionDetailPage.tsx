/**
 * Submission detail page.
 * Shows submission status, scores, and AI feedback.
 */

import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { submissionsAPI } from '../lib/api';
import Header from '../components/layout/Header';
import type { SubmissionDetail, SubmissionStatus, AIScore } from '../types/api';

const statusMessages: Record<SubmissionStatus, string> = {
  DRAFT: 'Your submission is in draft mode.',
  SUBMITTED: 'Your submission has been received.',
  QUEUED: 'Your submission is queued for processing.',
  CLONING: 'Cloning your repository...',
  SCORING: 'AI is evaluating your code...',
  EVALUATED: 'Your submission has been scored!',
  CLONE_FAILED: 'Failed to clone your repository.',
  SCORE_FAILED: 'Scoring encountered an error.',
};

const scoreLabels: Record<string, string> = {
  code_correctness: 'Correctness',
  code_quality: 'Quality',
  code_readability: 'Readability',
  code_robustness: 'Robustness',
  reasoning_clarity: 'Clarity',
  reasoning_depth: 'Depth',
  reasoning_structure: 'Structure',
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  // Scores are stored as 1-10 in database, convert to percentage for display
  const percentage = score * 10;
  const color = percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{score}/10</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['submission', id],
    queryFn: () => submissionsAPI.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      // Auto-refresh while processing
      const status = query.state.data?.status;
      if (status && ['QUEUED', 'CLONING', 'SCORING'].includes(status)) {
        return 3000; // Poll every 3 seconds
      }
      return false;
    },
  });

  const submission: SubmissionDetail | undefined = data;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Submission not found or failed to load.
          </div>
          <Link to="/submissions" className="mt-4 inline-block text-primary-600">
            Back to submissions
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing = ['QUEUED', 'CLONING', 'SCORING'].includes(submission.status);
  const isFailed = ['CLONE_FAILED', 'SCORE_FAILED'].includes(submission.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
          to="/submissions"
          className="text-gray-500 hover:text-gray-700 text-sm mb-4 inline-block"
        >
          Back to submissions
        </Link>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {submission.assessment_title || 'Submission'}
          </h1>

          <a
            href={submission.github_repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline text-sm"
          >
            {submission.github_repo_url}
          </a>

          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-gray-700">{statusMessages[submission.status]}</p>
            {isProcessing && (
              <div className="mt-2 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
                <span className="text-sm text-gray-500">Processing...</span>
              </div>
            )}
            {isFailed && submission.error_message && (
              <p className="mt-2 text-sm text-red-600">{submission.error_message}</p>
            )}
          </div>

          {submission.commit_sha && (
            <p className="mt-4 text-xs text-gray-400">
              Commit: {submission.commit_sha.substring(0, 7)}
            </p>
          )}
        </div>

        {/* Score display */}
        {submission.status === 'EVALUATED' && submission.final_score !== null && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500 mb-1">Final Score</p>
              <p className="text-5xl font-bold text-primary-600">
                {Number(submission.final_score).toFixed(0)}%
              </p>
            </div>

            {submission.ai_score && (
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-4">Score Breakdown</h3>
                {Object.entries(scoreLabels).map(([key, label]) => {
                  const score = submission.ai_score?.[key as keyof AIScore];
                  if (typeof score === 'number') {
                    return <ScoreBar key={key} label={label} score={score} />;
                  }
                  return null;
                })}
              </div>
            )}

            {submission.ai_score?.overall_comment && (
              <div className="mt-6 border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-2">AI Feedback</h3>
                <p className="text-gray-600 text-sm">{submission.ai_score.overall_comment}</p>
              </div>
            )}
          </div>
        )}

        {/* Analyzed files */}
        {submission.analyzed_files && submission.analyzed_files.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-medium text-gray-900 mb-3">Analyzed Files</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {submission.analyzed_files.map((file, i) => (
                <li key={i} className="font-mono text-xs bg-gray-50 px-2 py-1 rounded">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

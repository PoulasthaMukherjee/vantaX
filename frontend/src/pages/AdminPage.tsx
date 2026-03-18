/**
 * Admin dashboard page.
 * Shows system metrics, maintenance controls, budget status, and job management.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminAPI,
  adminJobsAPI,
  metricsAPI,
  type MaintenanceStatus,
  type BudgetStatus,
  type Metrics,
  type QueueStatus,
  type FailedSubmission,
  type StuckSubmission,
} from '../lib/api';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'failed' | 'stuck'>('overview');

  // Fetch metrics
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => metricsAPI.get(),
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch maintenance status
  const { data: maintenanceData } = useQuery({
    queryKey: ['admin', 'maintenance'],
    queryFn: () => adminAPI.getMaintenanceStatus(),
  });

  // Fetch budget status
  const { data: budgetData } = useQuery({
    queryKey: ['admin', 'budget'],
    queryFn: () => adminAPI.getBudgetStatus(),
  });

  // Fetch queue status
  const { data: queueData } = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => adminJobsAPI.getQueueStatus(),
    refetchInterval: 15000, // Refresh every 15s
  });

  // Fetch failed jobs
  const { data: failedData } = useQuery({
    queryKey: ['admin', 'failed'],
    queryFn: () => adminJobsAPI.getFailedJobs(50),
    refetchInterval: 30000,
  });

  // Fetch stuck jobs
  const { data: stuckData } = useQuery({
    queryKey: ['admin', 'stuck'],
    queryFn: () => adminJobsAPI.getStuckJobs(),
    refetchInterval: 30000,
  });

  // Toggle maintenance mutation
  const toggleMaintenance = useMutation({
    mutationFn: (enabled: boolean) =>
      adminAPI.setMaintenanceMode({ enabled, reason: maintenanceReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'maintenance'] });
      setMaintenanceReason('');
    },
  });

  // Rescore single submission
  const rescoreOne = useMutation({
    mutationFn: (submissionId: string) => adminJobsAPI.rescoreSubmission(submissionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'failed'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
    },
  });

  // Rescore all failed
  const rescoreAll = useMutation({
    mutationFn: () => adminJobsAPI.rescoreAllFailed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'failed'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
    },
  });

  // Cleanup stuck jobs
  const cleanupStuck = useMutation({
    mutationFn: () => adminJobsAPI.cleanupStuck(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'stuck'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
    },
  });

  const metrics: Metrics | undefined = metricsData;
  const maintenance: MaintenanceStatus | undefined = maintenanceData;
  const budget: BudgetStatus | undefined = budgetData;
  const queue: QueueStatus | undefined = queueData;
  const failedJobs: FailedSubmission[] = failedData?.submissions || [];
  const stuckJobs: StuckSubmission[] = stuckData?.submissions || [];

  if (metricsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

        {/* Maintenance Mode */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Maintenance Mode</h2>
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                maintenance?.enabled ? 'bg-yellow-500' : 'bg-green-500'
              }`}
            />
            <span className="font-medium">
              {maintenance?.enabled ? 'Maintenance Active' : 'System Online'}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={maintenanceReason}
              onChange={(e) => setMaintenanceReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 px-3 py-2 border rounded-lg"
            />
            <button
              onClick={() => toggleMaintenance.mutate(!maintenance?.enabled)}
              disabled={toggleMaintenance.isPending}
              className={`px-4 py-2 rounded-lg font-medium ${
                maintenance?.enabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-yellow-600 text-white hover:bg-yellow-700'
              }`}
            >
              {maintenance?.enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
            </button>
          </div>
        </div>

        {/* Budget Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">LLM Budget</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Current Spend</p>
              <p className="text-2xl font-bold text-gray-900">
                ${budget?.current_spend_usd?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Budget</p>
              <p className="text-2xl font-bold text-gray-900">
                {budget?.budget_usd ? `$${budget.budget_usd.toFixed(2)}` : 'Unlimited'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Usage</p>
              <p
                className={`text-2xl font-bold ${
                  (budget?.usage_percent || 0) > 80 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {budget?.usage_percent?.toFixed(1) || '0'}%
              </p>
            </div>
          </div>
          {budget?.warning && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              {budget.warning}
            </div>
          )}
        </div>

        {/* Queue & Job Management Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-6 font-medium text-sm border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('failed')}
                className={`py-3 px-6 font-medium text-sm border-b-2 ${
                  activeTab === 'failed'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Failed Jobs
                {failedJobs.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                    {failedJobs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('stuck')}
                className={`py-3 px-6 font-medium text-sm border-b-2 ${
                  activeTab === 'stuck'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Stuck Jobs
                {stuckJobs.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                    {stuckJobs.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Queue Status</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Queue Depth</p>
                      <p
                        className={`text-3xl font-bold ${
                          (queue?.queue_depth || 0) > 50 ? 'text-yellow-600' : 'text-green-600'
                        }`}
                      >
                        {queue?.queue_depth || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Active Jobs</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {queue?.active_jobs || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Failed Count</p>
                      <p
                        className={`text-3xl font-bold ${
                          (queue?.failed_count || 0) > 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {queue?.failed_count || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Error Rate (5min)</p>
                      <p
                        className={`text-3xl font-bold ${
                          (metrics?.error_rate_5min || 0) > 5 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {metrics?.error_rate_5min?.toFixed(1) || '0'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Job Latency (p95)</p>
                      <p className="text-3xl font-bold text-gray-900">
                        {metrics?.job_latency_p95_ms
                          ? `${(metrics.job_latency_p95_ms / 1000).toFixed(1)}s`
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">LLM Stats (1hr)</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Total Calls</p>
                      <p className="text-3xl font-bold text-gray-900">
                        {metrics?.llm_stats?.total_calls_1hr || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Success Rate</p>
                      <p
                        className={`text-3xl font-bold ${
                          (metrics?.llm_stats?.success_rate_1hr || 0) < 95
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}
                      >
                        {metrics?.llm_stats?.success_rate_1hr?.toFixed(1) || '0'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Cost</p>
                      <p className="text-3xl font-bold text-gray-900">
                        ${metrics?.llm_stats?.total_cost_1hr?.toFixed(3) || '0.000'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'failed' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Failed Submissions ({failedJobs.length})
                  </h3>
                  {failedJobs.length > 0 && (
                    <button
                      onClick={() => rescoreAll.mutate()}
                      disabled={rescoreAll.isPending}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {rescoreAll.isPending ? 'Rescoring...' : 'Rescore All Failed'}
                    </button>
                  )}
                </div>
                {failedJobs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No failed submissions</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Submission
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Error
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Retries
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {failedJobs.map((job) => (
                          <tr key={job.id}>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono text-xs text-gray-600">
                                {job.id.slice(0, 8)}...
                              </div>
                              <div className="text-xs text-gray-400 truncate max-w-xs">
                                {job.github_repo_url}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                                {job.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                              {job.error_message || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {job.retry_count}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => rescoreOne.mutate(job.id)}
                                disabled={rescoreOne.isPending}
                                className="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
                              >
                                Rescore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stuck' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Stuck Submissions ({stuckJobs.length})
                    {stuckData?.threshold_minutes && (
                      <span className="ml-2 text-sm text-gray-500">
                        (&gt;{stuckData.threshold_minutes}min)
                      </span>
                    )}
                  </h3>
                  {stuckJobs.length > 0 && (
                    <button
                      onClick={() => cleanupStuck.mutate()}
                      disabled={cleanupStuck.isPending}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                    >
                      {cleanupStuck.isPending ? 'Cleaning...' : 'Cleanup Stuck'}
                    </button>
                  )}
                </div>
                {stuckJobs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No stuck submissions</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Submission
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Stuck For
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Last Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stuckJobs.map((job) => (
                          <tr key={job.id}>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono text-xs text-gray-600">
                                {job.id.slice(0, 8)}...
                              </div>
                              <div className="text-xs text-gray-400 truncate max-w-xs">
                                {job.github_repo_url}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                                {job.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-red-600 font-medium">
                              {job.stuck_for_minutes}min
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {job.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submission Status Breakdown */}
        {metrics?.submissions_by_status && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Submissions by Status</h2>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(metrics.submissions_by_status).map(([status, count]) => (
                <div key={status} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-sm text-gray-500">{status}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

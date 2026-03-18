/**
 * Organization settings page.
 * Allows admins to configure organization settings.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsAPI } from '../lib/api';
import Header from '../components/layout/Header';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: () => organizationsAPI.getCurrent(),
  });

  const updateOrg = useMutation({
    mutationFn: (data: { name?: string }) => organizationsAPI.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    },
  });

  const [name, setName] = useState('');

  // Set initial values when data loads
  if (org && !name) {
    setName(org.name);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrg.mutate({ name });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Organization Settings</h1>

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Organization Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Details</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Your Organization"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Slug
                  </label>
                  <input
                    type="text"
                    value={org?.slug || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Slug cannot be changed after creation.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Plan
                  </label>
                  <input
                    type="text"
                    value={org?.plan || 'free'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 capitalize"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updateOrg.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateOrg.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* LLM Budget */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">LLM Usage Budget</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Budget</span>
                  <span className="font-medium">
                    ${((org?.llm_budget_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  Contact support to adjust your LLM budget limits.
                </p>
              </div>
            </div>

            {/* Organization Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Organization ID</span>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">{org?.id}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="capitalize">{org?.status || 'active'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Created</span>
                  <span>{org?.created_at ? new Date(org.created_at).toLocaleDateString() : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

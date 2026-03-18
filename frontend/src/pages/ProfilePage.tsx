/**
 * User profile page.
 * Shows profile info, stats, and resume management.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Profile, ProfileUpdateInput } from '../types/api';

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileUpdateInput>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => profilesAPI.getMe(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProfileUpdateInput) => profilesAPI.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      setIsEditing(false);
    },
  });

  const profile: Profile | undefined = data;

  const handleEdit = () => {
    setFormData({
      name: profile?.name || '',
      mobile: profile?.mobile || '',
      slug: profile?.slug || '',
      github_url: profile?.github_url || '',
      linkedin_url: profile?.linkedin_url || '',
      about_me: profile?.about_me || '',
      skills: profile?.skills || [],
      is_public: profile?.is_public || false,
    });
    setIsEditing(true);
  };

  const handleSkillsChange = (value: string) => {
    const skills = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    setFormData({ ...formData, skills });
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

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
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load profile. Please try again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

        {/* Stats card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-primary-600">
                {profile?.vibe_score ? Number(profile.vibe_score).toFixed(1) : '0'}
              </p>
              <p className="text-sm text-gray-500">Vibe Score</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">
                {profile?.total_points || 0}
              </p>
              <p className="text-sm text-gray-500">Total Points</p>
            </div>
          </div>
        </div>

        {/* Profile info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">Profile Information</h2>
            {!isEditing && (
              <button
                onClick={handleEdit}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profile URL (slug)</label>
                <div className="flex items-center">
                  <span className="text-gray-500 mr-1">/u/</span>
                  <input
                    type="text"
                    value={formData.slug || ''}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="jane-doe"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                <input
                  type="tel"
                  value={formData.mobile || ''}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GitHub URL</label>
                <input
                  type="url"
                  value={formData.github_url || ''}
                  onChange={(e) => setFormData({ ...formData, github_url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="https://github.com/username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={formData.linkedin_url || ''}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">About Me</label>
                <textarea
                  value={formData.about_me || ''}
                  onChange={(e) => setFormData({ ...formData, about_me: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                <input
                  type="text"
                  value={formData.skills?.join(', ') || ''}
                  onChange={(e) => handleSkillsChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Python, JavaScript, React, Machine Learning"
                />
                <p className="text-xs text-gray-500 mt-1">Comma-separated list of skills</p>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Public Profile</label>
                  <p className="text-xs text-gray-500">Make your profile visible to companies</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_public: !formData.is_public })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    formData.is_public ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.is_public ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="text-gray-900">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Name</dt>
                <dd className="text-gray-900">{profile?.name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Profile URL</dt>
                <dd className="text-gray-900">
                  {profile?.slug ? (
                    <a
                      href={`/u/${profile.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      /u/{profile.slug}
                    </a>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Mobile</dt>
                <dd className="text-gray-900">{profile?.mobile || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">GitHub</dt>
                <dd>
                  {profile?.github_url ? (
                    <a
                      href={profile.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      {profile.github_url}
                    </a>
                  ) : (
                    '-'
                  )}
                  {profile?.github_verified && (
                    <span className="ml-2 text-green-600 text-xs">Verified</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">LinkedIn</dt>
                <dd>
                  {profile?.linkedin_url ? (
                    <a
                      href={profile.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      {profile.linkedin_url}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
              </div>
              {profile?.about_me && (
                <div>
                  <dt className="text-sm text-gray-500">About</dt>
                  <dd className="text-gray-900">{profile.about_me}</dd>
                </div>
              )}
              {profile?.skills && profile.skills.length > 0 && (
                <div>
                  <dt className="text-sm text-gray-500 mb-1">Skills</dt>
                  <dd className="flex flex-wrap gap-1">
                    {profile.skills.map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-sm">
                        {skill}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mt-4">
                <div>
                  <dt className="text-sm font-medium text-gray-700">Public Profile</dt>
                  <dd className="text-xs text-gray-500">
                    {profile?.is_public
                      ? 'Your profile is visible to companies'
                      : 'Your profile is private'}
                  </dd>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    profile?.is_public
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {profile?.is_public ? 'Public' : 'Private'}
                </span>
              </div>
            </dl>
          )}
        </div>

        {/* Resume section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Resume</h2>
          {profile?.resume_filename ? (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{profile.resume_filename}</p>
                <p className="text-sm text-gray-500">Uploaded resume</p>
              </div>
              <a
                href={`/api/v1/files/${profile.resume_file_path}`}
                download={profile.resume_filename}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Download
              </a>
            </div>
          ) : (
            <p className="text-gray-500">No resume uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

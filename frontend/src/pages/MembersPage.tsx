/**
 * Members management page.
 * Allows admins to view and manage organization members.
 */

import { useState } from 'react';
import { useOrganizationMembers, useRemoveMember, useUpdateMember } from '../hooks/useOrganizations';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/layout/Header';
import type { OrganizationMember } from '../types/api';

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  reviewer: 'bg-green-100 text-green-800',
  candidate: 'bg-gray-100 text-gray-800',
};

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  reviewer: 'Reviewer',
  candidate: 'Candidate',
};

export default function MembersPage() {
  const { user } = useAuth();
  const { data: members, isLoading, error } = useOrganizationMembers();
  const removeMember = useRemoveMember();
  const updateMember = useUpdateMember();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateMember.mutateAsync({ userId, role: newRole });
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the organization?`)) return;
    try {
      await removeMember.mutateAsync(userId);
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load members. Please try again.
          </div>
        ) : !members || members.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No members found.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {members.map((member: OrganizationMember) => (
                  <tr key={member.user_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {member.name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === member.user_id ? (
                        <select
                          className="text-sm border rounded px-2 py-1"
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          autoFocus
                        >
                          <option value="admin">Admin</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="candidate">Candidate</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            roleColors[member.role] || roleColors.candidate
                          }`}
                        >
                          {roleLabels[member.role] || member.role}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(member.joined_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.role !== 'owner' && member.user_id !== user?.id && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(member.user_id)}
                            className="text-primary-600 hover:text-primary-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemove(member.user_id, member.name || member.email)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

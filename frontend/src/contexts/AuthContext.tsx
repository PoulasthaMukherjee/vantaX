/**
 * Authentication context provider.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthChange } from '../lib/firebase';
import { authAPI, setCurrentOrganization } from '../lib/api';
import type { AuthUser, UserOrganization } from '../types/api';

interface AuthContextType {
  user: AuthUser | null;
  firebaseUser: User | null;
  organizations: UserOrganization[];
  currentOrg: UserOrganization | null;
  isLoading: boolean;
  isAdmin: boolean;
  setCurrentOrg: (org: UserOrganization | null) => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<UserOrganization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const e2eTestMode =
    import.meta.env.VITE_E2E_TEST_MODE === 'true' || import.meta.env.VITE_AUTH_MODE === 'mock';

  // Fetch user data from API
  const fetchUserData = async () => {
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
      setOrganizations(data.organizations);

      // Auto-select first org if none selected or current not in list
      if (data.organizations.length > 0) {
        const savedOrgId = localStorage.getItem('currentOrgId');
        const savedOrg = data.organizations.find(o => o.organization_id === savedOrgId);
        const currentInList = currentOrg && data.organizations.find(o => o.organization_id === currentOrg.organization_id);

        if (!currentInList) {
          const org = savedOrg || data.organizations[0];
          setCurrentOrgState(org);
          setCurrentOrganization(org.organization_id);
        }
      }
      return data;
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      setUser(null);
      setOrganizations([]);
      throw error;
    }
  };

  // Listen to Firebase auth state
  useEffect(() => {
    if (e2eTestMode) {
      (async () => {
        try {
          await fetchUserData();
        } catch {
          // Keep user logged out if no mock API is configured.
        } finally {
          setIsLoading(false);
        }
      })();

      return () => {};
    }

    const unsubscribe = onAuthChange(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        await fetchUserData();
      } else {
        setUser(null);
        setOrganizations([]);
        setCurrentOrgState(null);
        setCurrentOrganization(null);
        // Clear all queries on logout
        queryClient.clear();
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  // Update current org
  const setCurrentOrg = (org: UserOrganization | null) => {
    setCurrentOrgState(org);
    if (org) {
      setCurrentOrganization(org.organization_id);
      localStorage.setItem('currentOrgId', org.organization_id);
      // Invalidate org-specific queries when switching
      queryClient.invalidateQueries();
    } else {
      setCurrentOrganization(null);
      localStorage.removeItem('currentOrgId');
    }
  };

  // Refresh auth data
  const refreshAuth = async () => {
    if (firebaseUser) {
      await fetchUserData();
    }
  };

  // Compute isAdmin
  const isAdmin = currentOrg?.role === 'admin' || currentOrg?.role === 'owner';

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        organizations,
        currentOrg,
        isLoading,
        isAdmin,
        setCurrentOrg,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

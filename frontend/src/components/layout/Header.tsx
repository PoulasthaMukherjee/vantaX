/**
 * Main header component with navigation and user menu.
 */

import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../lib/firebase';
import OrganizationSwitcher from './OrganizationSwitcher';

interface NavItem {
  label: string;
  href: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Events', href: '/events' },
  { label: 'Assessments', href: '/assessments' },
  { label: 'Submissions', href: '/submissions' },
  { label: 'Talent', href: '/talent', adminOnly: true },
  { label: 'Members', href: '/members', adminOnly: true },
  { label: 'Settings', href: '/settings', adminOnly: true },
];

export default function Header() {
  const { user, currentOrg } = useAuth();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentOrg?.role === 'admin' || currentOrg?.role === 'owner' || currentOrg?.role === 'reviewer';

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Logo + Org Switcher */}
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-xl font-bold text-primary-600">
              Vibe
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <OrganizationSwitcher />
          </div>

          {/* Center: Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems
              .filter(item => !item.adminOnly || isAdmin)
              .map((item) => {
                const isActive = location.pathname === item.href ||
                  location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          {/* Right: User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.name || 'User'}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                {user?.name || user?.email}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User className="w-4 h-4" />
                  Your Profile
                </Link>

                {isAdmin && (
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                )}

                <div className="border-t border-gray-100 my-1" />

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

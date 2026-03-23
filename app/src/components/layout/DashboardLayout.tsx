import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, UserCircle2, User, CreditCard, ChevronDown } from 'lucide-react';

interface DashboardLayoutProps {
  onOpenProfile?: () => void;
  onOpenPayment?: () => void;
}

// We use a context so DashboardPage can register its open handlers
import { createContext, useContext } from 'react';
export const DashboardModalContext = createContext<{
  openProfile: () => void;
  openPayment: () => void;
  setHandlers: (p: () => void, pay: () => void) => void;
}>({
  openProfile: () => {},
  openPayment: () => {},
  setHandlers: () => {},
});

export function useDashboardModal() {
  return useContext(DashboardModalContext);
}

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handlers registered by DashboardPage
  const [handlers, setInternalHandlers] = useState<{ openProfile: () => void; openPayment: () => void }>({
    openProfile: () => {},
    openPayment: () => {},
  });

  const setHandlers = (openProfile: () => void, openPayment: () => void) => {
    setInternalHandlers({ openProfile, openPayment });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const handleOpenProfile = () => {
    setDropdownOpen(false);
    handlers.openProfile();
  };

  const handleOpenPayment = () => {
    setDropdownOpen(false);
    handlers.openPayment();
  };

  // Initials from email for avatar
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'ME';

  return (
    <DashboardModalContext.Provider value={{
      openProfile: handlers.openProfile,
      openPayment: handlers.openPayment,
      setHandlers,
    }}>
      <div className="min-h-screen bg-bg flex flex-col">
        {/* Topbar */}
        <header className="border-b border-border bg-[#0a0a0e]">
          <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2 group text-purple-500 text-lg font-medium">
              <span>~/vantax</span>
              <span
                className="inline-block h-[0.9em] w-[0.55em] bg-gold-500 animate-blink align-middle"
                aria-hidden="true"
              >
              </span>
            </Link>

            {/* Right side: profile dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 border border-border hover:border-purple-500/60 transition-colors bg-card"
                aria-label="Profile menu"
              >
                {/* Avatar circle */}
                <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-xs font-bold text-purple-300">
                  {initials}
                </div>
                <ChevronDown
                  size={14}
                  className={`text-text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-[#0f0f14] border border-border shadow-xl z-50">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-text-muted truncate">{user?.email}</p>
                  </div>

                  {/* Actions */}
                  <div className="py-1">
                    <button
                      onClick={handleOpenProfile}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
                    >
                      <User size={14} className="text-purple-400 shrink-0" />
                      Update Profile
                    </button>

                    <button
                      onClick={handleOpenPayment}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
                    >
                      <CreditCard size={14} className="text-gold-500 shrink-0" />
                      Activate Account
                    </button>

                    <div className="border-t border-border my-1" />

                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-text-muted hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <LogOut size={14} className="shrink-0" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </DashboardModalContext.Provider>
  );
}

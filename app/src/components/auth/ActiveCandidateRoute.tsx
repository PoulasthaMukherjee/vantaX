import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getMe } from '../../lib/api';

export default function ActiveCandidateRoute() {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const me = await getMe();
        const profile = me?.profile;
        const isActive = profile?.accountStatus === 'active' && profile?.paymentStatus === 'completed';
        if (mounted) {
          setActive(Boolean(isActive));
        }
      } catch {
        if (mounted) {
          setActive(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <span className="text-purple-500 text-[16px] animate-pulse">loading...</span>
      </div>
    );
  }

  if (!active) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

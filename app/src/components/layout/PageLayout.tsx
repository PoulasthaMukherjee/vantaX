import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

export default function PageLayout() {
  const { pathname, hash } = useLocation();

  // Scroll to top on route change, or to hash target if present
  useEffect(() => {
    if (hash) {
      // Small delay to let the page render before scrolling to anchor
      const timer = setTimeout(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return (
    <div className="min-h-screen bg-bg relative">
      {/* Scanline overlay */}
      <div className="scanline-overlay" />

      {/* Subtle grid pattern */}
      <div className="grid-pattern" />

      {/* Radial purple vignette */}
      <div className="radial-vignette" />

      <Navbar />
      <main className="pt-14 relative z-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

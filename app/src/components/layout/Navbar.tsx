import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const links = [
  { to: '/what-is-vantax', label: '--what-is-vantax' },
  { to: '/companies', label: '--companies' },
  { to: '/jury', label: '--join-as-jury' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled ? 'glass border-b border-border' : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1000px] mx-auto px-4 sm:px-8 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2 group text-purple-500 text-lg font-medium">
          <span>~/vantax</span>
          <span
            className="inline-block h-[0.9em] w-[0.55em] bg-gold-500 animate-blink align-middle"
            aria-hidden="true"
          >
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-[16px] transition-colors hover:text-gold-500 ${
                location.pathname === l.to ? 'text-gold-500' : 'text-text-muted'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/#register"
            className="px-4 py-1.5 text-[16px] font-bold text-bg bg-gold-500 hover:bg-gold-400 transition-colors"
          >
            --register
          </Link>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-text-muted" onClick={() => setOpen(!open)} aria-label="Toggle navigation menu" aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden glass border-t border-border px-4 pb-4">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`block py-3 text-[16px] border-b border-border ${
                location.pathname === l.to ? 'text-gold-500' : 'text-text-muted'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/#register"
            className="block mt-3 text-center px-4 py-2 text-[16px] font-bold text-bg bg-gold-500"
          >
            --register
          </Link>
        </div>
      )}
    </nav>
  );
}

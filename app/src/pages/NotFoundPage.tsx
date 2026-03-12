import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

export default function NotFoundPage() {
  return (
    <>
      <SEO
        title="Page Not Found | VantaX 2026"
        description="The page you're looking for doesn't exist."
        path="/404"
        noindex
      />
      <section className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-[16px] text-text-muted mb-4">
          <span className="text-purple-500">{'$ '}</span>
          vantax --navigate
        </p>
        <p className="text-6xl font-bold text-gold-500 mb-4">404</p>
        <h1 className="text-xl font-bold mb-3">
          <span className="text-purple-500">{'// '}</span>Page not found
        </h1>
        <p className="text-text-muted text-[16px] mb-8 max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="px-6 py-3 text-[16px] font-bold uppercase tracking-wider bg-gold-500 text-bg hover:bg-gold-400 transition-colors"
        >
          cd ~/home
        </Link>
      </section>
    </>
  );
}

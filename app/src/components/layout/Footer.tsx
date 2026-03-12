import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4 text-center">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-6 mb-4 text-[16px] text-text-muted">
          <Link to="/what-is-vantax" className="hover:text-gold-500 transition-colors">--what-is-vantax</Link>
          <Link to="/companies" className="hover:text-gold-500 transition-colors">--companies</Link>
          <Link to="/jury" className="hover:text-gold-500 transition-colors">--join-as-jury</Link>
          <a href="mailto:hello@vantahire.com" className="hover:text-gold-500 transition-colors">hello@vantahire.com</a>
        </div>
        <p className="text-text-muted text-[16px]">
          <span className="text-purple-500">{'// '}</span>
          vantax@2026 &middot; powered by{' '}
          <a
            href="https://vantahire.com/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gold-500 transition-colors"
          >
            vantahire
          </a>{' '}
          &middot; Bangalore, India &middot; &copy; {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

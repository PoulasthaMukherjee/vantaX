import { Link } from 'react-router-dom';
import PixelFooterCanvas from './PixelFooterCanvas';

export default function Footer() {
  return (
    <footer className="border-t border-border text-center">
      <PixelFooterCanvas />
      <div className="py-8 px-4">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-6 mb-4 text-[16px] text-text-muted">
          <Link to="/what-is-vantax" className="hover:text-gold-500 transition-colors py-2">--what-is-vantax</Link>
          <Link to="/companies" className="hover:text-gold-500 transition-colors py-2">--companies</Link>
          <Link to="/jury" className="hover:text-gold-500 transition-colors py-2">--join-as-jury</Link>
          <a href="mailto:hello@vantahire.com" className="hover:text-gold-500 transition-colors py-2">hello@vantahire.com</a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 mb-4 text-[14px] text-text-muted/60">
          <Link to="/privacy" className="hover:text-gold-500 transition-colors py-2">Privacy</Link>
          <Link to="/terms" className="hover:text-gold-500 transition-colors py-2">Terms</Link>
          <Link to="/refund" className="hover:text-gold-500 transition-colors py-2">Refunds</Link>
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
          &middot;{' '}
          <a
            href="https://www.airevolabs.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gold-500 transition-colors"
          >
            Airevolabs LLP
          </a>{' '}
          &middot; Bangalore, India &middot; &copy; {new Date().getFullYear()}
        </p>
      </div>
      </div>
    </footer>
  );
}

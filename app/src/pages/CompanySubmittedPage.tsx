import { Link, useParams } from 'react-router-dom';
import SEO from '../components/SEO';
import FadeInOnScroll from '../components/motion/FadeInOnScroll';

export default function CompanySubmittedPage() {
  const { id } = useParams();

  return (
    <>
      <SEO
        title="Draft Submitted | VantaX 2026"
        description="Your VantaX hiring audition draft has been submitted for review."
        path={`/companies/submitted/${id ?? ''}`}
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'For Companies', path: '/companies' },
          { name: 'Submitted', path: `/companies/submitted/${id ?? ''}` },
        ]}
      />

      <section className="py-24 px-4 min-h-[70vh]">
        <div className="max-w-2xl mx-auto">
          <FadeInOnScroll>
            <div className="bg-card border border-border p-10 text-center">
              <p className="text-[16px] font-bold uppercase tracking-wider text-gold-500 mb-4">
                <span className="text-purple-500">{'// '}</span>Submitted
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold mb-4">Your hiring audition draft is now under review.</h1>
              <p className="text-[16px] text-text-secondary leading-relaxed mb-8">
                We have stored your draft and queued it for review. Our team will tighten scope where needed and follow up with next steps.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link to="/companies" className="text-gold-500 hover:text-gold-400 transition-colors">
                  Back to companies &rarr;
                </Link>
                <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
                  Go to homepage &rarr;
                </Link>
              </div>
            </div>
          </FadeInOnScroll>
        </div>
      </section>
    </>
  );
}

import { Link } from 'react-router-dom';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';

export default function StartAuditionCTA() {
  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 sm:p-12 text-center">
          <p className="text-[16px] font-bold uppercase tracking-wider text-gold-500 mb-4">
            <span className="text-purple-500">{'// '}</span>Start the Draft Flow
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Verify your work email. Share your hiring context. Review your AI-generated draft.
          </h2>
          <p className="text-[16px] text-text-secondary max-w-2xl mx-auto mb-8">
            VantaX turns your company context into an AI-assisted hiring audition draft. You edit it,
            approve it, and submit it for review.
          </p>
          <Link
            to="/companies/start"
            className="px-6 py-3 font-bold text-[16px] uppercase tracking-wider transition-all bg-gold-500 text-bg hover:bg-gold-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] animate-glow-pulse inline-block"
          >
            Run a Hiring Audition
          </Link>
        </div>
      </FadeInOnScroll>
    </section>
  );
}

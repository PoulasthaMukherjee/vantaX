import { Link } from 'react-router-dom';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import Button from '../../components/ui/Button';

export default function StartAuditionCTA() {
  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 sm:p-12 text-center">
          <p className="text-[16px] font-bold uppercase tracking-wider text-gold-500 mb-4">
            <span className="text-purple-500">{'// '}</span>Start the Draft Flow
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Verify your work email. Share the hiring context. Review the generated audition.
          </h2>
          <p className="text-[16px] text-text-secondary max-w-2xl mx-auto mb-8">
            VantaX turns your company context into a structured hiring audition draft. You edit it, approve it, and submit it for review.
          </p>
          <Link to="/companies/start">
            <Button className="animate-glow-pulse">Run a Hiring Audition</Button>
          </Link>
        </div>
      </FadeInOnScroll>
    </section>
  );
}

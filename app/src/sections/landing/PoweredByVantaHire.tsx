import { CheckCircle2 } from 'lucide-react';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import { POWERED_BY_POINTS } from '../../lib/constants';

export default function PoweredByVantaHire() {
  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 sm:p-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-purple-500 text-[16px]">{'// '}</span>
            <a
              href="https://vantahire.com/"
              target="_blank"
              rel="noreferrer"
              className="text-xl font-bold text-purple-400 hover:text-gold-500 transition-colors"
            >
              Powered by VantaHire
            </a>
          </div>

          <p className="text-text-secondary text-[16px] leading-relaxed max-w-xl mx-auto mb-8">
            <a
              href="https://vantahire.com/"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:text-gold-500 transition-colors"
            >
              VantaHire
            </a>{' '}
            is building the infrastructure for skills-first talent discovery in India. VantaX is our
            first execution-scored assessment — designed to create a verified, performance-ranked
            early-career talent pool connected directly to companies ready to hire.
          </p>

          <ul className="flex flex-col gap-3 max-w-md mx-auto mb-8 text-left">
            {POWERED_BY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-gold-500 mt-0.5 shrink-0" />
                <span className="text-[16px] text-text-secondary">{point}</span>
              </li>
            ))}
          </ul>

          <p className="text-[16px] text-text-muted italic">
            Human decisions, AI acceleration.
          </p>
        </div>
      </FadeInOnScroll>
    </section>
  );
}

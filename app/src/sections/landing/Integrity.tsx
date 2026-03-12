import { KeyRound, ScanSearch, MessageSquareText, Shuffle, UserCheck, CheckCircle2, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SectionHeader from '../../components/ui/SectionHeader';
import Card from '../../components/ui/Card';
import StaggerContainer from '../../components/motion/StaggerContainer';
import StaggerItem from '../../components/motion/StaggerItem';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import { INTEGRITY_ITEMS, SCORING_DETAILS } from '../../lib/constants';

const iconMap: Record<string, LucideIcon> = { KeyRound, ScanSearch, MessageSquareText, Shuffle, UserCheck };

export default function Integrity() {
  const topRowItems = INTEGRITY_ITEMS.slice(0, 3);
  const bottomRowItems = INTEGRITY_ITEMS.slice(3);

  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="Integrity"
        title="Rigorous by design. Transparent by default."
        lead="Every submission is evaluated with multi-layer checks — so results are credible, comparable, and fair."
      />

      <StaggerContainer className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
        {topRowItems.map((item) => {
          const Icon = iconMap[item.icon] || Circle;
          return (
            <StaggerItem key={item.title} className="h-full">
              <Card className="h-full">
                <div className="w-8 h-8 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-purple-400" />
                </div>
                <h3 className="text-[16px] font-bold mb-2">{item.title}</h3>
                <p className="text-[16px] text-text-secondary leading-relaxed">{item.description}</p>
              </Card>
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      <StaggerContainer className="grid grid-cols-1 gap-4 md:grid-cols-2 md:max-w-[668px] md:mx-auto mb-12">
        {bottomRowItems.map((item) => {
          const Icon = iconMap[item.icon] || Circle;
          return (
            <StaggerItem key={item.title} className="h-full">
              <Card className="h-full">
                <div className="w-8 h-8 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-purple-400" />
                </div>
                <h3 className="text-[16px] font-bold mb-2">{item.title}</h3>
                <p className="text-[16px] text-text-secondary leading-relaxed">{item.description}</p>
              </Card>
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 max-w-2xl mx-auto">
          <h3 className="text-[16px] font-bold mb-4 text-gold-500">
            <span className="text-purple-500">{'// '}</span>Scoring Methodology
          </h3>
          <ul className="space-y-3">
            {SCORING_DETAILS.map((detail) => (
              <li key={detail} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
                <span className="text-[16px] text-text-secondary">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </FadeInOnScroll>
    </section>
  );
}

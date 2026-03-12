import SectionHeader from '../../components/ui/SectionHeader';
import RubricBar from '../../components/ui/RubricBar';
import StaggerContainer from '../../components/motion/StaggerContainer';
import StaggerItem from '../../components/motion/StaggerItem';
import { RUBRIC_DATA } from '../../lib/constants';

export default function Rubric() {
  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="Scoring"
        title="Transparent scoring. No guesswork."
        lead="All submissions go through multi-stage scoring: AI pre-score, integrity checks, and human moderation on a standardized rubric. Top performers get shortlisted for interviews."
      />

      <StaggerContainer className="flex flex-col gap-px" staggerDelay={0.08}>
        {RUBRIC_DATA.map((item) => (
          <StaggerItem key={item.label}>
            <RubricBar {...item} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}

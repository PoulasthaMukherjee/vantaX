import SectionHeader from '../../components/ui/SectionHeader';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import Card from '../../components/ui/Card';

export default function ProblemTypes() {
  const examples = [
    {
      label: 'Backend',
      problem: 'Design a job queue system handling 1M tasks per day.',
    },
    {
      label: 'AI / ML',
      problem: 'Build a document retrieval system for knowledge search.',
    },
    {
      label: 'Frontend',
      problem: 'Create a monitoring dashboard for system metrics.',
    },
  ];

  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="Example Problems"
        title="Examples of the kinds of problems companies can submit."
        lead="Share one real engineering or product problem. VantaX scopes it into a structured audition rather than asking your team to design an assessment from scratch."
      />

      <FadeInOnScroll>
        <div className="grid gap-4 md:grid-cols-3">
          {examples.map((example) => (
            <Card key={example.label} className="h-full">
              <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">{example.label}</p>
              <p className="mt-3 text-[16px] text-text-primary leading-relaxed">{example.problem}</p>
            </Card>
          ))}
        </div>
      </FadeInOnScroll>
    </section>
  );
}

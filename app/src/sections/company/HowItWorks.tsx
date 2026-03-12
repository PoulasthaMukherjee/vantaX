import SectionHeader from '../../components/ui/SectionHeader';
import Card from '../../components/ui/Card';
import StaggerContainer from '../../components/motion/StaggerContainer';
import StaggerItem from '../../components/motion/StaggerItem';

export default function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Submit One Problem',
      description:
        'Share a real engineering or product problem related to the role you are hiring for. We use that as the basis for the audition.',
    },
    {
      step: '02',
      title: 'VantaX Converts It into 3 Rounds',
      description:
        'We structure your problem into a hiring audition with progressive filtering, clear scoring, and comparable evaluation.',
    },
    {
      step: '03',
      title: 'Meet the Best Candidates',
      description:
        'You review 3-5 finalists who solved your problem and decide who moves forward to interviews.',
    },
  ];

  const rounds = [
    {
      round: 'Round 1',
      title: 'Skill Screening',
      description: 'Candidates solve a short challenge testing core skills for the role.',
      example: 'Example: implement a simple rate limiter.',
    },
    {
      round: 'Round 2',
      title: 'Problem Build',
      description: 'Candidates work on a deeper part of the company problem under real constraints.',
      example: 'Example: build a scalable rate-limiting service.',
    },
    {
      round: 'Round 3',
      title: 'Solution Presentation',
      description: 'Top candidates present architecture, design decisions, and tradeoffs.',
      example: 'Your team attends only this round.',
    },
  ];

  const companyInputs = [
    'Share one problem',
    'Specify the skills and tech stack',
    'Attend the final presentation round',
  ];

  const vantaxHandles = [
    'Challenge structuring',
    'Candidate screening',
    'Evaluation rounds',
    'Shortlisting finalists',
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="How It Works"
        title="One company problem - three audition rounds - top candidates for interview"
        lead="VantaX runs the hiring audition for you. Your team stays focused on finalists instead of screening volume."
      />

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-px">
        {steps.map((item) => (
          <StaggerItem key={item.step}>
            <Card>
              <div className="text-2xl font-bold text-purple-500/20 mb-3">{item.step}</div>
              <h3 className="text-[16px] font-bold">{item.title}</h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">{item.description}</p>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {rounds.map((round) => (
          <Card key={round.round} className="h-full">
            <p className="text-[12px] font-bold uppercase tracking-widest text-gold-500">{round.round}</p>
            <h3 className="mt-2 text-[16px] font-bold">{round.title}</h3>
            <p className="mt-3 text-[13px] text-text-secondary leading-relaxed">{round.description}</p>
            <p className="mt-3 text-[12px] text-text-muted italic">{round.example}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-[12px] font-bold uppercase tracking-widest text-gold-500">Your Involvement</p>
          <h3 className="mt-2 text-lg font-bold">Minimal effort from your side.</h3>
          <ul className="mt-5 space-y-3">
            {companyInputs.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13px] text-text-secondary">
                <span className="mt-0.5 text-success">✔</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="text-[12px] font-bold uppercase tracking-widest text-purple-400">VantaX Handles</p>
          <h3 className="mt-2 text-lg font-bold">We run the audition for you.</h3>
          <ul className="mt-5 space-y-3">
            {vantaxHandles.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13px] text-text-secondary">
                <span className="mt-0.5 text-gold-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}

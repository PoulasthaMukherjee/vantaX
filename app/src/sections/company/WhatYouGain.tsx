import SectionHeader from '../../components/ui/SectionHeader';
import Card from '../../components/ui/Card';

export default function WhatYouGain() {
  const partnerInputs = [
    'Share one real problem',
    'Specify the skills and tech stack',
    'Attend the final presentation round',
  ];

  const outcomes = [
    'Candidates solving real problems from your company',
    'Pre-screened talent',
    'Faster hiring',
    'Only meet top candidates',
  ];

  return (
    <section className="py-20 px-4 max-w-[1000px] mx-auto">
      <SectionHeader
        label="Partner Fit"
        title="Designed to feel lighter than your current screening process."
        lead="The company workload is intentionally small. The output is a much stronger hiring signal than resumes, take-homes, or early screening calls."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <p className="text-[12px] font-bold uppercase tracking-widest text-gold-500">You Only Need To</p>
          <ul className="mt-5 space-y-3">
            {partnerInputs.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13px] text-text-secondary">
                <span className="mt-0.5 text-success">✔</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="h-full">
          <p className="text-[12px] font-bold uppercase tracking-widest text-purple-400">What You Get</p>
          <ul className="mt-5 space-y-3">
            {outcomes.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13px] text-text-secondary">
                <span className="mt-0.5 text-gold-500">✔</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-8 text-[12px] text-text-muted text-center italic max-w-2xl mx-auto">
        <span className="text-purple-500">{'// '}</span>
        Position this as a hiring audition, not a hackathon. The lighter the company workload feels, the higher your conversion rate.
      </p>
    </section>
  );
}

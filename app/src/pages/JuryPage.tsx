import SEO from '../components/SEO';
import JuryHero from '../sections/jury/JuryHero';
import WhyFormat from '../sections/jury/WhyFormat';
import YourRole from '../sections/jury/YourRole';
import TimeCommitment from '../sections/jury/TimeCommitment';
import EvalCriteria from '../sections/jury/EvalCriteria';
import WhyParticipate from '../sections/jury/WhyParticipate';
import SignupForm from '../sections/jury/SignupForm';

export default function JuryPage() {
  return (
    <>
      <SEO
        title="Join the Jury — Review Real-World Submissions | VantaX 2026"
        description="Become a VantaX jury member. Review top submissions from early-career builders solving real business problems. Help identify who gets shortlisted."
        path="/jury"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Jury', path: '/jury' },
        ]}
      />
      <JuryHero />
      <WhyFormat />
      <YourRole />
      <TimeCommitment />
      <EvalCriteria />
      <WhyParticipate />
      <SignupForm />
    </>
  );
}

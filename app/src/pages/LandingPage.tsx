import SEO from '../components/SEO';
import Hero from '../sections/landing/Hero';
import Stats from '../sections/landing/Stats';
import Format from '../sections/landing/Format';
import SubmissionFormat from '../sections/landing/SubmissionFormat';
import Rubric from '../sections/landing/Rubric';
import TimelineSection from '../sections/landing/TimelineSection';
import CTA from '../sections/landing/CTA';
import RegistrationForm from '../sections/landing/RegistrationForm';
import PoweredByVantaHire from '../sections/landing/PoweredByVantaHire';

export default function LandingPage() {
  return (
    <>
      <SEO
        title="VantaX 2026 — 3 Challenges. 2 Hours Each. | India's Hiring Audition"
        description="India's first structured hiring audition. 3 challenges, 2 hours each. Real companies post real problems. You solve them. Top performers are introduced to partner companies. Starts April 2026."
        path="/"
        breadcrumbs={[{ name: 'Home', path: '/' }]}
      />
      <Hero />
      <Stats />
      <Format />
      <SubmissionFormat />
      <Rubric />
      <TimelineSection />
      <CTA />
      <RegistrationForm />
      <PoweredByVantaHire />
    </>
  );
}

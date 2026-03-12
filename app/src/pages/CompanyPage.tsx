import SEO from '../components/SEO';
import CompanyHero from '../sections/company/CompanyHero';
import WhyCompanies from '../sections/landing/WhyCompanies';
import HowItWorks from '../sections/company/HowItWorks';
import ProblemTypes from '../sections/company/ProblemTypes';
import WhyAI from '../sections/company/WhyAI';
import EvalFramework from '../sections/company/EvalFramework';
import WhatYouGain from '../sections/company/WhatYouGain';
import StartAuditionCTA from '../sections/company/StartAuditionCTA';

export default function CompanyPage() {
  return (
    <>
      <SEO
        title="For Companies — Hire Engineers by Seeing Them Solve Your Problem | VantaX 2026"
        description="Share one real company problem. VantaX converts it into a hiring audition, screens candidates, and brings you the top finalists to interview."
        path="/companies"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'For Companies', path: '/companies' },
        ]}
      />
      <CompanyHero />
      <WhyCompanies />
      <HowItWorks />
      <ProblemTypes />
      <WhyAI />
      <EvalFramework />
      <WhatYouGain />
      <StartAuditionCTA />
    </>
  );
}

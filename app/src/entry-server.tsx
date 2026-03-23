import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import type { HelmetServerState } from 'react-helmet-async';
import { Routes, Route } from 'react-router-dom';
import PageLayout from './components/layout/PageLayout';

// Eagerly import all pages for SSR (no lazy loading on server)
import LandingPage from './pages/LandingPage';
import WhatIsVantaXPage from './pages/WhatIsVantaXPage';
import CompanyPage from './pages/CompanyPage';
import CompanyStartPage from './pages/CompanyStartPage';
import CompanyDraftPage from './pages/CompanyDraftPage';
import CompanySubmittedPage from './pages/CompanySubmittedPage';
import JuryPage from './pages/JuryPage';
import AdminPage from './pages/AdminPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import NotFoundPage from './pages/NotFoundPage';

function ServerApp() {
  return (
    <Routes>
      <Route element={<PageLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/what-is-vantax" element={<WhatIsVantaXPage />} />
        <Route path="/companies" element={<CompanyPage />} />
        <Route path="/companies/start" element={<CompanyStartPage />} />
        <Route path="/companies/draft/:id" element={<CompanyDraftPage />} />
        <Route path="/companies/submitted/:id" element={<CompanySubmittedPage />} />
        <Route path="/jury" element={<JuryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/refund" element={<RefundPolicyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function render(url: string): { html: string; helmet: HelmetServerState | undefined } {
  const helmetContext: { helmet?: HelmetServerState } = {};

  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={url}>
        <ServerApp />
      </StaticRouter>
    </HelmetProvider>
  );

  return { html, helmet: helmetContext.helmet };
}

import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import PageLayout from './components/layout/PageLayout';
import LandingPage from './pages/LandingPage';

// Lazy-load non-landing pages for code splitting
const WhatIsVantaXPage = lazy(() => import('./pages/WhatIsVantaXPage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
const CompanyStartPage = lazy(() => import('./pages/CompanyStartPage'));
const CompanyDraftPage = lazy(() => import('./pages/CompanyDraftPage'));
const CompanySubmittedPage = lazy(() => import('./pages/CompanySubmittedPage'));
const JuryPage = lazy(() => import('./pages/JuryPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><span className="text-purple-500 text-[16px] animate-pulse">loading...</span></div>}>
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
    </Suspense>
  );
}

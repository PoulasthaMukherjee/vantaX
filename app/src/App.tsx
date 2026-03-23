import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import PageLayout from './components/layout/PageLayout';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './components/layout/DashboardLayout';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ActiveCandidateRoute from './components/auth/ActiveCandidateRoute';

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

// New lazy loaded components
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

// Placeholder Pages for Phase 0
const AuditionHomePage = () => <div className="p-8 text-white">Audition Home (WIP)</div>;
const AuditionRoundPage = () => <div className="p-8 text-white">Audition Round (WIP)</div>;
const LeaderboardPage = () => <div className="p-8 text-white">Leaderboard (WIP)</div>;
const ReviewerQueuePage = () => <div className="p-8 text-white">Reviewer Queue (WIP)</div>;
const ReviewerDetailPage = () => <div className="p-8 text-white">Reviewer Detail (WIP)</div>;
const AuditionOpsPage = () => <div className="p-8 text-white">Audition Ops (WIP)</div>;
const FinalistsPage = () => <div className="p-8 text-white">Finalists (WIP)</div>;

export default function App() {
  return (
    <AuthProvider>
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

          {/* Candidate Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route element={<ActiveCandidateRoute />}>
                <Route path="/auditions/:slug" element={<AuditionHomePage />} />
                <Route path="/auditions/:slug/round/:roundNumber" element={<AuditionRoundPage />} />
                <Route path="/auditions/:slug/leaderboard" element={<LeaderboardPage />} />
              </Route>
            </Route>
          </Route>

          {/* Admin Protected Routes (also requires auth for now) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/admin/reviews" element={<ReviewerQueuePage />} />
              <Route path="/admin/reviews/:submissionId" element={<ReviewerDetailPage />} />
              <Route path="/admin/auditions/:id" element={<AuditionOpsPage />} />
              <Route path="/admin/auditions/:id/finalists" element={<FinalistsPage />} />
            </Route>
          </Route>

        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

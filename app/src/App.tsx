import { Routes, Route } from 'react-router-dom';
import PageLayout from './components/layout/PageLayout';
import LandingPage from './pages/LandingPage';
import WhatIsVantaXPage from './pages/WhatIsVantaXPage';
import CompanyPage from './pages/CompanyPage';
import CompanyStartPage from './pages/CompanyStartPage';
import CompanyDraftPage from './pages/CompanyDraftPage';
import CompanySubmittedPage from './pages/CompanySubmittedPage';
import JuryPage from './pages/JuryPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

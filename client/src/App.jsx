import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import AppShell from './components/AppShell';
import LoginPage from './components/LoginPage';
import HomePage from './components/HomePage';
import ReqBoardModule from './modules/req-board/ReqBoardModule';
import ReportingModule from './modules/reporting/ReportingModule';
import ReportingHome from './modules/reporting/ReportingHome';
import RecruiterDashboard from './modules/reporting/RecruiterDashboard';
import SalesDashboard from './modules/reporting/SalesDashboard';
import ClientHealthModule from './modules/client-health/ClientHealthModule';
import ComingSoon from './components/ComingSoon';

export default function App() {
  return (
    <>
      <UnauthenticatedTemplate>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="req-board" element={<ReqBoardModule />} />
            <Route path="pipeline" element={<ComingSoon title="Candidate Pipeline" />} />
            <Route path="clients" element={<ClientHealthModule />} />
            <Route path="reporting" element={<ReportingModule />}>
              <Route index element={<ReportingHome />} />
              <Route path="recruiting" element={<RecruiterDashboard />} />
              <Route path="sales" element={<SalesDashboard />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthenticatedTemplate>
    </>
  );
}

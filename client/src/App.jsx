import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import AppShell from './components/AppShell';
import LoginPage from './components/LoginPage';
import HomePage from './components/HomePage';
import ReqBoardModule from './modules/req-board/ReqBoardModule';
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
            <Route path="clients" element={<ComingSoon title="Client Management" />} />
            <Route path="reporting" element={<ComingSoon title="Reporting & Analytics" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthenticatedTemplate>
    </>
  );
}

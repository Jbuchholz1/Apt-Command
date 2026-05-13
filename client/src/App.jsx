import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import AppShell from './components/AppShell';
import LoginPage from './components/LoginPage';
import HomePage from './components/HomePage';
import ReqBoardModule from './modules/req-board/ReqBoardModule';
import IndiaReqBoardModule from './modules/india-req-board/IndiaReqBoardModule';
import GoalTrackingModule from './modules/goal-tracking/GoalTrackingModule';
import ReportingModule from './modules/reporting/ReportingModule';
import ReportingHome from './modules/reporting/ReportingHome';
import RecruiterDashboard from './modules/reporting/RecruiterDashboard';
import SalesDashboard from './modules/reporting/SalesDashboard';
import ExecutiveDashboard from './modules/reporting/ExecutiveDashboard';
import ClientHealthModule from './modules/client-health/ClientHealthModule';
import OrgFlowModule from './modules/org-flow/OrgFlowModule';
import MyDashboard from './modules/performance/MyDashboard';
import PipelineModule from './modules/pipeline/PipelineModule';
import OpportunityPipeline from './modules/pipeline/OpportunityPipeline';
import AdminModule from './modules/admin/AdminModule';
import OperationsModule from './modules/operations/OperationsModule';
import OperationsHome from './modules/operations/OperationsHome';
import OnboardingTracking from './modules/operations/OnboardingTracking';
import COITracking from './modules/operations/COITracking';
import ContractTracking from './modules/operations/ContractTracking';
import ProjectManagementModule from './modules/project-management/ProjectManagementModule';
import ProjectsListView from './modules/project-management/ProjectsListView';
import ProjectBoard from './modules/project-management/ProjectBoard';
import SupportModule from './modules/support/SupportModule';
import SupportHome from './modules/support/SupportHome';
import HelpDocs from './modules/support/HelpDocs';
import FeedbackForm from './modules/support/FeedbackForm';
import SystemStatus from './modules/support/SystemStatus';
import ComingSoon from './components/ComingSoon';
import ErrorBoundary from './components/ErrorBoundary';

const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const IS_SANDBOX = import.meta.env.VITE_ENV === 'sandbox';

function SandboxBanner() {
  if (!IS_SANDBOX) return null;
  return (
    <div
      role="status"
      style={{
        background: '#FFA500',
        color: '#000',
        padding: '6px 12px',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '0.85rem',
        letterSpacing: '0.02em',
      }}
    >
      🟡 SANDBOX — Bullhorn writes are blocked. Local data is isolated from production.
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="req-board" element={<ReqBoardModule />} />
        <Route path="india-req-board" element={<IndiaReqBoardModule />} />
        <Route path="org-flow" element={<OrgFlowModule />} />
        <Route path="pipeline" element={<PipelineModule />}>
          <Route index element={<OpportunityPipeline />} />
        </Route>
        <Route path="clients" element={<ClientHealthModule />} />
        <Route path="reporting" element={<ReportingModule />}>
          <Route index element={<ReportingHome />} />
          <Route path="recruiting" element={<RecruiterDashboard />} />
          <Route path="sales" element={<SalesDashboard />} />
          <Route path="performance" element={<MyDashboard />} />
          <Route path="executive" element={<ExecutiveDashboard />} />
        </Route>
        <Route path="performance" element={<Navigate to="/reporting/performance" replace />} />
        <Route path="goals" element={<GoalTrackingModule />} />
        <Route path="goal-tracking" element={<Navigate to="/goals" replace />} />
        <Route path="support" element={<SupportModule />}>
          <Route index element={<SupportHome />} />
          <Route path="help" element={<HelpDocs />} />
          <Route path="feedback" element={<FeedbackForm />} />
          <Route path="status" element={<SystemStatus />} />

        </Route>
        <Route path="operations" element={<OperationsModule />}>
          <Route index element={<OperationsHome />} />
          <Route path="onboarding" element={<OnboardingTracking />} />
          <Route path="coi" element={<COITracking />} />
          <Route path="contracts" element={<ContractTracking />} />
        </Route>
        <Route path="projects" element={<ProjectManagementModule />}>
          <Route index element={<ProjectsListView />} />
          <Route path=":projectId" element={<ProjectBoard />} />
        </Route>
        <Route path="admin" element={<AdminModule />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (DEV_BYPASS) {
    return (
      <ErrorBoundary>
        <SandboxBanner />
        <AppRoutes />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SandboxBanner />
      <UnauthenticatedTemplate>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <AppRoutes />
      </AuthenticatedTemplate>
    </ErrorBoundary>
  );
}

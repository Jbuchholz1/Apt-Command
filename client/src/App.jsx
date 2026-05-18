import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import HomePage from './components/HomePage';
// Req Board + India Req Board are eager: they're the landing destination
// for ~all users, and adding a Suspense flicker on the most-trafficked
// route would feel worse than the bundle cost. Everything else is lazy.
import ReqBoardModule from './modules/req-board/ReqBoardModule';
import IndiaReqBoardModule from './modules/india-req-board/IndiaReqBoardModule';
import ComingSoon from './components/ComingSoon';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded route modules — code-split per chunk so users who never
// visit these routes don't pay their bytes on initial load.
const GoalTrackingModule = lazy(() => import('./modules/goal-tracking/GoalTrackingModule'));
const ReportingModule = lazy(() => import('./modules/reporting/ReportingModule'));
const ReportingHome = lazy(() => import('./modules/reporting/ReportingHome'));
const RecruiterDashboard = lazy(() => import('./modules/reporting/RecruiterDashboard'));
const SalesDashboard = lazy(() => import('./modules/reporting/SalesDashboard'));
const ExecutiveDashboard = lazy(() => import('./modules/reporting/ExecutiveDashboard'));
const ClientHealthModule = lazy(() => import('./modules/client-health/ClientHealthModule'));
const OrgFlowModule = lazy(() => import('./modules/org-flow/OrgFlowModule'));
const MyDashboard = lazy(() => import('./modules/performance/MyDashboard'));
const PipelineModule = lazy(() => import('./modules/pipeline/PipelineModule'));
const OpportunityPipeline = lazy(() => import('./modules/pipeline/OpportunityPipeline'));
const AdminModule = lazy(() => import('./modules/admin/AdminModule'));
const OperationsModule = lazy(() => import('./modules/operations/OperationsModule'));
const OperationsHome = lazy(() => import('./modules/operations/OperationsHome'));
const OnboardingTracking = lazy(() => import('./modules/operations/OnboardingTracking'));
const COITracking = lazy(() => import('./modules/operations/COITracking'));
const ContractTracking = lazy(() => import('./modules/operations/ContractTracking'));
const ProjectManagementModule = lazy(() => import('./modules/project-management/ProjectManagementModule'));
const ProjectsListView = lazy(() => import('./modules/project-management/ProjectsListView'));
const ProjectBoard = lazy(() => import('./modules/project-management/ProjectBoard'));
const SupportModule = lazy(() => import('./modules/support/SupportModule'));
const SupportHome = lazy(() => import('./modules/support/SupportHome'));
const HelpDocs = lazy(() => import('./modules/support/HelpDocs'));
const FeedbackForm = lazy(() => import('./modules/support/FeedbackForm'));
const SystemStatus = lazy(() => import('./modules/support/SystemStatus'));

function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 0',
        color: '#64748b',
        fontSize: '0.9rem',
      }}
    >
      Loading…
    </div>
  );
}

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
    <Suspense fallback={<RouteFallback />}>
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
    </Suspense>
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
      <RequireAuth>
        <AppRoutes />
      </RequireAuth>
    </ErrorBoundary>
  );
}

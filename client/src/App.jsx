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

// After a deploy, Railway replaces the hashed JS chunks. A tab opened before
// the deploy will 404 when it lazily imports a now-missing chunk, which would
// otherwise crash the whole app to the top-level ErrorBoundary. Wrap lazy() so
// the first such failure triggers a one-time full reload (fetching the new
// index + chunk manifest). A sessionStorage timestamp prevents a reload loop if
// the import is genuinely broken — after the window, the error surfaces to the
// ErrorBoundary as before.
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((err) => {
      const KEY = 'apt:chunkReloadAt';
      let last = 0;
      try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage disabled */ }
      if (Date.now() - last > 10000) {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
        window.location.reload();
        // Keep the Suspense fallback up until the reload takes effect.
        return new Promise(() => {});
      }
      throw err;
    }),
  );
}

// Lazy-loaded route modules — code-split per chunk so users who never
// visit these routes don't pay their bytes on initial load.
const GoalTrackingModule = lazyWithReload(() => import('./modules/goal-tracking/GoalTrackingModule'));
const ReportingModule = lazyWithReload(() => import('./modules/reporting/ReportingModule'));
const ReportingHome = lazyWithReload(() => import('./modules/reporting/ReportingHome'));
const RecruiterDashboard = lazyWithReload(() => import('./modules/reporting/RecruiterDashboard'));
const SalesDashboard = lazyWithReload(() => import('./modules/reporting/SalesDashboard'));
const ExecutiveDashboard = lazyWithReload(() => import('./modules/reporting/ExecutiveDashboard'));
const ClientHealthModule = lazyWithReload(() => import('./modules/client-health/ClientHealthModule'));
const OrgFlowModule = lazyWithReload(() => import('./modules/org-flow/OrgFlowModule'));
const MyDashboard = lazyWithReload(() => import('./modules/performance/MyDashboard'));
const PipelineModule = lazyWithReload(() => import('./modules/pipeline/PipelineModule'));
const OpportunityPipeline = lazyWithReload(() => import('./modules/pipeline/OpportunityPipeline'));
const AdminModule = lazyWithReload(() => import('./modules/admin/AdminModule'));
const OperationsModule = lazyWithReload(() => import('./modules/operations/OperationsModule'));
const OperationsHome = lazyWithReload(() => import('./modules/operations/OperationsHome'));
const OnboardingTracking = lazyWithReload(() => import('./modules/operations/OnboardingTracking'));
const COITracking = lazyWithReload(() => import('./modules/operations/COITracking'));
const ContractTracking = lazyWithReload(() => import('./modules/operations/ContractTracking'));
const ProjectManagementModule = lazyWithReload(() => import('./modules/project-management/ProjectManagementModule'));
const ProjectsListView = lazyWithReload(() => import('./modules/project-management/ProjectsListView'));
const ProjectBoard = lazyWithReload(() => import('./modules/project-management/ProjectBoard'));
const SupportModule = lazyWithReload(() => import('./modules/support/SupportModule'));
const SupportHome = lazyWithReload(() => import('./modules/support/SupportHome'));
const HelpDocs = lazyWithReload(() => import('./modules/support/HelpDocs'));
const FeedbackForm = lazyWithReload(() => import('./modules/support/FeedbackForm'));
const SystemStatus = lazyWithReload(() => import('./modules/support/SystemStatus'));

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

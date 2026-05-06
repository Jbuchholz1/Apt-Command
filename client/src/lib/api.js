import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loginRequest } from './authConfig';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let msalInstance = null;

export function initApi(instance) {
  msalInstance = instance;
}

async function getToken() {
  if (!msalInstance) return null;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.idToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      msalInstance.acquireTokenRedirect(loginRequest);
      return null;
    }
    throw err;
  }
}

// Errors thrown from fetchAPI carry a `.status` property so callers (and the
// shared saveWithToast helper) can branch on it — 409 for version conflicts,
// 429/5xx for retryable transient failures, etc. For 409 in particular we
// also attach the parsed body so the conflict dialog can show the
// current-state fields from the server.
function apiError(message, status, body) {
  const err = new Error(message);
  err.status = status;
  if (body && typeof body === 'object') {
    err.body = body;
    if (body.current !== undefined) err.current = body.current;
    if (body.code) err.code = body.code;
  }
  return err;
}

async function fetchAPI(path, options = {}) {
  const token = await getToken();
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (msalInstance) msalInstance.acquireTokenRedirect(loginRequest);
    throw apiError('Session expired — redirecting to login', 401);
  }

  if (res.status === 429) {
    throw apiError('Too many requests — please wait a moment and try again', 429);
  }

  if (!res.ok) {
    // Try to surface the server's error message; fall back to a generic one.
    let message = `API error: ${res.status} ${res.statusText}`;
    let parsedBody = null;
    try {
      const text = await res.text();
      if (text) {
        try {
          parsedBody = JSON.parse(text);
          if (parsedBody && parsedBody.error) message = parsedBody.error;
        } catch {
          // Non-JSON response — keep the generic message.
        }
      }
    } catch {
      // Body already consumed or unreadable — ignore.
    }
    throw apiError(message, res.status, parsedBody);
  }
  return res.json();
}

// --- Read operations ---

export function getJobs() {
  return fetchAPI('/api/req-board/jobs');
}

export function getAllJobs() {
  return fetchAPI('/api/req-board/jobs/all');
}

export function getJobDetail(id) {
  return fetchAPI(`/api/req-board/jobs/${id}`);
}

export function getPlacements() {
  return fetchAPI('/api/req-board/placements');
}

export function getOfferOutCandidates() {
  return fetchAPI('/api/req-board/jobs/offer-out-candidates');
}

export function getStats() {
  return fetchAPI('/api/req-board/stats');
}

// --- Write operations ---

export function updateJobOverrides(id, data, { expectedVersion } = {}) {
  const headers = {};
  if (expectedVersion !== undefined && expectedVersion !== null) {
    headers['If-Match'] = String(expectedVersion);
  }
  return fetchAPI(`/api/req-board/jobs/${id}/overrides`, {
    method: 'PATCH',
    body: data,
    headers,
  });
}

export function addJobNote(id, comment) {
  return fetchAPI(`/api/req-board/jobs/${id}/notes`, {
    method: 'POST',
    body: { comment },
  });
}

export function updateJobInBullhorn(id, fields) {
  return fetchAPI(`/api/req-board/jobs/${id}/bullhorn-update`, {
    method: 'POST',
    body: { fields },
  });
}

export function getUsers() {
  return fetchAPI('/api/req-board/jobs/users');
}

export function getRecruiters() {
  return fetchAPI('/api/req-board/jobs/users?role=recruiter');
}

export function getAccountManagers() {
  return fetchAPI('/api/req-board/jobs/users?role=account manager');
}

export function getOpportunities() {
  return fetchAPI('/api/req-board/jobs/opportunities');
}

// --- Reporting ---

export function getRecruiterDashboard(startDate, endDate) {
  return fetchAPI(`/api/reporting/recruiter-dashboard?start=${startDate}&end=${endDate}`);
}

export function getSalesDashboard(startDate, endDate) {
  return fetchAPI(`/api/reporting/sales-dashboard?start=${startDate}&end=${endDate}`);
}

export function getTeamAlerts(team) {
  return fetchAPI(`/api/reporting/team-alerts?team=${encodeURIComponent(team)}`);
}

export function getExecutiveDashboard(startDate, endDate) {
  return fetchAPI(`/api/reporting/executive-dashboard?start=${startDate}&end=${endDate}`);
}

export function getExecutiveWeekly(startDate, endDate) {
  return fetchAPI(`/api/reporting/executive-weekly?start=${startDate}&end=${endDate}`);
}

export function getExecutiveMonthly(startDate, endDate) {
  return fetchAPI(`/api/reporting/executive-monthly?start=${startDate}&end=${endDate}`);
}

export function getExecutiveQuarterly(startDate, endDate) {
  return fetchAPI(`/api/reporting/executive-quarterly?start=${startDate}&end=${endDate}`);
}

// --- Universal Search ---

export function searchUniversal({ query, accessToken, signal }) {
  return fetchAPI('/api/search', {
    method: 'POST',
    body: { query, accessToken },
    signal,
  });
}

// --- Individual Performance ---

export function getMyDashboard(startDate, endDate, email) {
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return fetchAPI(`/api/performance/my-dashboard?start=${startDate}&end=${endDate}${emailParam}`);
}

export function getPerformanceUsers() {
  return fetchAPI('/api/performance/users');
}

export function updateOpportunityInBullhorn(id, fields) {
  return fetchAPI(`/api/req-board/jobs/opportunities/${id}/update`, {
    method: 'POST',
    body: { fields },
  });
}

export function convertOpportunityToJob(oppId, body) {
  return fetchAPI(`/api/req-board/jobs/opportunities/${oppId}/convert`, {
    method: 'POST',
    body,
  });
}

export function getClientContactsForCorp(corpId) {
  return fetchAPI(`/api/req-board/jobs/client-contacts?corpId=${encodeURIComponent(corpId)}`);
}

export function updateSubmissionInBullhorn(id, fields) {
  return fetchAPI(`/api/req-board/jobs/submissions/${id}/update`, {
    method: 'POST',
    body: { fields },
  });
}

export function getAnnouncement() {
  return fetchAPI('/api/users/announcement');
}

export function updateAnnouncement(text) {
  return fetchAPI('/api/admin/announcement', {
    method: 'PUT',
    body: { text },
  });
}

// --- Org Flow ---

export function getContractorCounts() {
  return fetchAPI('/api/org-flow/contractor-counts');
}

export function getClientHealthStats() {
  return fetchAPI('/api/org-flow/client-health');
}

// --- Daily Brief (role-aware tiles) ---

export function getCandidatesInPlay() {
  return fetchAPI('/api/dashboard/candidates-in-play');
}

export function getStaleContacts() {
  return fetchAPI('/api/dashboard/am-stale-contacts');
}

export function getLoggedMeetingIds() {
  return fetchAPI('/api/dashboard/logged-meeting-ids');
}

export function matchMeetingAttendees(emails) {
  return fetchAPI('/api/dashboard/match-meeting-attendees', {
    method: 'POST',
    body: { emails },
  });
}

export function logMeetingActivity(payload) {
  return fetchAPI('/api/dashboard/log-meeting-activity', {
    method: 'POST',
    body: payload,
  });
}

// --- User Management ---

export function getCurrentUser() {
  return fetchAPI('/api/users/me');
}

export function getAdminUsers() {
  return fetchAPI('/api/admin/users');
}

export function updateUserRole(userId, role) {
  return fetchAPI(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  });
}

// --- Client Health ---

export function getClientHealth(startDate, endDate) {
  const params = startDate && endDate ? `?start=${startDate}&end=${endDate}` : '';
  return fetchAPI(`/api/client-health${params}`);
}

export function getCompanyKPIs(startDate, endDate, clientIds) {
  let params = startDate && endDate ? `?start=${startDate}&end=${endDate}` : '';
  if (clientIds && clientIds.length > 0) {
    params += `${params ? '&' : '?'}clientIds=${clientIds.join(',')}`;
  }
  return fetchAPI(`/api/client-health/kpis${params}`);
}

// --- Exports ---
import { showToast } from './toast';

async function downloadExcel(path, filename) {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export downloaded!');
}

// --- Operations module ---

export function getOperationsPlacements() {
  return fetchAPI('/api/operations/placements');
}

export function updatePlacementChecklist(placementId, data) {
  return fetchAPI(`/api/operations/placements/${placementId}`, {
    method: 'PATCH',
    body: data,
  });
}

export function exportOperationsPlacements() {
  return downloadExcel('/api/operations/placements/export', `APT_Placements_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function updatePlacementBullhorn(placementId, fields) {
  return fetchAPI(`/api/operations/placements/${placementId}/bullhorn-update`, {
    method: 'POST',
    body: fields,
  });
}

// --- Operations: COI Tracking ---

export function getCOIRecords() {
  return fetchAPI('/api/operations/coi');
}

export function createCOIRecord(data) {
  return fetchAPI('/api/operations/coi', { method: 'POST', body: data });
}

export function updateCOIRecord(id, data) {
  return fetchAPI(`/api/operations/coi/${id}`, { method: 'PATCH', body: data });
}

export function deleteCOIRecord(id) {
  return fetchAPI(`/api/operations/coi/${id}`, { method: 'DELETE' });
}

// --- Operations: Contract Tracking ---

export function getContracts() {
  return fetchAPI('/api/operations/contracts');
}

export function createContract(data) {
  return fetchAPI('/api/operations/contracts', { method: 'POST', body: data });
}

export function updateContract(id, data) {
  return fetchAPI(`/api/operations/contracts/${id}`, { method: 'PATCH', body: data });
}

export function deleteContract(id) {
  return fetchAPI(`/api/operations/contracts/${id}`, { method: 'DELETE' });
}

export function exportContracts() {
  return downloadExcel('/api/operations/contracts/export', `APT_Contracts_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function importContracts(rows) {
  return fetchAPI('/api/operations/contracts/import', { method: 'POST', body: { rows } });
}

// --- Org Flow ---

export function getOrgFlowUsers() {
  return fetchAPI('/api/org-flow/users');
}

export function getOrgFlowCurrentUser() {
  return fetchAPI('/api/org-flow/users/me');
}

export function getOrgFlowClients(view, userId) {
  const params = view === 'my' && userId ? `?view=my&userId=${encodeURIComponent(userId)}` : '';
  return fetchAPI(`/api/org-flow/clients${params}`);
}

export function getOrgFlowClient(id) {
  return fetchAPI(`/api/org-flow/clients/${id}`);
}

export function createOrgFlowClient(name, createdBy) {
  return fetchAPI('/api/org-flow/clients', {
    method: 'POST',
    body: { name, created_by: createdBy },
  });
}

export function updateOrgFlowClient(id, fields) {
  return fetchAPI(`/api/org-flow/clients/${id}`, {
    method: 'PATCH',
    body: fields,
  });
}

export function deleteOrgFlowClient(id) {
  return fetchAPI(`/api/org-flow/clients/${id}`, {
    method: 'DELETE',
  });
}

export function importOrgFlowClients(rows, currentUserId) {
  return fetchAPI('/api/org-flow/clients/import', {
    method: 'POST',
    body: { rows, currentUserId },
  });
}

export function syncBullhornClients() {
  return fetchAPI('/api/org-flow/sync-bullhorn-clients', {
    method: 'POST',
  });
}

export async function uploadClientLogo(clientId, file) {
  const token = await getToken();
  const formData = new FormData();
  formData.append('logo', file);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api/org-flow/clients/${clientId}/logo`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    if (msalInstance) msalInstance.acquireTokenRedirect(loginRequest);
    throw new Error('Session expired — redirecting to login');
  }
  if (res.status === 429) {
    throw new Error('Too many requests — please wait a moment and try again');
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export function removeClientLogo(clientId) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/logo`, {
    method: 'DELETE',
  });
}

export function getClientEmployees(clientId) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/employees`);
}

export function createEmployee(clientId, fields) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/employees`, {
    method: 'POST',
    body: fields,
  });
}

export function updateEmployee(employeeId, fields) {
  return fetchAPI(`/api/org-flow/employees/${employeeId}`, {
    method: 'PATCH',
    body: fields,
  });
}

export function deleteOrgFlowEmployee(employeeId, clientId) {
  return fetchAPI(`/api/org-flow/employees/${encodeURIComponent(employeeId)}?clientId=${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });
}

export function bulkDeleteEmployees(ids, clientId) {
  return fetchAPI('/api/org-flow/employees/bulk-delete', {
    method: 'POST',
    body: { ids, clientId },
  });
}

export function saveEmployeePositions(clientId, updates) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/employees/positions`, {
    method: 'POST',
    body: { updates },
  });
}

export function resetEmployeePositions(clientId) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/employees/reset-positions`, {
    method: 'POST',
  });
}

export function importEmployees(clientId, toInsert, toUpdate, validRows) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/employees/import`, {
    method: 'POST',
    body: { toInsert, toUpdate, validRows },
  });
}

export function getClientAssignments(clientId) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/assignments`);
}

export function createClientAssignment(clientId, userId) {
  return fetchAPI(`/api/org-flow/clients/${clientId}/assignments`, {
    method: 'POST',
    body: { user_id: userId },
  });
}

export function deleteClientAssignment(assignmentId) {
  return fetchAPI(`/api/org-flow/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}

export function exportHealthDashboard() {
  return downloadExcel('/api/client-health/export', `APT_Health_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportRecruiterDashboard(startDate, endDate) {
  return downloadExcel(`/api/reporting/recruiter-export?start=${startDate}&end=${endDate}`, `Recruiter_Dashboard_${startDate}_${endDate}.xlsx`);
}

export function exportSalesDashboard(startDate, endDate) {
  return downloadExcel(`/api/reporting/sales-export?start=${startDate}&end=${endDate}`, `Sales_Dashboard_${startDate}_${endDate}.xlsx`);
}

// --- Support ---

export function getSystemHealth() {
  return fetchAPI('/api/support/health');
}

export function getSupportTickets(mine = false, email = null) {
  const params = new URLSearchParams();
  if (mine) params.set('mine', 'true');
  if (email) params.set('email', email);
  params.set('_t', Date.now().toString());
  return fetchAPI(`/api/support/tickets?${params}`);
}

export async function submitSupportTicket(formData) {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api/support/tickets`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    if (msalInstance) msalInstance.acquireTokenRedirect(loginRequest);
    throw new Error('Session expired — redirecting to login');
  }
  if (res.status === 429) {
    throw new Error('Too many requests — please wait a moment and try again');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Submit failed: ${res.status}`);
  }
  return res.json();
}

export function updateTicketAssignee(id, data) {
  return fetchAPI(`/api/support/tickets/${id}/assignee`, {
    method: 'PATCH',
    body: data,
  });
}

export function getSupportUnreadCounts() {
  return fetchAPI(`/api/support/unread-counts?_t=${Date.now()}`);
}

export function markTicketViewed(ticketId) {
  return fetchAPI(`/api/support/tickets/${ticketId}/view`, {
    method: 'POST',
    body: {},
  });
}

export function getTicketComments(ticketId) {
  return fetchAPI(`/api/support/tickets/${ticketId}/comments?_t=${Date.now()}`);
}

export function addTicketComment(ticketId, comment) {
  return fetchAPI(`/api/support/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: { comment },
  });
}

export function updateTicketStatus(id, data) {
  return fetchAPI(`/api/support/tickets/${id}/status`, {
    method: 'PATCH',
    body: data,
  });
}

export function getKnownIssues(status) {
  return fetchAPI(`/api/support/known-issues${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

export function createKnownIssue(data) {
  return fetchAPI('/api/support/known-issues', {
    method: 'POST',
    body: data,
  });
}

export function updateKnownIssue(id, data) {
  return fetchAPI(`/api/support/known-issues/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

// --- Goal Tracking ---

export function getGoals(period, viewOrOptions) {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (typeof viewOrOptions === 'string') {
    if (viewOrOptions) params.set('view', viewOrOptions);
  } else if (viewOrOptions && typeof viewOrOptions === 'object') {
    if (viewOrOptions.view) params.set('view', viewOrOptions.view);
    if (viewOrOptions.archived) params.set('archived', 'true');
  }
  params.set('_t', Date.now().toString());
  return fetchAPI(`/api/goals?${params}`);
}

export function getGoal(id) {
  return fetchAPI(`/api/goals/${id}?_t=${Date.now()}`);
}

export function getGoalHistory(id) {
  return fetchAPI(`/api/goals/${id}/history?_t=${Date.now()}`);
}

export function createGoal(fields) {
  return fetchAPI('/api/goals', { method: 'POST', body: fields });
}

export function updateGoal(id, fields) {
  return fetchAPI(`/api/goals/${id}`, { method: 'PATCH', body: fields });
}

export function deleteGoal(id) {
  return fetchAPI(`/api/goals/${id}`, { method: 'DELETE' });
}

export function checkinGoal(id, fields) {
  return fetchAPI(`/api/goals/${id}/checkin`, { method: 'POST', body: fields });
}

export function getGoalTasks(id) {
  return fetchAPI(`/api/goals/${id}/tasks?_t=${Date.now()}`);
}

export function addGoalTask(id, fields) {
  return fetchAPI(`/api/goals/${id}/tasks`, { method: 'POST', body: fields });
}

export function updateGoalTask(goalId, taskId, fields) {
  return fetchAPI(`/api/goals/${goalId}/tasks/${taskId}`, { method: 'PATCH', body: fields });
}

export function deleteGoalTask(goalId, taskId) {
  return fetchAPI(`/api/goals/${goalId}/tasks/${taskId}`, { method: 'DELETE' });
}

export function pinGoalPriority(id) {
  return fetchAPI(`/api/goals/${id}/priority`, { method: 'POST', body: {} });
}

export function unpinGoalPriority(id) {
  return fetchAPI(`/api/goals/${id}/priority`, { method: 'DELETE' });
}

// --- Project Management (Trello-style kanban) ---

const PM = '/api/project-management';

function ifMatchHeaders(version) {
  if (version === undefined || version === null) return {};
  return { 'If-Match': String(version) };
}

export function pmListProjects({ archived = false } = {}) {
  return fetchAPI(`${PM}/projects${archived ? '?archived=true' : ''}`);
}

export function pmCreateProject({ name, description, color }) {
  return fetchAPI(`${PM}/projects`, { method: 'POST', body: { name, description, color } });
}

export function pmGetProject(id) {
  return fetchAPI(`${PM}/projects/${id}`);
}

export function pmUpdateProject(id, fields, { expectedVersion } = {}) {
  return fetchAPI(`${PM}/projects/${id}`, {
    method: 'PATCH',
    body: fields,
    headers: ifMatchHeaders(expectedVersion),
  });
}

export function pmArchiveProject(id) {
  return fetchAPI(`${PM}/projects/${id}`, { method: 'DELETE' });
}

export function pmRestoreProject(id) {
  return fetchAPI(`${PM}/projects/${id}/restore`, { method: 'POST', body: {} });
}

export function pmCreateColumn(projectId, name) {
  return fetchAPI(`${PM}/projects/${projectId}/columns`, {
    method: 'POST',
    body: { name },
  });
}

export function pmUpdateColumn(columnId, fields) {
  return fetchAPI(`${PM}/columns/${columnId}`, { method: 'PATCH', body: fields });
}

export function pmDeleteColumn(columnId) {
  return fetchAPI(`${PM}/columns/${columnId}`, { method: 'DELETE' });
}

export function pmReorderColumns(projectId, orderedIds) {
  return fetchAPI(`${PM}/projects/${projectId}/columns/reorder`, {
    method: 'POST',
    body: { orderedIds },
  });
}

export function pmCreateTask(projectId, fields) {
  return fetchAPI(`${PM}/projects/${projectId}/tasks`, { method: 'POST', body: fields });
}

export function pmUpdateTask(taskId, fields, { expectedVersion } = {}) {
  return fetchAPI(`${PM}/tasks/${taskId}`, {
    method: 'PATCH',
    body: fields,
    headers: ifMatchHeaders(expectedVersion),
  });
}

export function pmDeleteTask(taskId) {
  return fetchAPI(`${PM}/tasks/${taskId}`, { method: 'DELETE' });
}

export function pmMoveTask(taskId, { columnId, beforeTaskId, afterTaskId }) {
  return fetchAPI(`${PM}/tasks/${taskId}/move`, {
    method: 'POST',
    body: { columnId, beforeTaskId, afterTaskId },
  });
}

export function pmListComments(taskId) {
  return fetchAPI(`${PM}/tasks/${taskId}/comments`);
}

export function pmCreateComment(taskId, body) {
  return fetchAPI(`${PM}/tasks/${taskId}/comments`, {
    method: 'POST',
    body: { body },
  });
}

export function pmUpdateComment(commentId, body) {
  return fetchAPI(`${PM}/comments/${commentId}`, {
    method: 'PATCH',
    body: { body },
  });
}

export function pmDeleteComment(commentId) {
  return fetchAPI(`${PM}/comments/${commentId}`, { method: 'DELETE' });
}

export async function exportJobs() {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api/req-board/jobs/export`, { headers });
  if (!res.ok) throw new Error('Export failed');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `APT_Req_Board_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export downloaded!');
}

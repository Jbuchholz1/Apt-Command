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
    throw new Error('Session expired — redirecting to login');
  }

  if (res.status === 429) {
    throw new Error('Too many requests — please wait a moment and try again');
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
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

export function getStats() {
  return fetchAPI('/api/req-board/stats');
}

// --- Write operations ---

export function updateJobOverrides(id, data) {
  return fetchAPI(`/api/req-board/jobs/${id}/overrides`, {
    method: 'PATCH',
    body: data,
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
  return fetchAPI(`/api/reporting/team-alerts?team=${team}`);
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

export function getReminder() {
  return fetchAPI('/api/users/reminder');
}

export function updateReminder(text) {
  return fetchAPI('/api/admin/reminder', {
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

// --- Org Flow ---

export function getOrgFlowUsers() {
  return fetchAPI('/api/org-flow/users');
}

export function getOrgFlowCurrentUser() {
  return fetchAPI('/api/org-flow/users/me');
}

export function getOrgFlowClients(view, userId) {
  const params = view === 'my' && userId ? `?view=my&userId=${userId}` : '';
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
  return fetchAPI(`/api/org-flow/employees/${employeeId}?clientId=${clientId}`, {
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

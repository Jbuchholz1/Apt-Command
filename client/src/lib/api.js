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

// --- Individual Performance ---

export function getMyDashboard(startDate, endDate) {
  return fetchAPI(`/api/performance/my-dashboard?start=${startDate}&end=${endDate}`);
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

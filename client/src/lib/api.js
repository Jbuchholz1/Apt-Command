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
  return fetchAPI('/api/jobs');
}

export function getAllJobs() {
  return fetchAPI('/api/jobs/all');
}

export function getJobDetail(id) {
  return fetchAPI(`/api/jobs/${id}`);
}

export function getPlacements() {
  return fetchAPI('/api/placements');
}

export function getStats() {
  return fetchAPI('/api/stats');
}

// --- Write operations ---

export function updateJobOverrides(id, data) {
  return fetchAPI(`/api/jobs/${id}/overrides`, {
    method: 'PATCH',
    body: data,
  });
}

export function addJobNote(id, comment) {
  return fetchAPI(`/api/jobs/${id}/notes`, {
    method: 'POST',
    body: { comment },
  });
}

export function updateJobInBullhorn(id, fields) {
  return fetchAPI(`/api/jobs/${id}/bullhorn-update`, {
    method: 'POST',
    body: { fields },
  });
}

export function getUsers() {
  return fetchAPI('/api/jobs/users');
}

export function getRecruiters() {
  return fetchAPI('/api/jobs/users?role=recruiter');
}

export function getAccountManagers() {
  return fetchAPI('/api/jobs/users?role=account manager');
}

export function getOpportunities() {
  return fetchAPI('/api/jobs/opportunities');
}

// --- Export ---

export async function exportJobs() {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api/jobs/export`, { headers });
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
}

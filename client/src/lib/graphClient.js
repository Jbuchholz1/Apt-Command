import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { graphCalendarRequest, graphSearchRequest } from './authConfig';

/**
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} subject
 * @property {{ dateTime: string, timeZone: string }} start
 * @property {{ dateTime: string, timeZone: string }} end
 * @property {{ displayName?: string }} [location]
 * @property {Array<{ emailAddress: { name: string, address: string }, type: string, status?: { response: string } }>} [attendees]
 * @property {boolean} [isOnlineMeeting]
 * @property {{ joinUrl?: string } | null} [onlineMeeting]
 * @property {{ emailAddress: { name: string, address: string } }} [organizer]
 * @property {string} [bodyPreview]
 */

/**
 * Acquire a Graph access token scoped to Calendars.Read.
 * Silent first; popup fallback on interaction-required.
 */
export async function getCalendarAccessToken(instance, account) {
  if (!instance || !account) throw new Error('MSAL instance and account are required');
  try {
    const response = await instance.acquireTokenSilent({
      ...graphCalendarRequest,
      account,
    });
    return response.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const response = await instance.acquireTokenPopup(graphCalendarRequest);
      return response.accessToken;
    }
    throw err;
  }
}

/**
 * Acquire a Graph access token with the full Universal Search scope set.
 * Silent first; popup fallback on interaction-required.
 */
export async function getSearchAccessToken(instance, account) {
  if (!instance || !account) throw new Error('MSAL instance and account are required');
  try {
    const response = await instance.acquireTokenSilent({
      ...graphSearchRequest,
      account,
    });
    return response.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const response = await instance.acquireTokenPopup(graphSearchRequest);
      return response.accessToken;
    }
    throw err;
  }
}

/**
 * Fetch today's calendar events (local day, Central time) from Microsoft Graph.
 * Returns the parsed `value` array.
 *
 * @param {string} accessToken
 * @returns {Promise<CalendarEvent[]>}
 */
export async function fetchTodaysEvents(accessToken) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: 'start/dateTime',
    $top: '50',
  });

  const url = `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`;

  if (import.meta.env.DEV) {
    console.log('[CalendarWidget] Graph request:', url);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="America/Chicago"',
    },
  });

  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = { error: { message: res.statusText } }; }
    const msg = body?.error?.message || `Graph request failed (${res.status})`;
    const error = new Error(msg);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  const data = await res.json();
  return Array.isArray(data?.value) ? data.value : [];
}

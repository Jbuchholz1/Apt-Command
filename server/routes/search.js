const express = require('express');
const router = express.Router();

const bullhorn = require('../lib/bullhorn');
const cache = require('../lib/cache');
const { bhLink } = require('../lib/recruiterConfig');

const CACHE_TTL_MS = 60 * 1000;
const MIN_QUERY_LEN = 2;

const JOB_FIELDS_LITE = 'id,title,clientCorporation,status,owner,dateAdded,address,isOpen';
const CANDIDATE_FIELDS_LITE = 'id,firstName,lastName,status,owner,dateAdded,primarySkills,city,state';

const GRAPH_ENTITY_TYPES = ['message', 'driveItem', 'event', 'person'];

function sanitizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  // Keep alphanumerics, spaces, hyphens, apostrophes.
  return raw.trim().replace(/[^a-zA-Z0-9\s\-']/g, '').trim();
}

function toIsoOrNull(ms) {
  if (ms == null) return null;
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fullName(person) {
  if (!person) return '';
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
}

// --- Graph normalization ---

function graphEntityTypeOf(hit) {
  const resource = hit?.resource || hit?._source || {};
  const odata = resource['@odata.type'] || '';
  if (odata.includes('message')) return 'email';
  if (odata.includes('driveItem')) return 'file';
  if (odata.includes('event')) return 'event';
  if (odata.includes('person')) return 'person';
  return null;
}

function normalizeGraphHit(hit) {
  const resource = hit?.resource || hit?._source || {};
  const type = graphEntityTypeOf(hit);
  if (!type) return null;

  const preview = hit?.hitHighlightedSummary || hit?.summary || '';

  if (type === 'email') {
    const fromName = resource.from?.emailAddress?.name || resource.from?.emailAddress?.address || 'Unknown sender';
    return {
      id: String(resource.id || hit?.hitId || ''),
      type,
      title: resource.subject || '(no subject)',
      subtitle: fromName,
      preview,
      url: resource.webLink || 'https://outlook.office.com/mail/',
      date: resource.sentDateTime || resource.receivedDateTime || null,
      source: 'graph',
      icon: 'email',
    };
  }

  if (type === 'file') {
    const parentName = resource.parentReference?.name || '';
    return {
      id: String(resource.id || hit?.hitId || ''),
      type,
      title: resource.name || '(untitled file)',
      subtitle: parentName,
      preview,
      url: resource.webUrl || '',
      date: resource.lastModifiedDateTime || resource.createdDateTime || null,
      source: 'graph',
      icon: 'file',
    };
  }

  if (type === 'event') {
    const location = resource.location?.displayName || '';
    return {
      id: String(resource.id || hit?.hitId || ''),
      type,
      title: resource.subject || '(no subject)',
      subtitle: location,
      preview,
      url: resource.webLink || 'https://outlook.office.com/calendar/',
      date: resource.start?.dateTime || null,
      source: 'graph',
      icon: 'calendar',
    };
  }

  if (type === 'person') {
    const upn = resource.userPrincipalName
      || resource.scoredEmailAddresses?.[0]?.address
      || resource.emailAddresses?.[0]?.address
      || '';
    const subtitleParts = [resource.jobTitle, resource.companyName || resource.department].filter(Boolean);
    return {
      id: String(resource.id || hit?.hitId || ''),
      type,
      title: resource.displayName || '(unnamed)',
      subtitle: subtitleParts.join(' · '),
      preview,
      url: upn ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(upn)}` : '',
      date: null,
      source: 'graph',
      icon: 'person',
    };
  }

  return null;
}

async function searchGraph(accessToken, query) {
  const body = {
    requests: [{
      entityTypes: GRAPH_ENTITY_TYPES,
      query: { queryString: query },
      from: 0,
      size: 25,
      fields: [
        'id', 'subject', 'summary', 'name', 'webUrl', 'webLink',
        'lastModifiedDateTime', 'createdDateTime', 'sentDateTime', 'receivedDateTime',
        'start', 'end', 'location',
        'from', 'displayName', 'jobTitle', 'department', 'companyName',
        'userPrincipalName', 'scoredEmailAddresses', 'emailAddresses',
        'hitHighlightedSummary', 'parentReference', 'bodyPreview',
      ],
    }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch('https://graph.microsoft.com/v1.0/search/query', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch { /* ignore */ }
    const snippet = bodyText.slice(0, 400);
    const err = new Error(`Graph Search request failed: ${res.status} ${res.statusText} ${snippet}`);
    err.graphStatus = res.status;
    err.graphBody = snippet;
    throw err;
  }

  const data = await res.json();
  const hitsContainers = data?.value?.[0]?.hitsContainers || [];
  const allHits = hitsContainers.flatMap(c => c?.hits || []);

  const grouped = { email: [], file: [], event: [], person: [] };
  for (const hit of allHits) {
    const normalized = normalizeGraphHit(hit);
    if (normalized && grouped[normalized.type]) {
      grouped[normalized.type].push(normalized);
    }
  }
  return grouped;
}

// --- Bullhorn normalization ---

function normalizeJob(job) {
  if (!job || job.id == null) return null;
  const owner = fullName(job.owner);
  const client = job.clientCorporation?.name || '';
  const city = job.address?.city || '';
  const state = job.address?.state || '';
  const location = [city, state].filter(Boolean).join(', ');
  const subtitleBits = [client, job.status].filter(Boolean);
  const previewBits = [owner && `Owner: ${owner}`, location].filter(Boolean);
  return {
    id: String(job.id),
    type: 'job',
    title: job.title || `Job #${job.id}`,
    subtitle: subtitleBits.join(' · '),
    preview: previewBits.join(' · '),
    url: bhLink('JobOrder', job.id),
    date: toIsoOrNull(job.dateAdded),
    source: 'bullhorn',
    icon: 'job',
  };
}

function normalizeCandidate(cand) {
  if (!cand || cand.id == null) return null;
  const name = fullName(cand) || `Candidate #${cand.id}`;
  const city = cand.city || cand.address?.city || '';
  const state = cand.state || cand.address?.state || '';
  const location = [city, state].filter(Boolean).join(', ');
  const skills = cand.primarySkills?.data?.map(s => s.name).filter(Boolean).slice(0, 3).join(', ') || '';
  const subtitleBits = [cand.status, location].filter(Boolean);
  const previewBits = [skills, fullName(cand.owner) && `Owner: ${fullName(cand.owner)}`].filter(Boolean);
  return {
    id: String(cand.id),
    type: 'candidate',
    title: name,
    subtitle: subtitleBits.join(' · '),
    preview: previewBits.join(' · '),
    url: bhLink('Candidate', cand.id),
    date: toIsoOrNull(cand.dateAdded),
    source: 'bullhorn',
    icon: 'candidate',
  };
}

async function searchBullhornJobs(query) {
  const result = await bullhorn.callTool('search_jobs', {
    query,
    fields: JOB_FIELDS_LITE,
    count: 8,
  });
  const rows = Array.isArray(result) ? result : (result?.data || []);
  return rows.map(normalizeJob).filter(Boolean);
}

async function searchBullhornCandidates(query) {
  const result = await bullhorn.callTool('search_candidates', {
    query,
    fields: CANDIDATE_FIELDS_LITE,
    count: 8,
  });
  const rows = Array.isArray(result) ? result : (result?.data || []);
  return rows.map(normalizeCandidate).filter(Boolean);
}

// --- Orchestration ---

async function doSearch({ query, accessToken }) {
  const errors = [];

  const [graphSettled, jobsSettled, candidatesSettled] = await Promise.allSettled([
    searchGraph(accessToken, query),
    searchBullhornJobs(query),
    searchBullhornCandidates(query),
  ]);

  const results = { person: [], job: [], candidate: [], file: [], email: [], event: [] };

  if (graphSettled.status === 'fulfilled') {
    const g = graphSettled.value;
    results.email = g.email || [];
    results.file = g.file || [];
    results.event = g.event || [];
    results.person = g.person || [];
  } else {
    errors.push('Graph Search unavailable');
    console.error('[search] graph error:', graphSettled.reason?.message || graphSettled.reason);
  }

  if (jobsSettled.status === 'fulfilled') {
    results.job = jobsSettled.value;
  } else {
    errors.push('Bullhorn jobs unavailable');
    console.error('[search] bullhorn jobs error:', jobsSettled.reason?.message || jobsSettled.reason);
  }

  if (candidatesSettled.status === 'fulfilled') {
    results.candidate = candidatesSettled.value;
  } else {
    errors.push('Bullhorn candidates unavailable');
    console.error('[search] bullhorn candidates error:', candidatesSettled.reason?.message || candidatesSettled.reason);
  }

  const totalCount = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  return { results, totalCount, errors };
}

router.post('/', async (req, res) => {
  const started = Date.now();
  const rawQuery = req.body?.query;
  const accessToken = req.body?.accessToken;

  const query = sanitizeQuery(rawQuery);
  if (!query || query.length < MIN_QUERY_LEN) {
    return res.status(400).json({ error: `Query must be at least ${MIN_QUERY_LEN} characters` });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  const userOid = req.user?.id || 'anon';
  const cacheKey = `search:${userOid}:${query.toLowerCase()}`;

  try {
    const { results, totalCount, errors } = await cache.cached(
      cacheKey,
      CACHE_TTL_MS,
      () => doSearch({ query, accessToken }),
    );

    const durationMs = Date.now() - started;
    console.log(`[search] query="${query}" results=${totalCount} duration=${durationMs}ms errors=${errors.length}`);

    res.json({
      results,
      totalCount,
      query,
      durationMs,
      errors,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    console.error(`[search] fatal query="${query}" duration=${durationMs}ms:`, err.message);
    res.status(500).json({ error: 'Search failed', durationMs });
  }
});

module.exports = router;

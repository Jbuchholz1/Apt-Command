const breaker = require('./mcpBreaker');
const cache = require('./cache');

// Short-TTL cache for the parameterless, high-frequency Bullhorn reads that the
// board (every 20s per user) and stats/offer-out hammer. A TTL under the 20s
// poll collapses N concurrent users into ~1 fetch per window — and crucially it
// absorbs the extra calls introduced by full id-cursor pagination. A successful
// mutation busts the whole 'bh:*' namespace (see callTool), so a user who just
// wrote always sees fresh data on the next poll.
const MCP_URL = process.env.BULLHORN_MCP_URL;
const MCP_API_KEY = process.env.BULLHORN_MCP_API_KEY;
const BH_READ_TTL_MS = parseInt(process.env.BH_READ_TTL_MS || '12000', 10);

if (!MCP_URL) {
  console.error('[MCP] BULLHORN_MCP_URL not set — Bullhorn API calls will fail');
}
if (!MCP_API_KEY) {
  console.warn('[MCP] BULLHORN_MCP_API_KEY not set — MCP requests will be unauthenticated');
}

let requestId = 0;

const ALLOWED_TOOLS = new Set([
  'query_entity',
  'search_jobs',
  'get_submissions',
  'get_candidate',
  'search_candidates',
  'get_entity_fields',
  'add_note',
  'update_entity',
  'create_entity',
]);

// Mutating MCP tools — blocked when READ_ONLY_MODE is enabled (sandbox).
const MUTATING_TOOLS = new Set(['update_entity', 'add_note', 'create_entity']);
const READ_ONLY_MODE = process.env.READ_ONLY_MODE === 'true';

if (READ_ONLY_MODE) {
  console.warn('[MCP] READ_ONLY_MODE=true — Bullhorn writes (update_entity, add_note, create_entity) will be blocked');
}

// Strip free-text fields that may contain PII (meeting subjects, note bodies,
// comments) before logging. Keeps IDs / dates / type for diagnostic value but
// replaces the string content with a length marker. Used by the appointment
// and meeting-note helpers below — see SECURITY_AUDIT.md DRB-SEC-007.
const PII_LOG_KEYS = new Set(['subject', 'description', 'comments', 'body', 'note', 'noteBody']);
function redactForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactForLog);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_LOG_KEYS.has(k) && typeof v === 'string') {
      out[k] = v.length > 0 ? `[${v.length} chars redacted]` : '';
    } else if (v && typeof v === 'object') {
      out[k] = redactForLog(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Call a tool on the Bullhorn MCP server via JSON-RPC over SSE.
 * Used by the convenience wrappers below and exported for health checks.
 */
async function callTool(toolName, args = {}) {
  if (!ALLOWED_TOOLS.has(toolName)) {
    throw new Error(`Blocked: tool "${toolName}" is not in the allowed tools whitelist`);
  }

  // Sandbox guard: refuse mutations when running in read-only mode.
  // Local Supabase writes (overrides, notes, goals, etc.) are unaffected —
  // they don't go through callTool().
  if (READ_ONLY_MODE && MUTATING_TOOLS.has(toolName)) {
    console.warn(`[READ_ONLY_MODE] Blocked Bullhorn ${toolName}`, { args });
    const err = new Error('Bullhorn writes are disabled in sandbox (READ_ONLY_MODE).');
    err.code = 'READ_ONLY_MODE';
    err.statusCode = 403;
    throw err;
  }

  // Circuit breaker: fail fast when MCP is known to be down so one outage
  // doesn't stall every in-flight request for its full 30s timeout.
  breaker.beforeCall();

  requestId++;
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: requestId,
  };

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (MCP_API_KEY) {
    headers['Authorization'] = `Bearer ${MCP_API_KEY}`;
  }

  const controller = new AbortController();
  // Single 30s deadline covering BOTH the response headers AND the body read.
  // The abort signal is passed to fetch, so firing it also aborts an in-progress
  // res.text() — previously the timeout was cleared as soon as headers arrived,
  // leaving the body read able to hang on undici's much longer default.
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let res;
    try {
      res = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      breaker.recordFailure();
      if (err.name === 'AbortError') {
        throw new Error(`MCP request timed out after 30s (tool: ${toolName})`);
      }
      throw err;
    }

    if (!res.ok) {
      breaker.recordFailure();
      throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
    }

    // Response is SSE format — parse the data line. Reading or parsing the body
    // can fail (connection dropped mid-body, malformed payload, or the 30s
    // deadline aborting the stream); all are transport/protocol failures, so
    // settle the breaker via recordFailure() on EVERY exit path. Without this, a
    // probe that dies here in half-open never releases its in-flight slot and
    // the breaker wedges open forever.
    let json;
    try {
      const text = await res.text();
      const dataLine = text.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) {
        throw new Error('No data in MCP response');
      }
      json = JSON.parse(dataLine.slice(6));
    } catch (err) {
      breaker.recordFailure();
      if (err.name === 'AbortError') {
        throw new Error(`MCP response body timed out after 30s (tool: ${toolName})`);
      }
      throw err;
    }

    if (json.error) {
      // Application-level error from MCP: the transport is healthy (we received a
      // well-formed JSON-RPC response), so record a SUCCESS — this both releases
      // the half-open probe slot and correctly closes the breaker — then surface
      // the tool's error. A probe returning 200 + json.error must NOT leave the
      // breaker stuck in half-open.
      breaker.recordSuccess();
      throw new Error(`MCP error: ${json.error.message}`);
    }

    breaker.recordSuccess();

    // A successful mutation can change what the cached board/stats/offer-out reads
    // return, so drop the Bullhorn read cache. Reads refetch fresh on the next
    // poll; cache.js's bust-generation guard prevents an in-flight read started
    // before this write from re-populating stale data afterward.
    if (MUTATING_TOOLS.has(toolName)) {
      cache.bust('bh:*');
    }

    // Extract text content from result
    const content = json.result?.content;
    if (!content || !content.length) {
      return null;
    }

    const textContent = content.find(c => c.type === 'text');
    if (!textContent) return null;

    // Try to parse as JSON; if not valid JSON, return the raw text
    try {
      return JSON.parse(textContent.text);
    } catch {
      return { message: textContent.text };
    }
  } finally {
    clearTimeout(timeout);
  }
}

// --- Convenience wrappers ---

const JOB_FIELDS = [
  'id', 'title', 'status', 'owner', 'clientCorporation', 'clientContact',
  'employmentType', 'numOpenings', 'payRate', 'salary',
  'clientBillRate', 'feeArrangement',
  'customFloat1', 'customFloat2',
  'customText1', 'customText2', 'customText3', 'customText4', 'customText5', 'customText40',
  'dateAdded', 'startDate', 'estimatedEndDate', 'dateLastModified', 'address', 'assignedUsers', 'type',
  'isPublic', 'isOpen',
].join(',');

async function getOpenJobs() {
  return cache.cached('bh:openJobs', BH_READ_TTL_MS, () => paginateQuery('getOpenJobs', {
    entityType: 'JobOrder',
    where: 'isOpen = true AND isDeleted = false',
    fields: JOB_FIELDS,
    orderBy: '-dateAdded',
  }));
}

// Jobs with status Archive/Placed/Lost/Wash modified recently — fetch wide window,
// server-side logic uses status_changed_at for precise 12hr fall-off
async function getRecentlyClosedJobs() {
  const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago (wide net)
  // Note: the cutoff shifts each call, but a 12s TTL means cache entries within
  // a poll window share an effectively-identical cutoff — acceptable drift.
  return cache.cached('bh:recentlyClosedJobs', BH_READ_TTL_MS, () => paginateQuery('getRecentlyClosedJobs', {
    entityType: 'JobOrder',
    where: `isOpen = false AND isDeleted = false AND dateLastModified > ${cutoff} AND (status = 'Archive' OR status = 'Placed' OR status = 'Lost' OR status = 'Wash' OR status = 'Filled')`,
    fields: JOB_FIELDS,
    orderBy: '-dateLastModified',
  }));
}

async function getAllJobs() {
  return paginateQuery('getAllJobs', {
    entityType: 'JobOrder',
    where: 'isDeleted = false',
    fields: JOB_FIELDS,
    orderBy: '-dateAdded',
  });
}

// Fetch a set of jobs by ID (used for Called Shots that may be outside the open/closed windows).
async function getJobsByIds(ids) {
  const numeric = (ids || []).map(i => parseInt(i, 10)).filter(i => !Number.isNaN(i));
  if (numeric.length === 0) return { data: [] };
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: `id IN (${numeric.join(',')}) AND isDeleted = false`,
    fields: JOB_FIELDS,
    count: 500,
  });
}

async function getJobById(id) {
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: `id = ${parseInt(id, 10)} AND isDeleted = false`,
    fields: JOB_FIELDS,
    count: 1,
  });
}

// Statuses that count as "was submitted to the client at some point".
// Includes the initial Client Submission plus every downstream stage, so candidates
// that progressed past Client Submission (Interview Scheduled, Offer Extended, Placed, etc.)
// still appear in counts and detail views.
// Upstream-only statuses (New Lead, Candidate Interested, Internally Submitted —
// the last being the recruiter's internal pre-client review) are intentionally excluded.
//
// APT actually uses several interview-flavor statuses beyond the canonical
// "Interview Scheduled" / "Interview Feedback" — Phone Interview, In Person
// Interview, Final Interview, Second Interview. Missing any of these from
// this list silently undercounts # CS and Total Interviews, because the
// upstream Bullhorn WHERE clause filters them out entirely.
const CLIENT_SUB_STATUSES = [
  'Client Submission',
  'New Submission',
  'Phone Interview',
  'Interview Scheduled',
  'Interview Feedback',
  'In Person Interview',
  'Final Interview',
  'Second Interview',
  'AI Interview Complete',
  'Client Feedback',
  'Offer Extended',
  'Backout',
  'Placed',
];

async function getSubmissions(jobOrderId) {
  const statusList = CLIENT_SUB_STATUSES.map(s => `'${s}'`).join(',');
  return paginateQuery('getSubmissions', {
    entityType: 'JobSubmission',
    where: `jobOrder.id = ${parseInt(jobOrderId, 10)} AND status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,candidate,status,dateAdded,source,sendingUser',
    orderBy: '-dateAdded',
  });
}

// --- Generic cap-proof pagination -------------------------------------------
//
// APT's MCP caps query responses at ~200 rows even when a larger `count` is
// requested, and it does NOT reliably honor a `start` offset. The only
// pagination approach proven against this tenant (see getActiveClientCorporations)
// is an ID CURSOR: order by id ascending and ask for `id > <last id seen>` each
// page until a page comes back empty.
//
// paginateQuery walks every page of ANY query_entity call this way, so a result
// is never silently truncated by the cap. It:
//   - parenthesizes the caller's WHERE before appending the cursor, so an OR
//     clause (e.g. "status = 'A' OR status = 'B'") is not mis-bound;
//   - guarantees a top-level `id` is selected (the cursor needs it);
//   - retries a failed page once, then returns partial rather than throwing;
//   - bails if the cursor fails to advance (defends against an unordered or
//     id-less response) instead of looping forever;
//   - re-applies the caller's intended orderBy client-side, since the wire
//     order is forced to id-ascending.
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function paginateQuery(label, baseArgs, opts = {}) {
  const PAGE = opts.page || 500;
  const MAX_PAGES = opts.maxPages || 200;
  const baseWhere = baseArgs.where ? `(${baseArgs.where}) AND ` : '';
  const fields = /(^|,)\s*id\s*(,|$)/.test(baseArgs.fields) ? baseArgs.fields : `id,${baseArgs.fields}`;
  const all = [];
  let lastId = 0;
  let pages = 0;
  while (pages < MAX_PAGES) {
    const args = { entityType: baseArgs.entityType, where: `${baseWhere}id > ${lastId}`, fields, orderBy: 'id', count: PAGE };
    let res;
    try {
      res = await callTool('query_entity', args);
    } catch (err) {
      console.warn(`[${label}] page ${pages + 1} (id > ${lastId}) failed, retrying: ${err.message}`);
      try {
        res = await callTool('query_entity', args);
      } catch (retryErr) {
        console.warn(`[${label}] retry failed: ${retryErr.message} — returning partial (${all.length} rows)`);
        break;
      }
    }
    if (res?.message && !Array.isArray(res?.data)) {
      console.warn(`[${label}] page ${pages + 1} returned non-JSON: ${String(res.message).slice(0, 200)}`);
      break;
    }
    const rows = res?.data || [];
    pages++;
    if (rows.length === 0) break;
    all.push(...rows);
    const maxId = Number(rows[rows.length - 1].id);
    if (!(maxId > lastId)) {
      console.warn(`[${label}] id cursor did not advance (lastId=${lastId}) — stopping; result may be partial`);
      break;
    }
    lastId = maxId;
    if (pages >= MAX_PAGES) {
      console.warn(`[${label}] hit ${MAX_PAGES}-page safety cap — more rows may exist beyond id ${lastId}`);
    }
  }
  const ob = baseArgs.orderBy;
  if (ob && ob !== 'id') {
    const desc = ob.startsWith('-');
    const field = desc ? ob.slice(1) : ob;
    all.sort((a, b) => {
      const av = getPath(a, field);
      const bv = getPath(b, field);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * (desc ? -1 : 1);
    });
  }
  return { data: all };
}

// Backwards-compatible alias — every Placement reader already calls this name.
// Now backed by the generic id-cursor paginator above.
function paginatePlacementQuery(label, baseArgs) {
  return paginateQuery(label, baseArgs);
}

async function getActivePlacements() {
  return cache.cached('bh:activePlacements', BH_READ_TTL_MS, () => paginatePlacementQuery('getActivePlacements', {
    entityType: 'Placement',
    where: "status = 'Approved' OR status = 'Active' OR status = 'Sabatical'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,employmentType,owner(id,firstName,lastName)),dateBegin,dateEnd,payRate,clientBillRate,status,employmentType,salary,fee,jobSubmission(id,customFloat2,customFloat5)',
    orderBy: '-dateBegin',
  }));
}

async function getPendingApprovedPlacements() {
  return paginatePlacementQuery('getPendingApprovedPlacements', {
    entityType: 'Placement',
    where: "status = 'Pending' OR status = 'Approved'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,owner(id,firstName,lastName),clientCorporation(id,name)),dateBegin,status,employmentType',
    orderBy: '-dateBegin',
  });
}

// Client submissions across many jobs, used for inline counts on the Req Board.
// When called without args, falls back to a global query (capped at 500 — can
// silently drop results if Bullhorn has more than that across all jobs).
// Prefer passing jobOrderIds so the query is scoped and we never truncate.
async function getClientSubmissions(jobOrderIds) {
  const statusList = CLIENT_SUB_STATUSES.map(s => `'${s}'`).join(',');

  if (Array.isArray(jobOrderIds) && jobOrderIds.length > 0) {
    const numeric = jobOrderIds.map(i => parseInt(i, 10)).filter(i => !Number.isNaN(i));
    if (numeric.length === 0) return { data: [] };

    // Chunk to avoid URL-length / expression-complexity limits on very large boards.
    const CHUNK = 100;
    const chunks = [];
    for (let i = 0; i < numeric.length; i += CHUNK) {
      chunks.push(numeric.slice(i, i + CHUNK));
    }
    const results = await Promise.all(chunks.map(ids => paginateQuery('getClientSubmissions:chunk', {
      entityType: 'JobSubmission',
      where: `jobOrder.id IN (${ids.join(',')}) AND status IN (${statusList}) AND isDeleted = false`,
      fields: 'id,jobOrder,dateAdded,status',
    })));
    return { data: results.flatMap(r => r?.data || []) };
  }

  return paginateQuery('getClientSubmissions:global', {
    entityType: 'JobSubmission',
    where: `status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,jobOrder,dateAdded,status',
  });
}

// Submissions currently in "Offer Extended" status (corresponds to JobOrder "Offer Out" stage).
// Used by the On The Board modal to show which candidate is on the board per filled job.
async function getOfferExtendedSubmissions() {
  return cache.cached('bh:offerExtendedSubs', BH_READ_TTL_MS, () => paginateQuery('getOfferExtendedSubmissions', {
    entityType: 'JobSubmission',
    where: "status = 'Offer Extended' AND isDeleted = false",
    fields: 'id,candidate,jobOrder,status,dateAdded,payRate,billRate,salary,customFloat2,customFloat5',
    orderBy: '-dateAdded',
  }));
}

// Placements that haven't reached final approval yet. Used by the On The Board
// modal so a candidate stays visible through the offer→placed→approved window,
// not just while the submission is in Offer Extended.
// NOTE: Placement entity does not expose `isDeleted` as a queryable field —
// adding it 400s the whole query. The CLAUDE.md `AND isDeleted = false` rule
// does not apply here.
async function getPendingPlacements() {
  return cache.cached('bh:pendingPlacements', BH_READ_TTL_MS, () => paginatePlacementQuery('getPendingPlacements', {
    entityType: 'Placement',
    where: "status = 'Pending'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id),status,dateBegin,payRate,clientBillRate,salary,fee,jobSubmission(id,customFloat2,customFloat5)',
    orderBy: '-dateBegin',
  }));
}

// Placements that have left the "On The Board" pipeline — either accepted
// (Approved/Active) or terminated (Rejected/Completed/Terminated). Used to
// drop matching (candidate, job) pairs from the On The Board counter so a
// candidate doesn't linger after their placement reaches a terminal state.
async function getOffBoardPlacements() {
  return cache.cached('bh:offBoardPlacements', BH_READ_TTL_MS, () => paginatePlacementQuery('getOffBoardPlacements', {
    entityType: 'Placement',
    where: "status = 'Approved' OR status = 'Active' OR status = 'Rejected' OR status = 'Completed' OR status = 'Terminated'",
    fields: 'id,candidate(id),jobOrder(id),status,dateAdded',
    orderBy: '-dateBegin',
  }));
}

// Placements in the 'Submitted' state — earliest stage of the placement
// lifecycle. Used by the On The Board counter to keep candidates visible
// after the JobSubmission/JobOrder have flipped to Placed but the placement
// record itself hasn't reached Pending → Approved yet.
async function getSubmittedPlacements() {
  return cache.cached('bh:submittedPlacements', BH_READ_TTL_MS, () => paginatePlacementQuery('getSubmittedPlacements', {
    entityType: 'Placement',
    where: "status = 'Submitted'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id),status,dateBegin,payRate,clientBillRate,salary,fee,jobSubmission(id,customFloat2,customFloat5)',
    orderBy: '-dateBegin',
  }));
}

async function getOpenOpportunities() {
  return cache.cached('bh:openOpportunities', BH_READ_TTL_MS, () => paginateQuery('getOpenOpportunities', {
    entityType: 'Opportunity',
    where: "isDeleted = false",
    fields: 'id,status',
  }));
}

async function searchJobs(query) {
  return callTool('search_jobs', {
    query,
    fields: JOB_FIELDS,
    count: 100,
  });
}

async function updateJobField(jobOrderId, fields) {
  return callTool('update_entity', {
    entityType: 'JobOrder',
    entityId: parseInt(jobOrderId, 10),
    fields,
  });
}

async function updatePlacementField(placementId, fields) {
  return callTool('update_entity', {
    entityType: 'Placement',
    entityId: parseInt(placementId, 10),
    fields,
  });
}

async function updateOpportunityField(opportunityId, fields) {
  return callTool('update_entity', {
    entityType: 'Opportunity',
    entityId: parseInt(opportunityId, 10),
    fields,
  });
}

async function updateSubmissionField(submissionId, fields) {
  return callTool('update_entity', {
    entityType: 'JobSubmission',
    entityId: parseInt(submissionId, 10),
    fields,
  });
}

async function updateClientCorporationField(clientCorpId, fields) {
  return callTool('update_entity', {
    entityType: 'ClientCorporation',
    entityId: parseInt(clientCorpId, 10),
    fields,
  });
}

async function updateAppointmentField(appointmentId, fields) {
  return callTool('update_entity', {
    entityType: 'Appointment',
    entityId: parseInt(appointmentId, 10),
    fields,
  });
}

async function getCorporateUsers() {
  return paginateQuery('getCorporateUsers', {
    entityType: 'CorporateUser',
    where: 'isDeleted = false AND enabled = true',
    fields: 'id,firstName,lastName,email,customText1',
  });
}

async function getOpenOpportunitiesFull() {
  return paginateQuery('getOpenOpportunitiesFull', {
    entityType: 'Opportunity',
    where: "isDeleted = false",
    fields: 'id,title,status,owner,clientCorporation,clientContact,customDate1,dateAdded,expectedCloseDate,dealValue,weightedDealValue',
    orderBy: '-dateAdded',
  });
}

async function getOpportunityById(opportunityId) {
  return callTool('query_entity', {
    entityType: 'Opportunity',
    where: `id = ${parseInt(opportunityId, 10)} AND isDeleted = false`,
    fields: 'id,title,status,owner,clientCorporation,clientContact,customDate1,dateAdded,expectedCloseDate,dealValue,weightedDealValue',
    count: 1,
  });
}

async function getClientContactsForCorp(clientCorpId) {
  return paginateQuery('getClientContactsForCorp', {
    entityType: 'ClientContact',
    where: `clientCorporation.id = ${parseInt(clientCorpId, 10)} AND isDeleted = false`,
    fields: 'id,firstName,lastName,email',
    orderBy: 'lastName',
  });
}

// Bulk fetch ClientContacts for many corps. Used by the Org Flow contact
// sync; caller chunks corp ids. Paginates by id cursor because a single
// query is capped (Bullhorn returns 500 max, APT's MCP often caps shorter)
// and a chunk of 20 corps can easily exceed that. Mirrors the pattern in
// getActiveClientCorporations: order by id, advance lastId, stop on empty
// page (not short page — MCP returns short pages mid-stream).
async function getClientContactsForCorps(corpIds) {
  const numeric = (corpIds || []).map(i => parseInt(i, 10)).filter(Boolean);
  if (numeric.length === 0) return { data: [] };
  const PAGE_SIZE = 500;
  const baseWhere = `clientCorporation.id IN (${numeric.join(',')}) AND isDeleted = false`;
  const fields = 'id,firstName,lastName,email,clientCorporation(id)';

  const all = [];
  let lastId = 0;
  let pages = 0;
  while (true) {
    let result;
    try {
      result = await callTool('query_entity', {
        entityType: 'ClientContact',
        where: `${baseWhere} AND id > ${lastId}`,
        fields,
        orderBy: 'id',
        count: PAGE_SIZE,
      });
    } catch (err) {
      console.warn(`[bullhorn] getClientContactsForCorps page ${pages + 1} (id > ${lastId}) failed, retrying: ${err.message}`);
      try {
        result = await callTool('query_entity', {
          entityType: 'ClientContact',
          where: `${baseWhere} AND id > ${lastId}`,
          fields,
          orderBy: 'id',
          count: PAGE_SIZE,
        });
      } catch (retryErr) {
        console.warn(`[bullhorn] getClientContactsForCorps retry failed: ${retryErr.message} — returning partial result`);
        break;
      }
    }
    if (result?.message && !Array.isArray(result?.data)) {
      console.warn(`[bullhorn] getClientContactsForCorps page ${pages + 1} non-JSON: ${String(result.message).slice(0, 200)}`);
      break;
    }
    const contacts = result?.data || [];
    pages++;
    if (contacts.length === 0) break;
    all.push(...contacts);
    lastId = contacts[contacts.length - 1].id;
    if (pages >= 50) {
      console.warn('[bullhorn] getClientContactsForCorps hit 50-page safety cap');
      break;
    }
  }
  return { data: all };
}

async function createJob(fields) {
  return callTool('create_entity', {
    entityType: 'JobOrder',
    fields,
  });
}

async function addNoteToJob(jobOrderId, comments) {
  return callTool('add_note', {
    entityType: 'JobOrder',
    entityId: parseInt(jobOrderId, 10),
    comments,
    action: 'General Note',
  });
}

async function addNoteToOpportunity(opportunityId, comments) {
  return callTool('add_note', {
    entityType: 'Opportunity',
    entityId: parseInt(opportunityId, 10),
    comments,
    action: 'General Note',
  });
}

// --- Pagination helper (Bullhorn caps at 500 results per query) ---

async function paginatedQuery({ entityType, dateField, startMs, endMs, extraWhere, fields }) {
  const CHUNK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const allData = [];
  let chunkStart = startMs;

  while (chunkStart < endMs) {
    const chunkEnd = Math.min(chunkStart + CHUNK_MS, endMs);
    // Half-open interval [chunkStart, chunkEnd): `>=` on the start so a record
    // landing exactly on an internal 30-day boundary isn't dropped by both
    // adjacent chunks (the old `> chunkStart AND < chunkEnd` lost seam records).
    // Each record now falls in exactly one chunk — no overlap, no gap.
    const where = `${dateField} >= ${chunkStart} AND ${dateField} < ${chunkEnd} ${extraWhere}`.trim();
    // Paginate WITHIN each 30-day chunk. The old code took a single capped page
    // per chunk, so any 30-day window with more than ~200 matching rows (common
    // for sales appointments / client subs across the whole team) was silently
    // truncated. id-cursor pagination collects the full window.
    const { data } = await paginateQuery(`paginatedQuery:${entityType}`, {
      entityType,
      where,
      fields,
      orderBy: `-${dateField}`,
    });
    allData.push(...data);
    chunkStart = chunkEnd;
  }

  return { data: allData };
}

// --- Reporting: date-range queries ---

async function getRecruiterUsers() {
  return paginateQuery('getRecruiterUsers', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true AND customText1 = 'Recruiter'",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
  });
}

async function getClientSubsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'Sendout',
    dateField: 'dateAdded',
    startMs, endMs,
    extraWhere: '',
    fields: 'id,user,candidate,jobOrder,dateAdded,clientCorporation',
  });
}

async function getInterviewsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'Appointment',
    dateField: 'dateBegin',
    startMs, endMs,
    extraWhere: "AND isDeleted = false AND type = 'Interview'",
    fields: 'id,type,dateBegin,owner,candidateReference,jobOrder(id,title,clientCorporation),subject',
  });
}

async function getPlacementsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'Placement',
    dateField: 'dateBegin',
    startMs, endMs,
    extraWhere: "AND status = 'Approved'",
    fields: 'id,candidate,jobOrder(id,title,clientCorporation),dateBegin,dateEnd,payRate,clientBillRate,salary,fee,owner,status,employeeType',
  });
}

async function getLeadsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'Lead',
    dateField: 'dateAdded',
    startMs, endMs,
    extraWhere: 'AND isDeleted = false',
    fields: 'id,owner,dateAdded,name,companyName,status',
  });
}

async function getRecruitingCommissions(placementIds) {
  if (!placementIds.length) return { data: [] };
  const idList = placementIds.join(',');
  return paginateQuery('getRecruitingCommissions', {
    entityType: 'PlacementCommission',
    where: `placement.id IN (${idList}) AND role = 'Recruiting'`,
    fields: 'id,user,role,commissionPercentage,placement',
  });
}

// --- Sales reporting queries ---

async function getAMUsers() {
  return paginateQuery('getAMUsers', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true AND customText1 = 'Account Manager'",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
  });
}

async function getAppointmentsInRange(startMs, endMs, ownerIds) {
  // Sales activity (MAR) volume across the whole AM team easily exceeds the
  // ~200-row cap inside a single 30-day window, so this MUST paginate within
  // each chunk — delegate to paginatedQuery, which now does exactly that.
  const ownerClause = (ownerIds && ownerIds.length > 0)
    ? ` AND owner.id IN (${ownerIds.join(',')})`
    : '';
  return paginatedQuery({
    entityType: 'Appointment',
    dateField: 'dateBegin',
    startMs, endMs,
    extraWhere: `AND isDeleted = false${ownerClause}`,
    fields: 'id,type,dateBegin,owner,candidateReference,jobOrder(id,title,clientCorporation),subject,clientContactReference(id,clientCorporation)',
  });
}

async function getNewJobsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'JobOrder',
    dateField: 'dateAdded',
    startMs, endMs,
    extraWhere: 'AND isDeleted = false',
    fields: 'id,title,status,owner,numOpenings,dateAdded,clientCorporation',
  });
}

async function getClosedJobsInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'JobOrder',
    dateField: 'dateLastModified',
    startMs, endMs,
    extraWhere: 'AND isDeleted = false AND isOpen = false',
    fields: 'id,title,status,owner,numOpenings,dateAdded,dateClosed,clientCorporation,type',
  });
}

async function getSalesCommissions(placementIds) {
  if (!placementIds.length) return { data: [] };
  const idList = placementIds.join(',');
  return paginateQuery('getSalesCommissions', {
    entityType: 'PlacementCommission',
    where: `placement.id IN (${idList}) AND role = 'Sales'`,
    fields: 'id,user,role,commissionPercentage,placement',
  });
}

// --- Client Health queries ---

async function getActivePlacementsWithClient() {
  return cache.cached('bh:activePlacementsWithClient', BH_READ_TTL_MS, () => paginateQuery('getActivePlacementsWithClient', {
    entityType: 'Placement',
    where: "status IN ('Approved','Active')",
    fields: 'id,status,candidate(id,firstName,lastName,owner),owner,jobOrder(id,title,clientCorporation,owner,clientContact(id,firstName,lastName,email)),dateBegin,dateEnd,payRate,clientBillRate,salary,fee,employeeType',
  }));
}

async function getRecentAppointments(sinceDateMs) {
  return paginateQuery('getRecentAppointments', {
    entityType: 'Appointment',
    where: `dateBegin > ${sinceDateMs} AND isDeleted = false`,
    fields: 'id,type,subject,dateBegin,owner(id,firstName,lastName),clientContactReference(id,firstName,lastName,clientCorporation),jobOrder(id,clientCorporation)',
    orderBy: '-dateBegin',
  });
}

async function getClientCorporations(clientIds) {
  if (!clientIds.length) return { data: [] };
  const idList = clientIds.join(',');
  return paginateQuery('getClientCorporations', {
    entityType: 'ClientCorporation',
    where: `id IN (${idList})`,
    fields: 'id,name,status,owners',
  });
}

// Pull non-deleted ClientCorporations modified since `sinceMs` (Unix ms).
// Pass 0 for a full scan (used by the first run / backfill).
// No status filter — APT's tenant uses a custom status value, so a literal
// `status = 'Active'` matched nothing. The sync surfaces every non-deleted
// corp; users can filter or delete archived cards from Org Flow if needed.
//
// Bullhorn caps query results at 500 per call. APT has thousands of
// ClientCorporations, so a full scan paginates by id ascending until no
// page is full. Incremental runs filter by dateLastModified and almost
// always fit in a single page.
async function getActiveClientCorporations(sinceMs = 0) {
  const fields = 'id,name,status,dateAdded,dateLastModified,owners';
  // Both the incremental (dateLastModified > sinceMs) and full-scan paths now
  // run through the shared id-cursor paginator. The incremental path used to
  // take a single capped page, so a bulk update touching >~200 corps was
  // silently dropped from the sync (finding U38); it now pages fully too.
  const where = sinceMs > 0 ? `dateLastModified > ${sinceMs}` : '';
  const result = await paginateQuery('getActiveClientCorporations', {
    entityType: 'ClientCorporation',
    where,
    fields,
    orderBy: 'id',
  });
  console.log(`[bullhorn] ClientCorporation scan: ${result.data.length} corps (sinceMs=${sinceMs})`);
  return result;
}

async function getABJobs(startMs, endMs) {
  let where = "isDeleted = false AND type IN (1,2)";
  if (startMs && endMs) {
    where += ` AND customDate1 > ${startMs} AND customDate1 < ${endMs}`;
  }
  return paginateQuery('getABJobs', {
    entityType: 'JobOrder',
    where,
    fields: 'id,title,type,status,numOpenings,owner,clientCorporation',
  });
}

async function getProjectJobs(startMs, endMs) {
  let where = "isDeleted = false AND employmentType = 'Project'";
  if (startMs && endMs) {
    where += ` AND customDate1 > ${startMs} AND customDate1 < ${endMs}`;
  }
  return paginateQuery('getProjectJobs', {
    entityType: 'JobOrder',
    where,
    fields: 'id,title,type,status,numOpenings,owner,clientCorporation,employmentType',
  });
}

async function getBackoutNotesInRange(startMs, endMs) {
  // Note entity requires /search (not /query), so we query NoteEntity instead
  // and deduplicate by note.id since each Note creates multiple NoteEntity rows
  const result = await paginatedQuery({
    entityType: 'NoteEntity',
    dateField: 'note.dateAdded',
    startMs, endMs,
    extraWhere: "AND note.action = 'Backout' AND note.isDeleted = false",
    fields: 'id,note(id,comments,personReference),targetEntityID,targetEntityName',
  });

  // Deduplicate by note ID to get unique backout notes
  const seenNoteIds = new Set();
  const uniqueNotes = [];
  for (const row of (result?.data || [])) {
    const noteId = row.note?.id;
    if (noteId && !seenNoteIds.has(noteId)) {
      seenNoteIds.add(noteId);
      const person = row.note?.personReference;
      const candidateName = person
        ? `${person.firstName || ''} ${person.lastName || ''}`.trim()
        : '';
      // Strip HTML tags from comments
      const rawComment = row.note?.comments || '';
      const comment = rawComment.replace(/<[^>]*>/g, '').trim();
      uniqueNotes.push({
        id: noteId,
        targetEntityID: row.targetEntityID,
        targetEntityName: row.targetEntityName,
        candidateName,
        candidateId: person?.id || null,
        comment,
      });
    }
  }

  return { data: uniqueNotes };
}

const ALLOWED_CHECKIN_TYPES = new Set(['TR 30/90', 'AM 30/90']);

// Count of placements that were "active" as of a specific point in time.
// Active = dateBegin <= asOf AND (dateEnd is null OR dateEnd >= asOf), excluding voided.
async function countActivePlacementsAsOf(asOfMs) {
  // Was a single count:1000 page — but the MCP caps near ~200, so the headcount
  // metric this feeds (Exec Weekly) silently undercounted once the firm had
  // more than a couple hundred placements begun on/before the date. Paginate.
  const result = await paginateQuery('countActivePlacementsAsOf', {
    entityType: 'Placement',
    where: `dateBegin <= ${asOfMs} AND status <> 'Voided' AND isDeleted = false`,
    fields: 'id,dateBegin,dateEnd,status',
    orderBy: 'id',
  });
  const rows = result?.data || [];
  return rows.filter(p => !p.dateEnd || p.dateEnd >= asOfMs).length;
}

// Full placement records (with the inputs needed to total weekly spread) for
// every placement that was "active" as of a point in time — same population as
// countActivePlacementsAsOf, but carrying rates, salary/fee, and the originating
// submission's VMS Fee / Hourly Referral (customFloat2 / customFloat5, which live
// on the submission, not the placement). Bullhorn can't express "dateEnd IS NULL"
// in a WHERE clause, so we fetch everything begun on/before asOf (paginated to
// avoid truncation) and filter the open/overlapping ones client-side.
async function getActivePlacementsAsOf(asOfMs) {
  const result = await paginatePlacementQuery('getActivePlacementsAsOf', {
    entityType: 'Placement',
    where: `dateBegin <= ${asOfMs} AND status <> 'Voided' AND isDeleted = false`,
    fields: 'id,status,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(name),employmentType),dateBegin,dateEnd,payRate,clientBillRate,salary,fee,employeeType,employmentType,jobSubmission(id,customFloat2,customFloat5)',
    orderBy: 'id',
  });
  const rows = (result?.data || []).filter(p => !p.dateEnd || p.dateEnd >= asOfMs);
  return { data: rows };
}

// Placements whose contract ends in the supplied window (used for off-board forecast).
async function getOffboardsInWindow(startMs, endMs) {
  return paginateQuery('getOffboardsInWindow', {
    entityType: 'Placement',
    where: `dateEnd >= ${startMs} AND dateEnd <= ${endMs} AND status <> 'Voided' AND isDeleted = false`,
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(name)),dateEnd,status,employmentType,payRate,clientBillRate',
    orderBy: 'dateEnd',
  });
}

// JobSubmissions that are currently in "Offer Extended" status and were touched
// inside the supplied date range. Used as a proxy for "offers extended this period".
async function getOffersExtendedInRange(startMs, endMs) {
  return paginatedQuery({
    entityType: 'JobSubmission',
    dateField: 'dateLastModified',
    startMs, endMs,
    extraWhere: "AND status = 'Offer Extended' AND isDeleted = false",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(name)),status,dateAdded,dateLastModified',
  });
}

async function getCheckinNotesForType(actionType) {
  if (!ALLOWED_CHECKIN_TYPES.has(actionType)) {
    throw new Error(`Invalid checkin action type: ${actionType}`);
  }
  // Query ALL checkin notes (no date range — we need full history for active placements)
  // Filter to targetEntityName = 'User' to get only candidate-linked rows
  // (each note creates rows for User, Placement, JobOrder — we only need User).
  // Paginated: full history across all contractors easily exceeds the ~200 cap,
  // and a truncated set here makes Team Alerts under-suppress overdue check-ins.
  const result = await paginateQuery('getCheckinNotesForType', {
    entityType: 'NoteEntity',
    where: `note.action = '${actionType}' AND note.isDeleted = false AND targetEntityName = 'User'`,
    fields: 'id,note,targetEntityID',
    orderBy: 'id',
  });

  // Collect unique candidate IDs that have at least one checkin note
  const candidateIdsWithCheckin = new Set();
  for (const row of (result?.data || [])) {
    if (row.targetEntityID) {
      candidateIdsWithCheckin.add(row.targetEntityID);
    }
  }

  return { totalNotes: candidateIdsWithCheckin.size, candidateIdsWithCheckin };
}

async function getPlacementsForJobs(jobIds) {
  if (!jobIds.length) return { data: [] };
  const idList = jobIds.join(',');
  return paginateQuery('getPlacementsForJobs', {
    entityType: 'Placement',
    where: `jobOrder.id IN (${idList})`,
    fields: 'id,jobOrder,status',
    orderBy: 'id',
  });
}

async function getCorporateUserByEmail(email) {
  // Fetch all active users and match by email (case-insensitive). Paginated so
  // a firm with >~200 active CorporateUsers doesn't drop users past the cap.
  // The result is identical regardless of `email` (we filter in JS), and this
  // is called multiple times per Daily Brief / dashboard request across several
  // routes — so cache the full list under one short-TTL key to collapse the
  // burst into a single scan. Busted on any Bullhorn mutation like the others.
  const result = await cache.cached('bh:corporateUsers', BH_READ_TTL_MS, () => paginateQuery('getCorporateUserByEmail', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
    orderBy: 'id',
  }));
  const normalizedEmail = email.toLowerCase();
  const match = (result.data || []).find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  return match || null;
}

// --- Daily Brief: role-aware tile queries ---

// Submissions currently in "in-play" stages (Interview Scheduled → Offer Extended),
// scoped to a single recruiter. Powers the Recruiter "Candidates In Play" tile.
const IN_PLAY_STATUSES = [
  'Interview Scheduled',
  'Interview Feedback',
  'Client Feedback',
  'Offer Extended',
];

async function getInPlaySubmissionsForUser(userId) {
  const statusList = IN_PLAY_STATUSES.map(s => `'${s}'`).join(',');
  return paginateQuery('getInPlaySubmissionsForUser', {
    entityType: 'JobSubmission',
    where: `sendingUser.id = ${parseInt(userId, 10)} AND status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,status,dateAdded,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(id,name))',
    orderBy: '-dateAdded',
  });
}

// ClientContacts owned by the given user. Powers the AM "Stale Client Contacts" tile.
async function getClientContactsOwnedBy(userId) {
  return paginateQuery('getClientContactsOwnedBy', {
    entityType: 'ClientContact',
    where: `owners.id = ${parseInt(userId, 10)} AND isDeleted = false`,
    fields: 'id,firstName,lastName,email,clientCorporation(id,name)',
    orderBy: 'lastName',
  });
}

// --- Daily Brief: "Last 7 days of meetings" — attendee match + appointment create ---

// Lucene/Bullhorn WHERE values are wrapped in single quotes. Anything
// containing a quote, backtick, space, or Lucene operator could either close
// the string or be parsed as syntax. Validate against a strict email shape
// and reject anything that doesn't match — never mangle the input, since
// stripping a quote out of a real address would silently match a different
// mailbox. Edge-case-valid emails (quoted local parts, IDN domains) are
// rejected by design; this codebase only operates on standard business emails.
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function sanitizeEmailForWhere(email) {
  const trimmed = String(email || '').trim();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

function buildEmailInClause(emails) {
  const cleaned = (emails || [])
    .map(sanitizeEmailForWhere)
    .filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.map(e => `'${e}'`).join(',');
}

async function findContactsByEmails(emails) {
  const inClause = buildEmailInClause(emails);
  if (!inClause) return { data: [] };
  return callTool('query_entity', {
    entityType: 'ClientContact',
    where: `email IN (${inClause}) AND isDeleted = false`,
    fields: 'id,firstName,lastName,email,clientCorporation(id,name)',
    count: 100,
  });
}

async function findCandidatesByEmails(emails) {
  const inClause = buildEmailInClause(emails);
  if (!inClause) return { data: [] };
  return callTool('query_entity', {
    entityType: 'Candidate',
    where: `email IN (${inClause}) AND isDeleted = false`,
    fields: 'id,firstName,lastName,email',
    count: 100,
  });
}

// Create a Bullhorn Appointment. Mirrors the shape used by getAppointmentsInRange
// so the new record shows up in the AM dashboard MAR query immediately.
//
// Bullhorn requires `dateEnd` for Appointment creation (the in-app form has it
// as a required field). We compute it from durationMinutes when known, else
// default to 30 min after dateBegin.
//
// MCP failure mode: when Bullhorn rejects a create the MCP server returns
// { message: "<raw error text>" } instead of throwing — see commit 44ad6a3
// for the same trap on the Org Flow sync. Detect that shape and re-throw so
// the route surfaces the Bullhorn complaint instead of silently reporting
// "appointmentId: null".
async function createAppointment({
  ownerId,
  type,
  dateBegin,
  dateEnd,
  subject,
  clientContactId,
  candidateId,
  jobOrderId,
  comments,
  durationMinutes,
}) {
  const resolvedDuration = (typeof durationMinutes === 'number' && durationMinutes > 0)
    ? durationMinutes
    : 30;
  const resolvedEnd = (typeof dateEnd === 'number' && dateEnd > dateBegin)
    ? dateEnd
    : dateBegin + resolvedDuration * 60 * 1000;

  const fields = {
    owner: { id: parseInt(ownerId, 10) },
    type,
    dateBegin,
    dateEnd: resolvedEnd,
    duration: resolvedDuration,
    subject: subject || '(No subject)',
  };
  if (clientContactId) {
    fields.clientContactReference = { id: parseInt(clientContactId, 10) };
  }
  if (candidateId) {
    fields.candidateReference = { id: parseInt(candidateId, 10) };
  }
  if (jobOrderId) {
    fields.jobOrder = { id: parseInt(jobOrderId, 10) };
  }
  if (comments) {
    fields.description = comments;
  }

  console.log('[createAppointment] payload:', JSON.stringify(redactForLog(fields)));
  const result = await callTool('create_entity', {
    entityType: 'Appointment',
    fields,
  });
  console.log('[createAppointment] full MCP result:', JSON.stringify(redactForLog(result)));

  // Bullhorn's create response varies. We accept changedEntityType/Id pairs
  // when present so we can also confirm the entity TYPE matches — a
  // create-then-echo bug surfaced where the create failed silently but the
  // response contained the input clientContactReference.id, which we then
  // wrongly reported as the new appointment id.
  const claimedType = result?.changedEntityType || result?.data?.changedEntityType || null;
  const id = result?.changedEntityId || result?.data?.changedEntityId || result?.data?.id || null;

  if (!id) {
    const raw = result?.message
      || (typeof result === 'string' ? result : JSON.stringify(result));
    console.error('[createAppointment] Bullhorn rejected:', String(raw).slice(0, 800));
    throw new Error(`Bullhorn rejected the appointment: ${String(raw).slice(0, 400)}`);
  }
  if (claimedType && claimedType !== 'Appointment') {
    console.error('[createAppointment] wrong entity type returned:', claimedType, 'id:', id);
    throw new Error(
      `Bullhorn returned changedEntityType="${claimedType}" id=${id} instead of an Appointment — ` +
      `the create likely failed and Bullhorn echoed an existing entity id.`,
    );
  }

  console.log('[createAppointment] claimed id:', id, 'type:', claimedType || '(not reported)');

  // Verify the appointment actually exists. If Bullhorn echoes the
  // clientContactReference.id (the silent-failure mode that put us at
  // ClientContact 37803 instead of an Appointment), this query will return
  // empty data and we'll throw with that diagnostic.
  const verify = await callTool('query_entity', {
    entityType: 'Appointment',
    where: `id = ${parseInt(id, 10)} AND isDeleted = false`,
    fields: 'id,subject,type,dateBegin,dateAdded,owner(id,firstName,lastName),clientContactReference(id,firstName,lastName)',
    count: 1,
  });
  const verifiedRow = verify?.data?.[0] || null;
  if (!verifiedRow) {
    console.error('[createAppointment] verify miss — no Appointment with id', id);
    throw new Error(
      `Bullhorn reported create with id ${id} but no Appointment exists at that id. ` +
      `Likely silent rejection: the response carried an existing entity id (e.g. the ` +
      `clientContactReference) instead of a real new Appointment id. Check Railway logs ` +
      `for [createAppointment] full MCP result.`,
    );
  }
  console.log('[createAppointment] verified appointment:', JSON.stringify(redactForLog(verifiedRow)));

  // Create the AppointmentAttendee junction so the new appointment appears on
  // the linked contact/candidate's Activity tab in Bullhorn. Setting
  // clientContactReference alone is enough for our MAR queries (the AM
  // dashboard reads that field directly), but Bullhorn's contact-record UI
  // queries the appointmentAttendees junction — which our PUT doesn't
  // populate automatically.
  let attendeeResult = null;
  if (clientContactId || candidateId) {
    try {
      attendeeResult = await createAppointmentAttendee({
        appointmentId: id,
        clientContactId,
        candidateId,
      });
    } catch (attErr) {
      console.error('[createAppointment] attendee create failed:', attErr.message);
      attendeeResult = { ok: false, error: attErr.message };
    }
  }

  return { ...result, id, verified: verifiedRow, attendee: attendeeResult };
}

// Create a Bullhorn Note attached to a ClientContact (or Candidate) so the
// activity surfaces on the contact's Activity tab. The Appointment we create
// alongside drives MAR via the existing AM dashboard query — but APT's
// Bullhorn config doesn't render Appointments on contact-Activity tabs, only
// Notes. Dual-write covers both paths: Note for visibility, Appointment for
// MAR / dashboard counts.
async function createMeetingNote({
  clientContactId,
  candidateId,
  action,
  subject,
  dateBeginMs,
  comments,
  commentingPersonId,
}) {
  if (!clientContactId && !candidateId) return null;

  const dateLine = new Date(dateBeginMs).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  });
  const noteBody = [
    `[${action}] ${subject || '(No subject)'}`,
    dateLine,
    '',
    comments || '',
  ].join('\n').trim();

  // Mirror the bullhorn-mcp's existing handleAddNote pattern: personReference
  // is the polymorphic person link Bullhorn Notes use. add_note is already on
  // the MCP allowlist and handles auth/headers, so prefer it over create_entity
  // for Notes — and the existing Note shape is known-good.
  const personId = clientContactId || candidateId;
  const entityType = clientContactId ? 'ClientContact' : 'Candidate';

  const payload = {
    entityType,
    entityId: parseInt(personId, 10),
    comments: noteBody,
    action,
  };
  // commentingPersonId attributes the Note to the actual user instead of
  // letting Bullhorn default to the API service account ("Anthropic Claude
  // AI API"). Pass through to add_note which sets Note.commentingPerson.
  if (commentingPersonId) {
    payload.commentingPersonId = parseInt(commentingPersonId, 10);
  }
  console.log('[createMeetingNote] payload:', JSON.stringify(redactForLog(payload)));
  const result = await callTool('add_note', payload);
  console.log('[createMeetingNote] full MCP result:', JSON.stringify(redactForLog(result)));

  const noteId = result?.changedEntityId || result?.data?.changedEntityId || null;
  if (!noteId) {
    const raw = result?.message
      || (typeof result === 'string' ? result : JSON.stringify(result));
    return { ok: false, error: String(raw).slice(0, 400) };
  }
  return { ok: true, id: noteId };
}

async function createAppointmentAttendee({ appointmentId, clientContactId, candidateId }) {
  if (!appointmentId) throw new Error('appointmentId required for AppointmentAttendee');
  if (!clientContactId && !candidateId) return null;

  // Bullhorn's AppointmentAttendee uses a polymorphic `attendee` person
  // reference (not separate clientContact/candidate fields). The first
  // attempt with clientContact: {id: X} got back:
  //   "missing required property: attendee, type: MISSING_REQUIRED"
  // The _subtype hint tells Bullhorn whether the id refers to a
  // ClientContact or a Candidate — both share the polymorphic Person base.
  const fields = {
    appointment: { id: parseInt(appointmentId, 10) },
  };
  if (clientContactId) {
    fields.attendee = {
      id: parseInt(clientContactId, 10),
      _subtype: 'ClientContact',
    };
  } else if (candidateId) {
    fields.attendee = {
      id: parseInt(candidateId, 10),
      _subtype: 'Candidate',
    };
  }

  console.log('[createAppointmentAttendee] payload:', JSON.stringify(fields));
  const result = await callTool('create_entity', {
    entityType: 'AppointmentAttendee',
    fields,
  });
  console.log('[createAppointmentAttendee] full MCP result:', JSON.stringify(result));

  const aaId = result?.changedEntityId || result?.data?.changedEntityId || null;
  if (!aaId) {
    const raw = result?.message
      || (typeof result === 'string' ? result : JSON.stringify(result));
    return { ok: false, error: String(raw).slice(0, 400) };
  }
  return { ok: true, id: aaId };
}

module.exports = {
  CLIENT_SUB_STATUSES,
  getOpenJobs,
  getRecentlyClosedJobs,
  getAllJobs,
  getJobById,
  getJobsByIds,
  getSubmissions,
  getActivePlacements,
  getClientSubmissions,
  getOfferExtendedSubmissions,
  getPendingPlacements,
  getOffBoardPlacements,
  getSubmittedPlacements,
  getOpenOpportunities,
  getOpenOpportunitiesFull,
  getOpportunityById,
  getClientContactsForCorp,
  getClientContactsForCorps,
  createJob,
  searchJobs,
  addNoteToJob,
  addNoteToOpportunity,
  updateJobField,
  updatePlacementField,
  updateOpportunityField,
  updateSubmissionField,
  updateClientCorporationField,
  updateAppointmentField,
  getCorporateUsers,
  getRecruiterUsers,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
  getRecruitingCommissions,
  getAMUsers,
  getAppointmentsInRange,
  getNewJobsInRange,
  getClosedJobsInRange,
  getSalesCommissions,
  getPendingApprovedPlacements,
  getActivePlacementsWithClient,
  getRecentAppointments,
  getClientCorporations,
  getActiveClientCorporations,
  getABJobs,
  getProjectJobs,
  getPlacementsForJobs,
  getBackoutNotesInRange,
  countActivePlacementsAsOf,
  getActivePlacementsAsOf,
  getOffboardsInWindow,
  getOffersExtendedInRange,
  getCheckinNotesForType,
  getLeadsInRange,
  getCorporateUserByEmail,
  getInPlaySubmissionsForUser,
  getClientContactsOwnedBy,
  findContactsByEmails,
  findCandidatesByEmails,
  createAppointment,
  createMeetingNote,
  callTool,
};

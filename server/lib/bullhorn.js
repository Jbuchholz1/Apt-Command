const breaker = require('./mcpBreaker');

const MCP_URL = process.env.BULLHORN_MCP_URL;
const MCP_API_KEY = process.env.BULLHORN_MCP_API_KEY;

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

/**
 * Call a tool on the Bullhorn MCP server via JSON-RPC over SSE.
 * Used by the convenience wrappers below and exported for health checks.
 */
async function callTool(toolName, args = {}) {
  if (!ALLOWED_TOOLS.has(toolName)) {
    throw new Error(`Blocked: tool "${toolName}" is not in the allowed tools whitelist`);
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
  const timeout = setTimeout(() => controller.abort(), 30000); // 30-second timeout

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
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    breaker.recordFailure();
    throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
  }

  // Response is SSE format — parse the data line
  const text = await res.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  if (!dataLine) {
    breaker.recordFailure();
    throw new Error('No data in MCP response');
  }

  const json = JSON.parse(dataLine.slice(6));
  if (json.error) {
    // Application-level error from MCP: don't trip the breaker (the channel
    // is healthy; the request was rejected by the tool). Just surface it.
    throw new Error(`MCP error: ${json.error.message}`);
  }

  breaker.recordSuccess();

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
}

// --- Convenience wrappers ---

const JOB_FIELDS = [
  'id', 'title', 'status', 'owner', 'clientCorporation', 'clientContact',
  'employmentType', 'numOpenings', 'payRate', 'salary',
  'clientBillRate', 'feeArrangement',
  'customFloat1', 'customFloat2',
  'customText1', 'customText2', 'customText3', 'customText4', 'customText5', 'customText40',
  'dateAdded', 'startDate', 'estimatedEndDate', 'dateLastModified', 'address', 'assignedUsers', 'type',
].join(',');

async function getOpenJobs() {
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: 'isOpen = true AND isDeleted = false',
    fields: JOB_FIELDS,
    orderBy: '-dateAdded',
    count: 200,
  });
}

// Jobs with status Archive/Placed/Lost/Wash modified recently — fetch wide window,
// server-side logic uses status_changed_at for precise 12hr fall-off
async function getRecentlyClosedJobs() {
  const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago (wide net)
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: `isOpen = false AND isDeleted = false AND dateLastModified > ${cutoff} AND (status = 'Archive' OR status = 'Placed' OR status = 'Lost' OR status = 'Wash')`,
    fields: JOB_FIELDS,
    orderBy: '-dateLastModified',
    count: 100,
  });
}

async function getAllJobs() {
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: 'isDeleted = false',
    fields: JOB_FIELDS,
    orderBy: '-dateAdded',
    count: 200,
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
const CLIENT_SUB_STATUSES = [
  'Client Submission',
  'Interview Scheduled',
  'Interview Feedback',
  'Client Feedback',
  'Offer Extended',
  'Backout',
  'Placed',
];

async function getSubmissions(jobOrderId) {
  const statusList = CLIENT_SUB_STATUSES.map(s => `'${s}'`).join(',');
  return callTool('query_entity', {
    entityType: 'JobSubmission',
    where: `jobOrder.id = ${parseInt(jobOrderId, 10)} AND status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,candidate,status,dateAdded,source,sendingUser',
    orderBy: '-dateAdded',
    count: 500,
  });
}

async function getActivePlacements() {
  return callTool('query_entity', {
    entityType: 'Placement',
    where: "status = 'Approved' OR status = 'Active'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,employmentType,owner(id,firstName,lastName)),dateBegin,dateEnd,payRate,clientBillRate,status,employmentType,salary,fee',
    orderBy: '-dateBegin',
    count: 200,
  });
}

async function getPendingApprovedPlacements() {
  return callTool('query_entity', {
    entityType: 'Placement',
    where: "status = 'Pending' OR status = 'Approved'",
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,owner(id,firstName,lastName),clientCorporation(id,name)),dateBegin,status,employmentType',
    orderBy: '-dateBegin',
    count: 500,
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
    const results = await Promise.all(chunks.map(ids => callTool('query_entity', {
      entityType: 'JobSubmission',
      where: `jobOrder.id IN (${ids.join(',')}) AND status IN (${statusList}) AND isDeleted = false`,
      fields: 'id,jobOrder,dateAdded,status',
      count: 500,
    })));
    return { data: results.flatMap(r => r?.data || []) };
  }

  return callTool('query_entity', {
    entityType: 'JobSubmission',
    where: `status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,jobOrder,dateAdded,status',
    count: 500,
  });
}

// Submissions currently in "Offer Extended" status (corresponds to JobOrder "Offer Out" stage).
// Used by the On The Board modal to show which candidate is on the board per filled job.
async function getOfferExtendedSubmissions() {
  return callTool('query_entity', {
    entityType: 'JobSubmission',
    where: "status = 'Offer Extended' AND isDeleted = false",
    fields: 'id,candidate,jobOrder,status,dateAdded',
    orderBy: '-dateAdded',
    count: 500,
  });
}

async function getOpenOpportunities() {
  return callTool('query_entity', {
    entityType: 'Opportunity',
    where: "isDeleted = false",
    fields: 'id,status',
    count: 500,
  });
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

async function getCorporateUsers() {
  return callTool('query_entity', {
    entityType: 'CorporateUser',
    where: 'isDeleted = false AND enabled = true',
    fields: 'id,firstName,lastName,email,customText1',
    count: 100,
  });
}

async function getOpenOpportunitiesFull() {
  return callTool('query_entity', {
    entityType: 'Opportunity',
    where: "isDeleted = false",
    fields: 'id,title,status,owner,clientCorporation,dateAdded,expectedCloseDate,dealValue,weightedDealValue',
    orderBy: '-dateAdded',
    count: 500,
  });
}

async function getOpportunityById(opportunityId) {
  return callTool('query_entity', {
    entityType: 'Opportunity',
    where: `id = ${parseInt(opportunityId, 10)} AND isDeleted = false`,
    fields: 'id,title,status,owner,clientCorporation,dateAdded,expectedCloseDate,dealValue,weightedDealValue',
    count: 1,
  });
}

async function getClientContactsForCorp(clientCorpId) {
  return callTool('query_entity', {
    entityType: 'ClientContact',
    where: `clientCorporation.id = ${parseInt(clientCorpId, 10)} AND isDeleted = false`,
    fields: 'id,firstName,lastName,email',
    orderBy: 'lastName',
    count: 200,
  });
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
    const where = `${dateField} > ${chunkStart} AND ${dateField} < ${chunkEnd} ${extraWhere}`;
    const result = await callTool('query_entity', {
      entityType,
      where,
      fields,
      orderBy: `-${dateField}`,
      count: 500,
    });
    if (result?.data) {
      allData.push(...result.data);
    }
    chunkStart = chunkEnd;
  }

  return { data: allData };
}

// --- Reporting: date-range queries ---

async function getRecruiterUsers() {
  return callTool('query_entity', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true AND customText1 = 'Recruiter'",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
    count: 50,
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
  return callTool('query_entity', {
    entityType: 'PlacementCommission',
    where: `placement.id IN (${idList}) AND role = 'Recruiting'`,
    fields: 'id,user,role,commissionPercentage,placement',
    count: 500,
  });
}

// --- Sales reporting queries ---

async function getAMUsers() {
  return callTool('query_entity', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true AND customText1 = 'Account Manager'",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
    count: 50,
  });
}

async function getAppointmentsInRange(startMs, endMs, ownerIds) {
  // Bullhorn caps query results at 500. For long date ranges we split into
  // 30-day chunks and merge to avoid data truncation.
  const CHUNK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const ownerClause = (ownerIds && ownerIds.length > 0)
    ? ` AND owner.id IN (${ownerIds.join(',')})`
    : '';
  const fields = 'id,type,dateBegin,owner,candidateReference,jobOrder(id,title,clientCorporation),subject,clientContactReference(id,clientCorporation)';

  const allData = [];
  let chunkStart = startMs;

  while (chunkStart < endMs) {
    const chunkEnd = Math.min(chunkStart + CHUNK_MS, endMs);
    const where = `dateBegin > ${chunkStart} AND dateBegin < ${chunkEnd} AND isDeleted = false${ownerClause}`;
    const result = await callTool('query_entity', {
      entityType: 'Appointment',
      where,
      fields,
      orderBy: '-dateBegin',
      count: 500,
    });
    if (result?.data) {
      allData.push(...result.data);
    }
    chunkStart = chunkEnd;
  }

  return { data: allData };
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
  return callTool('query_entity', {
    entityType: 'PlacementCommission',
    where: `placement.id IN (${idList}) AND role = 'Sales'`,
    fields: 'id,user,role,commissionPercentage,placement',
    count: 500,
  });
}

// --- Client Health queries ---

async function getActivePlacementsWithClient() {
  return callTool('query_entity', {
    entityType: 'Placement',
    where: "status IN ('Approved','Active')",
    fields: 'id,status,candidate(id,firstName,lastName,owner),owner,jobOrder(id,title,clientCorporation,owner,clientContact(id,firstName,lastName,email)),dateBegin,dateEnd,payRate,clientBillRate,salary,fee,employeeType',
    count: 500,
  });
}

async function getRecentAppointments(sinceDateMs) {
  return callTool('query_entity', {
    entityType: 'Appointment',
    where: `dateBegin > ${sinceDateMs} AND isDeleted = false`,
    fields: 'id,type,subject,dateBegin,owner(id,firstName,lastName),clientContactReference(id,firstName,lastName,clientCorporation),jobOrder(id,clientCorporation)',
    orderBy: '-dateBegin',
    count: 500,
  });
}

async function getClientCorporations(clientIds) {
  if (!clientIds.length) return { data: [] };
  const idList = clientIds.join(',');
  return callTool('query_entity', {
    entityType: 'ClientCorporation',
    where: `id IN (${idList})`,
    fields: 'id,name,status,owners',
    count: 500,
  });
}

// Pull non-deleted ClientCorporations modified since `sinceMs` (Unix ms).
// Pass 0 for a full scan (used by the first run / backfill).
// No status filter — APT's tenant uses a custom status value, so a literal
// `status = 'Active'` matched nothing. The sync surfaces every non-deleted
// corp; users can filter or delete archived cards from Org Flow if needed.
async function getActiveClientCorporations(sinceMs = 0) {
  // Note: ClientCorporation does NOT support `isDeleted` (Bullhorn returns
  // "is not a valid field name"). For a full scan we use `id > 0` to match
  // every record; incremental runs filter by dateLastModified.
  // `owners` is TO_MANY — matches the existing getClientCorporations helper.
  const where = sinceMs > 0
    ? `dateLastModified > ${sinceMs}`
    : `id > 0`;
  return callTool('query_entity', {
    entityType: 'ClientCorporation',
    where,
    fields: 'id,name,status,dateAdded,dateLastModified,owners',
    orderBy: '-dateLastModified',
    count: 500,
  });
}

async function getABJobs(startMs, endMs) {
  let where = "isDeleted = false AND type IN (1,2)";
  if (startMs && endMs) {
    where += ` AND customDate1 > ${startMs} AND customDate1 < ${endMs}`;
  }
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where,
    fields: 'id,title,type,status,numOpenings,owner,clientCorporation',
    count: 500,
  });
}

async function getProjectJobs(startMs, endMs) {
  let where = "isDeleted = false AND employmentType = 'Project'";
  if (startMs && endMs) {
    where += ` AND customDate1 > ${startMs} AND customDate1 < ${endMs}`;
  }
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where,
    fields: 'id,title,type,status,numOpenings,owner,clientCorporation,employmentType',
    count: 500,
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
  const result = await callTool('query_entity', {
    entityType: 'Placement',
    where: `dateBegin <= ${asOfMs} AND status <> 'Voided' AND isDeleted = false`,
    fields: 'id,dateBegin,dateEnd,status',
    count: 1000,
  });
  const rows = result?.data || [];
  return rows.filter(p => !p.dateEnd || p.dateEnd >= asOfMs).length;
}

// Placements whose contract ends in the supplied window (used for off-board forecast).
async function getOffboardsInWindow(startMs, endMs) {
  return callTool('query_entity', {
    entityType: 'Placement',
    where: `dateEnd >= ${startMs} AND dateEnd <= ${endMs} AND status <> 'Voided' AND isDeleted = false`,
    fields: 'id,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(name)),dateEnd,status,employmentType,payRate,clientBillRate',
    orderBy: 'dateEnd',
    count: 200,
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
    fields: 'id,candidate,jobOrder,status,dateAdded,dateLastModified',
  });
}

async function getCheckinNotesForType(actionType) {
  if (!ALLOWED_CHECKIN_TYPES.has(actionType)) {
    throw new Error(`Invalid checkin action type: ${actionType}`);
  }
  // Query ALL checkin notes (no date range — we need full history for active placements)
  // Filter to targetEntityName = 'User' to get only candidate-linked rows
  // (each note creates rows for User, Placement, JobOrder — we only need User)
  const result = await callTool('query_entity', {
    entityType: 'NoteEntity',
    where: `note.action = '${actionType}' AND note.isDeleted = false AND targetEntityName = 'User'`,
    fields: 'id,note,targetEntityID',
    count: 500,
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
  return callTool('query_entity', {
    entityType: 'Placement',
    where: `jobOrder.id IN (${idList})`,
    fields: 'id,jobOrder,status',
    count: 500,
  });
}

async function getCorporateUserByEmail(email) {
  // Fetch all active users and match by email (case-insensitive)
  const result = await callTool('query_entity', {
    entityType: 'CorporateUser',
    where: "isDeleted = false AND enabled = true",
    fields: 'id,firstName,lastName,email,customText1,customDate1,customDate3',
    count: 100,
  });
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
  return callTool('query_entity', {
    entityType: 'JobSubmission',
    where: `sendingUser.id = ${parseInt(userId, 10)} AND status IN (${statusList}) AND isDeleted = false`,
    fields: 'id,status,dateAdded,candidate(id,firstName,lastName),jobOrder(id,title,clientCorporation(id,name))',
    orderBy: '-dateAdded',
    count: 500,
  });
}

// ClientContacts owned by the given user. Powers the AM "Stale Client Contacts" tile.
async function getClientContactsOwnedBy(userId) {
  return callTool('query_entity', {
    entityType: 'ClientContact',
    where: `owners.id = ${parseInt(userId, 10)} AND isDeleted = false`,
    fields: 'id,firstName,lastName,email,clientCorporation(id,name)',
    orderBy: 'lastName',
    count: 500,
  });
}

// --- Daily Brief: "Last 7 days of meetings" — attendee match + appointment create ---

// Lucene/Bullhorn WHERE quoting: a single quote in the value would close the
// string and let the rest be parsed as code. Strip them — emails never legally
// contain a quote anyway, so this is safe rejection rather than escaping.
function sanitizeEmailForWhere(email) {
  return String(email || '').replace(/['"`\\]/g, '').trim();
}

function buildEmailInClause(emails) {
  const cleaned = (emails || [])
    .map(sanitizeEmailForWhere)
    .filter(e => e.includes('@'));
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

  console.log('[createAppointment] payload:', JSON.stringify(fields));
  const result = await callTool('create_entity', {
    entityType: 'Appointment',
    fields,
  });
  console.log('[createAppointment] full MCP result:', JSON.stringify(result));

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
  console.log('[createAppointment] verified appointment:', JSON.stringify(verifiedRow));

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
  getOpenJobs,
  getRecentlyClosedJobs,
  getAllJobs,
  getJobById,
  getJobsByIds,
  getSubmissions,
  getActivePlacements,
  getClientSubmissions,
  getOfferExtendedSubmissions,
  getOpenOpportunities,
  getOpenOpportunitiesFull,
  getOpportunityById,
  getClientContactsForCorp,
  createJob,
  searchJobs,
  addNoteToJob,
  addNoteToOpportunity,
  updateJobField,
  updatePlacementField,
  updateOpportunityField,
  updateSubmissionField,
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
  callTool,
};

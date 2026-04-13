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
]);

/**
 * Call a read-only tool on the Bullhorn MCP server via JSON-RPC over SSE.
 * PRIVATE — not exported. Only used by the convenience wrappers below.
 */
async function callTool(toolName, args = {}) {
  if (!ALLOWED_TOOLS.has(toolName)) {
    throw new Error(`Blocked: tool "${toolName}" is not in the allowed tools whitelist`);
  }
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

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
  }

  // Response is SSE format — parse the data line
  const text = await res.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  if (!dataLine) {
    throw new Error('No data in MCP response');
  }

  const json = JSON.parse(dataLine.slice(6));
  if (json.error) {
    throw new Error(`MCP error: ${json.error.message}`);
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

// Jobs with status Archive/Placed/Lost that were modified in the last 48 hours
async function getRecentlyClosedJobs() {
  const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: `isOpen = false AND isDeleted = false AND dateLastModified > ${cutoff} AND (status = 'Archive' OR status = 'Placed' OR status = 'Lost')`,
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

async function getJobById(id) {
  return callTool('query_entity', {
    entityType: 'JobOrder',
    where: `id = ${parseInt(id, 10)} AND isDeleted = false`,
    fields: JOB_FIELDS,
    count: 1,
  });
}

async function getSubmissions(jobOrderId) {
  return callTool('get_submissions', {
    jobOrderId: parseInt(jobOrderId, 10),
    fields: 'id,candidate,status,dateAdded,source',
    count: 50,
  });
}

async function getActivePlacements() {
  return callTool('query_entity', {
    entityType: 'Placement',
    where: "status = 'Approved' OR status = 'Active'",
    fields: 'id,candidate,jobOrder,dateBegin,dateEnd,payRate,clientBillRate,status,employmentType',
    orderBy: '-dateBegin',
    count: 200,
  });
}

async function getClientSubmissions() {
  return callTool('query_entity', {
    entityType: 'JobSubmission',
    where: "(status = 'Client Submission' OR status = 'Internally Submitted') AND isDeleted = false",
    fields: 'id,jobOrder,dateAdded,status',
    count: 500,
  });
}

async function getOpenOpportunities() {
  return callTool('query_entity', {
    entityType: 'Opportunity',
    where: "isDeleted = false AND status NOT IN ('Closed','Closed-Lost','Closed-Won','Converted')",
    fields: 'id',
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

async function updateOpportunityField(opportunityId, fields) {
  return callTool('update_entity', {
    entityType: 'Opportunity',
    entityId: parseInt(opportunityId, 10),
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
    where: "isDeleted = false AND status NOT IN ('Closed','Closed-Lost','Closed-Won','Converted')",
    fields: 'id,title,status,owner,clientCorporation,dateAdded,expectedCloseDate,dealValue,weightedDealValue',
    orderBy: '-dateAdded',
    count: 500,
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
    fields: 'id,title,status,owner,numOpenings,dateAdded,dateClosed,clientCorporation',
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
    fields: 'id,type,dateBegin,owner,clientContactReference(id,clientCorporation),jobOrder(id,clientCorporation)',
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

async function getCheckinNotesForType(actionType) {
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

module.exports = {
  getOpenJobs,
  getRecentlyClosedJobs,
  getAllJobs,
  getJobById,
  getSubmissions,
  getActivePlacements,
  getClientSubmissions,
  getOpenOpportunities,
  getOpenOpportunitiesFull,
  searchJobs,
  addNoteToJob,
  updateJobField,
  updateOpportunityField,
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
  getActivePlacementsWithClient,
  getRecentAppointments,
  getClientCorporations,
  getABJobs,
  getProjectJobs,
  getPlacementsForJobs,
  getBackoutNotesInRange,
  getCheckinNotesForType,
  getCorporateUserByEmail,
};

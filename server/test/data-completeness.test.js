'use strict';
// ───────────────────────────────────────────────────────────────────────────
// GUARDRAIL: no silently-truncating data reads.
//
// Two hard caps can drop data without error: Bullhorn returns ~200 rows max per
// query, Supabase/PostgREST 1000. This test statically scans server/lib + routes
// and fails if a NEW data read could exceed those caps without paginating —
// turning "I only got part of the data" from a silent prod bug into a red CI
// check. See server/CLAUDE.md rule 4.
//
// A read passes if it is ANY of:
//   • single-row (.single()/.maybeSingle()), or explicitly capped (.range()/.limit()/head:true)
//   • routed through selectAllRows() (Supabase) or paginateQuery() (Bullhorn)
//   • count:1 (single Bullhorn record)
//   • listed in REVIEWED_BOUNDED below with a reason (intentionally bounded)
//
// To clear a new failure: paginate the read (preferred), or — if it is genuinely
// bounded to a small set — add its function to REVIEWED_BOUNDED with why.
//
// This runs only in CI / `npm test`. It is NOT imported by the app: zero runtime
// and zero performance impact on the deployed tool.
//
// LIMITATION (honest): the allow-list is per-function, so adding a NEW unbounded
// read INTO an already-listed function won't be caught. Keep data functions
// single-purpose. A runtime "returned exactly the cap" detector would close that
// gap but runs in-app; intentionally omitted to keep this zero-impact.
// ───────────────────────────────────────────────────────────────────────────
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');

const REVIEWED_BOUNDED = {
  // The paginators themselves — their count:/range IS the pagination.
  paginateQuery: 'the Bullhorn id-cursor paginator',
  selectAllRows: 'the Supabase range paginator',
  getActiveClientCorporations: 'own id-cursor pagination loop',
  getClientContactsForCorps: 'own id-cursor pagination loop',
  // Bullhorn — bounded by design
  searchJobs: 'top-N search (search_jobs), not a full fetch',
  searchBullhornJobs: 'Cmd+K universal search — top-N by design',
  searchBullhornCandidates: 'Cmd+K universal search — top-N by design',
  findContactsByEmails: 'bounded by one calendar event\'s attendee emails',
  findCandidatesByEmails: 'bounded by one calendar event\'s attendee emails',
  // Supabase — single record / insert-returns-batch / one parent's small child set
  bulkCreateVendorContracts: 'insert .select() returns only the inserted batch',
  bulkImportEmployees: 'insert/update .select() returns only the batch',
  getClients: "one user's clients (created_by + assignments)",
  getEmployeesByClient: "one client's org chart",
  getAssignments: "one user/client's assignments",
  getTicketComments: "one ticket's comments",
  getUnreadCounts: "one user's tickets/comments",
  getKnownIssues: 'small fixed known-issues table',
  computeGoalProgress: "one goal's tasks",
  getGoal: 'one goal + its tasks',
  listCheckins: "one goal's check-ins within a date range",
  listTasksForGoal: "one goal's tasks",
  listGoalTasksForUser: "one user's tasks",
  listMyPriorityIds: "one user's priority ids",
  getSubmissionOverridesMap: "bounded by the board's current submission ids",
  getOpportunityOverridesMap: "bounded by the board's current opportunity ids",
  rebalanceColumn: "one kanban column's tasks",
};

function dataFiles() {
  const out = [];
  for (const sub of ['lib', 'routes']) {
    const dir = path.join(SERVER, sub);
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) out.push(path.join(dir, f));
    }
  }
  return out;
}

function enclosingFn(lines, idx) {
  let name = '(module)';
  const re = /(?:async\s+)?function\s+(\w+)/;
  for (let i = 0; i <= idx; i++) {
    const m = re.exec(lines[i]);
    if (m) name = m[1];
  }
  return name;
}

function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const rel = path.relative(SERVER, file);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // An inline `// paginate-ok: <reason>` near the query marks it as reviewed
    // & intentionally bounded — used for route-handler queries (anonymous
    // arrows that can't be allow-listed by function name).
    // Look back far enough to cover a `// paginate-ok` comment placed above a
    // multi-line query chain (comment / const x = await supabase / .from /
    // [.insert] / .select).
    const marker = /paginate-ok/.test(lines.slice(Math.max(0, i - 5), i + 2).join('\n'));

    // Supabase list read
    if (line.includes('.select(')) {
      const ahead = lines.slice(i, i + 10).join('\n');
      const behind = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      const bounded = marker ||
        /\.single\(\)|\.maybeSingle\(\)|\.range\(|\.limit\(|head:\s*true/.test(ahead) ||
        /selectAllRows\(/.test(behind);
      if (!bounded) {
        const fn = enclosingFn(lines, i);
        if (!(fn in REVIEWED_BOUNDED)) {
          out.push(`${rel}:${i + 1}  unbounded .select() in ${fn}() — wrap in selectAllRows() or add to REVIEWED_BOUNDED with a reason`);
        }
      }
    }

    // Bullhorn query with a numeric count > 1 (count:PAGE / PAGE_SIZE are the
    // paginators and don't match \d+)
    const cm = /count:\s*(\d+)/.exec(line);
    if (cm && cm[1] !== '1') {
      const ctx = lines.slice(Math.max(0, i - 10), i + 2).join('\n');
      if (/callTool\(|query_entity|search_jobs|search_candidates/.test(ctx)) {
        const fn = enclosingFn(lines, i);
        if (!marker && !(fn in REVIEWED_BOUNDED)) {
          out.push(`${rel}:${i + 1}  callTool count:${cm[1]} in ${fn}() — use paginateQuery() or add to REVIEWED_BOUNDED with a reason`);
        }
      }
    }
  }
  return out;
}

test('no silently-truncating data reads (server/CLAUDE.md rule 4)', () => {
  const violations = [];
  for (const f of dataFiles()) violations.push(...scanFile(f));
  assert.deepStrictEqual(
    violations,
    [],
    `\nFound ${violations.length} potentially-truncating data read(s):\n  ${violations.join('\n  ')}\n\n` +
      'Each must page through to completion (paginateQuery / selectAllRows) or be ' +
      'declared intentionally bounded in REVIEWED_BOUNDED. See server/CLAUDE.md rule 4.\n',
  );
});

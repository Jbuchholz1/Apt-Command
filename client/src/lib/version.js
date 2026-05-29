/**
 * App version & changelog.
 *
 * Format: MAJOR.MINOR.PATCH
 *   MAJOR — big features, redesigns, breaking changes
 *   MINOR — new features, meaningful enhancements
 *   PATCH — bug fixes, small tweaks, polish
 *
 * Update this file with every deploy.
 */

export const APP_VERSION = '3.29.21';

export const CHANGELOG = [
  {
    version: '3.29.21',
    date: '2026-05-29',
    title: 'Req Board — Filled reqs now fade reliably; internal cleanup',
    changes: [
      { type: 'patch', text: 'Fix: a req marked "Filled" is meant to drop off the board 12 hours after the status change, but the fade was being measured from Bullhorn\'s last-modified time instead of the precise status-change time — so editing any field on a Filled req reset the 12-hour timer and the req could linger on the board. Filled now behaves like the other fall-off statuses (Placed / Lost / Wash / Archive). Also internal-only, with no other user-visible change: de-duplicated the job-status list into one shared constant, documented four previously-undocumented server env vars, and removed dead code.' },
    ],
  },
  {
    version: '3.29.20',
    date: '2026-05-22',
    title: 'Security hardening — three defense-in-depth fixes',
    changes: [
      { type: 'patch', text: 'Three small security fixes, none with user-visible changes. (1) Bullhorn appointment and meeting-note logs now strip subject/description/comments before writing — no more PII sitting in Railway log retention. (2) CORS credentials flag turned off — was vestigial under bearer-only auth, but removes a footgun for any future change that introduces cookies. (3) Support-ticket unread-count query now validates the email format before building its database filter — closes a defense-in-depth gap of the same shape as the v3.29.18 Org Flow fix. (Audit refs DRB-SEC-007, DRB-SEC-014, DRB-SEC-015.)' },
    ],
  },
  {
    version: '3.29.19',
    date: '2026-05-22',
    title: 'Dependency security sweep — Dependabot cleared',
    changes: [
      { type: 'patch', text: 'Upgraded bcrypt 5.1.1 → 6.0.0 (clears 5 high-severity tar CVEs via the node-pre-gyp build chain). Upgraded @supabase/supabase-js 2.103.0 → 2.106.1 (clears a ws memory-disclosure CVE). Added uuid and qs overrides in both package.json files to clear the remaining moderate CVEs that exceljs and express still pin to old transitive versions. npm audit now reports 0 vulnerabilities in both server and client. (Audit ref DRB-SEC-005.)' },
    ],
  },
  {
    version: '3.29.18',
    date: '2026-05-22',
    title: 'Org Flow — Clients page now scopes correctly to the signed-in user',
    changes: [
      { type: 'patch', text: 'Security fix: the Org Flow "My Clients" view now resolves the current user server-side instead of trusting the userId in the URL. Previously a user could have edited the URL to view another user\'s client list. Behavior on the page is unchanged — your own clients still load the same way. (Audit ref DRB-SEC-012.)' },
    ],
  },
  {
    version: '3.29.17',
    date: '2026-05-19',
    title: 'Active Contractors — lock Start date, keep End editable',
    changes: [
      { type: 'patch', text: 'The Start column on the Active Contractors modal is now read-only — start dates rarely change once a contractor is on the board, and accidental edits there were a real risk. End date remains inline-editable for extensions / early-outs.' },
    ],
  },
  {
    version: '3.29.16',
    date: '2026-05-19',
    title: 'Active Contractors — date edits now hit the right placement',
    changes: [
      { type: 'patch', text: 'The date-save handler was looking up the placement by its row index, but filteredPlacements sorts and filters the underlying list — so the index from the clicked row pointed at a different placement than the one the user saw. Edits either silently went to the wrong record or appeared to revert. The handler now receives the placement object directly and matches by id, so the write lands on the exact placement the user clicked.' },
    ],
  },
  {
    version: '3.29.15',
    date: '2026-05-19',
    title: 'Active Contractors — placement date edits now persist',
    changes: [
      { type: 'patch', text: 'Editing Start or End date on the Active Contractors modal was writing to the underlying JobOrder\'s startDate / estimatedEndDate instead of the Placement\'s dateBegin / dateEnd, so the change vanished on next refresh. Now writes directly to the Placement record. Same /api/jobs/placements/:id/update endpoint added in v3.29.14 now also accepts dateBegin and dateEnd.' },
    ],
  },
  {
    version: '3.29.14',
    date: '2026-05-19',
    title: 'On the Board — edit per-candidate rates inline',
    changes: [
      { type: 'patch', text: 'Clicking the PrBr/Salary cell on the On the Board modal now opens an inline editor that writes pay rate and bill rate directly to the placement (Pending/Submitted) or submission (Offer Extended) record in Bullhorn — not the JobOrder. Pairs with v3.29.13: now that displayed rates come from the per-candidate record, editing has to land on the same record so the change persists where the display is sourced. Direct Hire rows edit salary. Falls back to the job detail panel for rows with no underlying placement/submission target.' },
    ],
  },
  {
    version: '3.29.13',
    date: '2026-05-19',
    title: 'On the Board — use placement/submission rates, not job rates',
    changes: [
      { type: 'patch', text: 'Each candidate row on the On the Board counter now reflects that candidate\'s actual deal — pay rate, bill rate, CE spread, and perm fee come from the placement or submission record instead of the job order. Real-world placements often negotiate above the job\'s posted rate (e.g., a job posted at $31/$48.05 with the actual placement at $44.28/$68.63). When the underlying record has placeholder rates (Bullhorn\'s default $1 values) or no rates set, the row falls back to the job\'s rates divided by # openings to give a per-candidate share, preserving the v3.29.12-style fix for multi-opening reqs.' },
    ],
  },
  {
    version: '3.29.12',
    date: '2026-05-19',
    title: 'On the Board — keep current contractors visible for next-role pipeline',
    changes: [
      { type: 'patch', text: 'The firm-wide drop that scrubbed stale Offer Extended submissions after a candidate took a placement elsewhere was firing too aggressively — it removed current contractors (Active/Approved placement) any time they picked up a fresh Offer Extended for their next role. Now the drop only fires when the existing placement was added more recently than the submission, so a contractor wrapping up one contract and getting offered the next one stays on the board. Real "stale" cases (submission older than the replacing placement) still drop as before. Placement-source rows (Submitted/Pending) bypass the firm-wide drop entirely — those are genuine new pipeline entries.' },
    ],
  },
  {
    version: '3.29.11',
    date: '2026-05-12',
    title: 'Req Board — flag rows where the job isn’t published in Bullhorn',
    changes: [
      { type: 'patch', text: 'Any row on the Req Board whose underlying job is "Not Published" in Bullhorn (isPublic = 0) now shows a red left bar with a subtle red tint, calling out jobs that are invisible to candidates on the careers page / job boards. Jobs pending publish approval (isPublic = -1) and live jobs (isPublic = 1) are not flagged. The whole-row flag also feeds into the existing red-box filter and count in the FilterBar, alongside missed deadlines, missed follow-ups, and TR-no-sub-in-48hrs.' },
    ],
  },
  {
    version: '3.29.10',
    date: '2026-05-12',
    title: 'MAR Reporting — BD Meeting activity type added',
    changes: [
      { type: 'patch', text: '"BD Meeting" is now a first-class activity type across every MAR-driving surface: Sales Dashboard (new column + MAR Total), My Dashboard / individual performance MAR, Client Health AM MAR rollup, and the Daily Brief "Log Activity" dropdown. Worth 3 points per occurrence (same weight as New Meeting). Previously these Bullhorn appointments were silently dropped from totals. Historical BD Meetings appear retroactively in any date range queried — no backfill needed.' },
    ],
  },
  {
    version: '3.29.9',
    date: '2026-05-11',
    title: 'Req Board — On The Board modal shows total spread',
    changes: [
      { type: 'patch', text: 'The On The Board modal now displays "Total Spread: $X/wk" in the header (purple, matching the stat card), summing weekly CE spread + perm fee across every visible candidate row. Two candidates on the same job count the spread twice. Updates live with the Owner filter.' },
    ],
  },
  {
    version: '3.29.8',
    date: '2026-05-11',
    title: 'Req Board — On The Board counter matches modal row count',
    changes: [
      { type: 'patch', text: 'On The Board now only counts candidates whose jobs are visible on the current board. Previously the stat card summed every Offer Extended submission Bullhorn returned (including ones whose jobs were already closed/archived), which inflated the number (e.g. 49) far beyond the rows shown in the modal (e.g. 3). The stat now equals the modal row count.' },
    ],
  },
  {
    version: '3.29.7',
    date: '2026-05-11',
    title: 'Req Board — On The Board counts candidates + modal renders cleanly',
    changes: [
      { type: 'patch', text: 'On The Board now counts candidates in Offer Extended, not unique jobs. A job with two candidates both in Offer Extended (e.g. Scrum Master at Protective Life with Kelly Pierce and Anthony Prince) now contributes 2 to the stat, and the modal shows one row per candidate so the totals match end to end.' },
      { type: 'patch', text: 'The On The Board modal now renders via a React portal at the document root, fixing the clipping bug where the dim overlay only covered a band of the screen because a parent stacking context was containing position: fixed.' },
    ],
  },
  {
    version: '3.29.1',
    date: '2026-05-06',
    title: 'Operations — COI Tracker formatting matches Contract Tracker',
    changes: [
      { type: 'patch', text: 'COI Tracker (/operations/coi) now mirrors the Contract Tracker visual pattern: static display cells instead of always-on inline inputs, a modal-based add/edit form (Client Name, Expiration Date, COI Link), and pencil + trash icons in a right-aligned actions column. Expiry status moved from row background tinting to inline pill badges next to the client name — orange "Expiring Soon" within 30 days, red "Expired" once past. The two operations sub-pages now feel like one consistent module.' },
    ],
  },
  {
    version: '3.29.0',
    date: '2026-05-06',
    title: 'Real-time Req Board',
    changes: [
      { type: 'major', text: 'Override edits (notes, deadline, follow up, called shot, 48 hr, ZZ/* recruiter) now propagate to every connected board within roughly half a second — no more waiting on the 20-second poll to see what your colleagues just changed. Powered by Supabase Realtime fanned out via a Server-Sent Events stream from the API server (/api/req-board/jobs/events).' },
      { type: 'minor', text: 'Server-side: a single shared Supabase Realtime subscription per API instance, broadcast to every connected SSE client. Idempotent merge by override version — your own edits never get clobbered by the echoed event. Connections auto-reconnect with exponential backoff; on reconnect the board re-fetches once to catch up on anything missed while disconnected.' },
      { type: 'patch', text: 'Bullhorn-only fields (status, owner, AM, salaries, real recruiter assignments) still rely on the 20-second poll because Bullhorn doesn\'t push events to us. The poll continues to run as a safety net for everything Realtime can\'t cover.' },
      { type: 'patch', text: 'Requires applying server/migrations/003_realtime_publication.sql in Supabase to enable Realtime on the job_overrides and job_notes tables. Until that runs, the system gracefully falls back to polling-only behavior.' },
    ],
  },
  {
    version: '3.28.0',
    date: '2026-05-06',
    title: 'Pipeline — Convert Opportunity → Job',
    changes: [
      { type: 'minor', text: 'New action on the Opportunity Pipeline: a "Convert → Job" button on every row that opens a modal to spin up a JobOrder in Bullhorn from the opportunity. The modal pre-fills the client and title from the opportunity, then asks for the fields a JobOrder needs that an opportunity doesn\'t carry: employment type (Contract / Direct Hire / Contract To Hire / Project), # of openings, remote (No / Yes / Hybrid), pay rate, client bill rate, salary low/high, and a client contact (loaded from getClientContactsForCorp on the parent corporation). On success, a new JobOrder is created via convertOpportunityToJob and the source opportunity is removed from the pipeline list. The Opportunities table grew an Actions column to host the button; totals row and empty-state colspan adjusted accordingly.' },
    ],
  },
  {
    version: '3.27.4',
    date: '2026-05-06',
    title: 'Reporting — Rename Weekly "Candidate Submissions" to "Client Submissions"',
    changes: [
      { type: 'patch', text: 'The Weekly executive tab tile previously labelled "Candidate Submissions" is now "Client Submissions". The tile already showed client-side submissions (subs sent to clients in the date range) — only the label was off.' },
    ],
  },
  {
    version: '3.27.3',
    date: '2026-05-06',
    title: 'Daily Brief — Hide Meetings Already Logged to Bullhorn',
    changes: [
      { type: 'patch', text: 'The "Recent Meetings" section of the Daily Brief no longer suggests meetings that have already been logged to Bullhorn. Previously, the filter only narrowed by date and external attendees — meetings you had already logged would re-appear on every refresh until they fell outside the recent window. Now, the previously-logged ids returned from getLoggedMeetingIds() are subtracted from the candidate list before render, so the section only shows meetings that still need attention.' },
    ],
  },
  {
    version: '3.27.2',
    date: '2026-05-06',
    title: 'Req Board — On The Board Uses Offer Extended Candidates',
    changes: [
      { type: 'patch', text: 'The "On The Board" stats tile no longer counts JobOrder.status === "Filled". It now counts jobs that have at least one candidate in JobSubmission status "Offer Extended" (i.e. an actual offer is out), pulling from getOfferOutCandidates() — which is the same source of truth the modal already used. The map refreshes on mount, on every parent jobs refresh (the 5-min auto-refresh tick), and defensively when the modal opens. The tile tooltip and modal title were updated to match: "Jobs with a candidate in Offer Extended" / "On The Board" instead of "Filled". Behaviour changes: a job whose status was set to Filled but has no Offer Extended submission no longer inflates the count; conversely, a job in any status with an Offer Extended candidate now counts.' },
    ],
  },
  {
    version: '3.27.1',
    date: '2026-05-06',
    title: 'Req Board — Stop Edits Disappearing (Server Cache Race)',
    changes: [
      { type: 'patch', text: 'Fixed the symptom where a freshly-saved edit (notes, deadline, follow-up, status, recruiter) would briefly disappear and then come back on the next auto-refresh tick. Two layered fixes. (1) /api GET responses now set Cache-Control: no-store instead of private, max-age=300; the browser HTTP cache had been serving the pre-edit body because server-side bust() can\'t invalidate the browser. (2) lib/cache.js now tracks a monotonic bustGen counter; cached() snapshots the gen before running the fetcher and refuses to write the result back into the in-memory store if a bust() landed while the fetch was in flight. Without the guard, an in-flight read started just before the user\'s save could re-populate the cache with stale data after the save\'s bust ran. Server-side caches still absorb load — only the browser cache went away.' },
    ],
  },
  {
    version: '3.27.0',
    date: '2026-05-06',
    title: 'Sandbox — Env Banner, Typed-Error Pass-Through, Env Docs',
    changes: [
      { type: 'minor', text: 'Scaffolding for the upcoming sandbox deployment. The frontend now renders an orange "SANDBOX — Bullhorn writes are blocked. Local data is isolated from production." banner whenever VITE_ENV=sandbox, so anyone using the sandbox URL can\'t mistake it for prod. The API server\'s error handler now surfaces typed errors (anything with err.statusCode or err.code) directly to the client instead of falling through to a generic 500 — that lets READ_ONLY_MODE (403) from server/lib/bullhorn.js, OVERRIDE_CONFLICT (409), and validation errors render clean toasts in the UI without leaking unrelated internals. The root CLAUDE.md gains a new "Environments" section documenting prod/sandbox split, branch workflow (feature → staging → main), the READ_ONLY_MODE toggle, and how to test write-back. No production behavior changes — sandbox env is not yet provisioned.' },
    ],
  },
  {
    version: '3.26.0',
    date: '2026-05-06',
    title: 'Access — Per-User Per-Module Permissions',
    changes: [
      { type: 'minor', text: 'New per-module access control replaces the coarse admin/manager/basic gating. Each user can now be granted access to individual tools (Req Board, Operations, Pipeline, Reporting sub-dashboards, Project Management, etc.) at either basic or admin level. Reporting is split into four separately-grantable sub-dashboards (Recruiter / Sales / Executive / My Performance). Global admin remains a superuser tier that bypasses the grant table. Backed by a new user_module_permissions table. The Admin module gains an "Edit" button per user that opens a per-module access editor with None/Basic/Admin radios. Existing managers and basic users were backfilled to preserve current access on rollout.' },
    ],
  },
  {
    version: '3.24.2',
    date: '2026-05-06',
    title: 'Operations — Contract Tracking: PDF Export',
    changes: [
      { type: 'patch', text: 'Added an "Export PDF" button to the Contract Tracking toolbar (next to Export Excel). Generates a clean landscape one-pager (or multi-page for long lists) with an Apt-branded navy + gold header, generation timestamp, and a summary line showing total / active / cancelled / expiring counts plus aggregate monthly + yearly cost across non-cancelled contracts. The table renders the same nine columns as the Excel export, with cancelled rows greyed out + italicized and "Expiring Soon" end-dates highlighted in orange. Each page footer carries "Apt Companies — Confidential" and a page counter. Generated client-side via jsPDF + jspdf-autotable, so no server round-trip.' },
    ],
  },
  {
    version: '3.24.1',
    date: '2026-05-06',
    title: 'Operations — Contract Tracking: Excel Import + Template',
    changes: [
      { type: 'patch', text: 'Contract Tracking gained two new toolbar buttons. "Template" downloads an empty .xlsx with the right column headers and two example rows so first-time imports don\'t need guesswork. "Import Excel" picks an .xlsx/.xls/.csv, reads it client-side, and bulk-creates new contract rows on the server. Headers match the Export format (Vendor Name, Start/End Date, Monthly/Yearly Cost, Notice Period (days), Auto-Renewing, Cancelled, Contract Link). Vendor Name is required; rows missing it are skipped and reported. Dates accept ISO, MM/DD/YYYY, or MM/DD/YY; Yes/No cells become booleans; cost cells tolerate "$1,200.50". Each import always creates new rows (never updates existing) — vendors with multiple contracts are common, so silent merges would be more dangerous than a manual cleanup if you re-import the same file twice.' },
    ],
  },
  {
    version: '3.24.0',
    date: '2026-05-06',
    title: 'Operations — Contract Tracking',
    changes: [
      { type: 'minor', text: 'New Operations tile: "Contract Tracking" at /operations/contracts. Tracks vendor contracts with vendor name, start/end dates, monthly + yearly cost (independent — no auto-calc, since some contracts have annual discounts that break a 12× ratio), notice period in days, auto-renewing flag, cancelled flag, and a free-text contract link (rendered as a clickable link when it starts with http). Rows ending within 90 days get an orange "Expiring Soon" pill so renewals don\'t sneak up on you; cancelled rows are dimmed with strike-through. Full add / edit / delete inline, plus an Excel export that mirrors the Onboarding pattern (navy header, currency-formatted cost columns, frozen header, autofilter). Admin-only, persisted in Supabase (vendor_contracts table), independent of Bullhorn.' },
    ],
  },
  {
    version: '3.23.2',
    date: '2026-05-06',
    title: 'Operations — COI Tracking: Save On Blur Fix',
    changes: [
      { type: 'patch', text: 'Fixed a bug where typing a client name (or link) into a COI row and clicking away looked like the value disappeared on the next refresh. Cause: the on-blur save handler was comparing the new value to the closure\'s record snapshot, but typing already mutated that snapshot in lockstep, so the comparison always matched and the PATCH never went out. The handler now always commits the latest value on blur. Also added a toast notification when a save fails (instead of silently reverting), and prevented the focus from snapping back to a row after it was edited.' },
    ],
  },
  {
    version: '3.23.1',
    date: '2026-05-06',
    title: 'Operations — COI Tracking Goes Live',
    changes: [
      { type: 'minor', text: 'COI Tracking is no longer a placeholder. The /operations/coi page is now a fillable list backed by Supabase: click "+ Add COI" to create a row, then type the client name, paste the link to the certificate, and pick an expiration date. Edits commit on blur (text fields) or immediately (date), and a trash icon deletes a record after confirmation. Rows whose expiration is in the past are highlighted red; rows expiring within 30 days are highlighted yellow, so at-a-glance you can see which COIs need attention. Sort order is by expiration date (soonest first), with rows missing a date pushed to the bottom. Admin-only — same gate as the rest of the Operations module.' },
    ],
  },
  {
    version: '3.23.0',
    date: '2026-05-06',
    title: 'Operations — Tile-Grid Home + COI Tracking Placeholder',
    changes: [
      { type: 'minor', text: 'Operations now opens to a tile-grid landing page (matching the Support module pattern) instead of going straight to placements. Two tiles: "Onboarding Tracking" (the existing new-hire paperwork / healthcare / payroll / 401k tracker, now at /operations/onboarding) and "COI Tracking" (placeholder at /operations/coi for future Certificate of Insurance tracking). Each sub-page has a back link to the Operations home. Splash + admin gate stay on the wrapper so they only fire once per module entry.' },
    ],
  },
  {
    version: '3.22.21',
    date: '2026-05-05',
    title: 'Org Flow — Sort By Client Status',
    changes: [
      { type: 'patch', text: 'Added two new options to the toolbar sort dropdown: "Status (Lead → Archive)" and "Status (Archive → Lead)". The order follows the lifecycle (Unqualified, Qualified Lead, Proposal, Negotiation, Active Account, Passive Account, DNC, Archive) rather than alphabetical, so cards group by stage in a way that matches how an account works through them. Ties within a single status fall back to name (A-Z) so the order inside each group stays stable. Pairs naturally with the multi-select status filter — filter to "Active Account + Negotiation" then sort by status to see negotiation cards first, active accounts second.' },
    ],
  },
  {
    version: '3.22.20',
    date: '2026-05-05',
    title: 'Org Flow — Excel Import Handles Hyperlink Cells',
    changes: [
      { type: 'patch', text: 'Importing the Motion Industries employee file (and any future file where Excel auto-converted email addresses into clickable hyperlinks) failed with a generic "Error importing file. Please check the format." Under the hood, ExcelJS returns hyperlink cells as { text, hyperlink } objects instead of strings, and the downstream import code called .trim() on what it expected to be a string — throwing TypeError before the row reached the validator. readExcelToJson now flattens hyperlink, richText, and formula objects to plain strings at the parse step, so every row hands the importer simple key/value pairs. The fallback error alert also now includes the underlying message so the next surprise format issue is debuggable in seconds instead of guesswork.' },
    ],
  },
  {
    version: '3.22.19',
    date: '2026-05-04',
    title: 'Org Flow — Status Filter Is Now Multi-Select',
    changes: [
      { type: 'patch', text: 'The toolbar status filter is now a checkbox-style multi-select instead of a single-pick dropdown. Click it to open a panel of all 8 status values, toggle any combination, and the grid filters to show clients in any of the selected statuses (OR semantics). Empty selection means show everything. The button label flips between "All Statuses", a single status name, or "<N> statuses" depending on what is selected. Clicking outside the panel closes it; "Clear all" resets to empty. Per-card status pill stays single-select since each client has one status at a time.' },
    ],
  },
  {
    version: '3.22.18',
    date: '2026-05-04',
    title: 'Org Flow — Hide Bullhorn "Imported Contacts" Placeholder Corps',
    changes: [
      { type: 'patch', text: 'After v3.22.17 finally pulled the full corp list out of Bullhorn, hundreds of "Imported Contacts" cards appeared. Those are placeholder ClientCorporations that Bullhorn auto-creates whenever someone bulk-imports ClientContacts — every batch makes one, all with status Archive, none representing a real account. The sync now skips any corp whose name matches "Imported Contacts" exactly (case-insensitive), and the dashboard query filters them out so any rows already in Supabase from before this fix stay invisible. Existing rows can be deleted with: delete from clients where name ilike \'Imported Contacts%\';' },
    ],
  },
  {
    version: '3.22.17',
    date: '2026-05-04',
    title: 'Org Flow — Surface Missing-Column Error + Parallelize Bulk Update',
    changes: [
      { type: 'patch', text: 'Three follow-ups after Railway logs revealed the real cause of the sync failures: the auto-migrate could not run because the user\'s Supabase project does not expose the exec_sql RPC, so the clients.status column was never added — every status read/write was failing silently. (1) The route now translates that specific Supabase error into a clear actionable message ("clients.status column is missing in Supabase — run migration 008") instead of an opaque 500. (2) The bulk client update during sync now parallelizes within chunks of 50, dropping the post-pagination write phase from minutes to seconds. (3) Pagination no longer stops when a page returns less than the requested count (Apt\'s MCP capped at 200 even when 500 was requested), so the full scan now continues until a page returns zero results. Run migration 008 in the Supabase SQL editor before retrying — see commit notes.' },
    ],
  },
  {
    version: '3.22.16',
    date: '2026-05-04',
    title: 'Org Flow — Manual Sync Skips Contacts + Maps Legacy "Active" Status',
    changes: [
      { type: 'patch', text: 'Three follow-ups for the manual "Sync from Bullhorn" button. (1) The button now passes skipContacts: true to the sync, so it finishes well within the HTTP request timeout — the contact sync continues to run on the 30-minute cron where time isn\'t a constraint. (2) The paginated full scan retries each page once on transient MCP errors and returns a partial result instead of bubbling a hard 500 if a page still fails. (3) Many older Bullhorn ClientCorporations carry a legacy status value of "Active" that Apt renamed to "Active Account" — the sync now translates "Active" to "Active Account" before writing to Supabase, and any other unrecognized values surface in the dropdown as "(legacy)" so they\'re visible instead of silently displaying as Unqualified.' },
    ],
  },
  {
    version: '3.22.15',
    date: '2026-05-04',
    title: 'Org Flow — Full Sync Now Paginates Past 500 Clients',
    changes: [
      { type: 'patch', text: 'After v3.22.14 the full sync still left most cards on Unqualified because Bullhorn caps query results at 500 per call, and the Apt tenant has thousands of ClientCorporations — only the 500 newest came back, every other corp\'s status went unchanged. The full scan now paginates by id ascending and keeps fetching until a page returns less than 500, so every linked client gets its real Bullhorn status copied down. Click "Sync from Bullhorn" once after the redeploy and the Railway log line "[bullhorn] full ClientCorporation scan: <N> corps in <P> pages" will tell you how many came through.' },
    ],
  },
  {
    version: '3.22.14',
    date: '2026-05-04',
    title: 'Org Flow — Manual Sync Now Forces A Full Scan',
    changes: [
      { type: 'patch', text: 'Confirmed via direct Bullhorn query that ClientCorporation.status returns the right values (Unqualified / Qualified Lead / Active Account / etc.) — but the sync was incremental, filtering to dateLastModified > last successful sync. Most Apt clients haven\'t been touched in months, so they never came back in the sync, and their Supabase row kept the column default. Clicking "Sync from Bullhorn" now forces a full scan (sinceMs = 0) so every linked corp gets its real Bullhorn status copied down. The 30-minute cron stays incremental — the heavier full pass only runs when you ask for it.' },
    ],
  },
  {
    version: '3.22.13',
    date: '2026-05-04',
    title: 'Org Flow — Status Now Pulls From Bullhorn On Sync',
    changes: [
      { type: 'patch', text: 'After v3.22.12 every client card showed "Unqualified" because the Bullhorn → Supabase sync was never copying ClientCorporation.status — every row fell back to the column default. The sync now reads status off each Bullhorn corp and writes it through on insert and on update, so the pill reflects the real Bullhorn value as soon as the next sync runs (cron every 30 min, or click "Sync from Bullhorn" to backfill immediately). Bullhorn remains the source of truth; user-driven changes still write back via update_entity.' },
    ],
  },
  {
    version: '3.22.12',
    date: '2026-05-04',
    title: 'Org Flow — Status Picklist Aligned With Bullhorn',
    changes: [
      { type: 'patch', text: 'Replaced the placeholder dropdown values (Active / Prospect / On Hold / Inactive / Lost) with the real Bullhorn ClientCorporation picklist: Unqualified, Qualified Lead, Proposal, Negotiation, Active Account, Passive Account, DNC, Archive. Each gets its own colored pill. The toolbar "Filter by status" picks up the same set automatically. Server boot will backfill any rows still on the old "Active" default to "Active Account" so existing cards do not show a phantom value, and the column default is now "Unqualified".' },
    ],
  },
  {
    version: '3.22.11',
    date: '2026-05-04',
    title: 'Org Flow — Status Saves Reliably + Writes Back To Bullhorn',
    changes: [
      { type: 'minor', text: 'Two fixes for the new client-status dropdown. (1) The status was reverting to Active because the underlying Supabase column was missing — the server now auto-adds clients.status on boot if migration 008 has not been run, mirroring the existing status_changed_at auto-migrate. (2) Status changes now propagate to Bullhorn: on every save, the API also calls Bullhorn update_entity on the linked ClientCorporation. Best-effort — if Bullhorn rejects the value (e.g. READ_ONLY_MODE in sandbox, or the value is not a valid Bullhorn status), the local save still sticks and a banner explains the Bullhorn-side error so you can adjust.' },
    ],
  },
  {
    version: '3.22.10',
    date: '2026-05-04',
    title: 'Org Flow — Hide Bullhorn "Default Contact" Placeholders',
    changes: [
      { type: 'patch', text: 'Bullhorn auto-creates a "Default Contact <CompanyName>" placeholder on every ClientCorporation. Those rows were riding the contact sync into Org Flow and showing up as empty cards on the org chart and in the Healthy Managers stats. Now they are skipped on three sides: the per-client employee fetch hides them on the org chart, the client-health endpoint hides them from the manager / allies counts, and the Bullhorn → Supabase contact sync no longer inserts new ones (firstName = "Default Contact" check). Existing placeholder rows in Supabase stay in the table but are invisible — the table can be cleaned up later with a single SQL delete if desired.' },
    ],
  },
  {
    version: '3.22.9',
    date: '2026-05-04',
    title: 'Org Flow — Status Dropdown Moved Below Action Buttons',
    changes: [
      { type: 'patch', text: 'The client status control no longer floats over the top-right of the card (where it was overlapping the trash / settings icons). It now sits in its own row directly below the Logo / Settings / Delete button strip, with a "STATUS" label on the left and a colored dropdown on the right. The dropdown is always selectable in one click — no more click-to-edit two-step.' },
    ],
  },
  {
    version: '3.22.8',
    date: '2026-05-04',
    title: 'Org Flow — Client Status Pill + Filter',
    changes: [
      { type: 'minor', text: 'Each client card now shows a colored status pill (Active / Prospect / On Hold / Inactive / Lost) — change it without leaving the dashboard. A matching "Filter by status" dropdown sits next to the sort selector so you can drill the grid down to just one status at a time. Existing clients default to Active. Note: the database column is added by migration 008 in the repo — run it once in the Supabase SQL editor before the new dropdown will save.' },
    ],
  },
  {
    version: '3.22.7',
    date: '2026-04-30',
    title: 'Executive Reporting — Card Label Cleanup',
    changes: [
      { type: 'patch', text: 'Renamed four KPI cards to better describe what they measure: "New Placements This Week" → "Starting This Week" (counts placements with a begin date in range), "Active Contractor Headcount" → "Change in Active Contractors for Time Period", "Attrition / Dropouts This Week" → "Backouts Logged", and "New Clients Onboarded" → "New Customers with Reqs". Confirmed the Candidate Submissions card already pulls Bullhorn Sendout records (= client submissions), so no underlying count changed.' },
    ],
  },
  {
    version: '3.22.6',
    date: '2026-04-30',
    title: 'Executive Reporting — Tabs Auto-Snap To Current Week / Month / Quarter',
    changes: [
      { type: 'patch', text: 'Switching between Weekly / Monthly / Quarterly now snaps the date range to that period\'s current value: Weekly → this Sunday through Saturday, Monthly → 1st through last day of this month, Quarterly → first through last day of the current calendar quarter (Q2 = Apr 1 – Jun 30). Initial load opens on Weekly with the current week. The picker still works for ad-hoc ranges; tabs just give a one-click snap back to the natural period.' },
    ],
  },
  {
    version: '3.22.5',
    date: '2026-04-30',
    title: 'Executive Reporting — Date Range Callout On Tab Row',
    changes: [
      { type: 'patch', text: 'The Weekly / Monthly / Quarterly tab row now shows the active date range on the right (e.g. "Apr 26, 2026 - May 2, 2026"), so the range is visible while you read the tab content instead of only next to the page title. The callout reads from the same state as the top date picker — clicking This Week / Last Week / This Month or editing the From / To inputs updates it immediately, and it stays in place when you switch between Weekly, Monthly, and Quarterly.' },
    ],
  },
  {
    version: '3.22.4',
    date: '2026-04-28',
    title: 'Org Flow — Per-Reason Skip Counters For Contact Sync Diagnostic',
    changes: [
      { type: 'patch', text: 'v3.22.3 confirmed the corp-id lookup works (hasIt: true, lookupValue: <UUID>) — so the 661 skips are coming from one of the dedupe checks afterward. Added counters and a startup log: linkedClients, existingEmployees, existingWithBhId, existingByClientEmail set sizes; plus skipNoCorp / skipDupBhId / skipDupEmail buckets. Next sync click will tell us exactly which check is filtering everything (most likely existingByClientEmail catching pre-existing manual rows).' },
    ],
  },
  {
    version: '3.22.3',
    date: '2026-04-28',
    title: 'Org Flow — Verbose Lookup Debug Log For Contact Sync',
    changes: [
      { type: 'patch', text: 'Even with the v3.22.2 String() fix, all 661 contacts were still skipping. Added a one-shot per-run debug log that prints the sample corp id (value + type), the first map key (value + type), the map size, and the actual hasIt/lookupValue results — so the next sync click will tell us definitively whether the keys are strings, numbers, BigInts, or something else, and whether the lookup is genuinely missing or returning a falsy value.' },
    ],
  },
  {
    version: '3.22.2',
    date: '2026-04-28',
    title: 'Org Flow — String-Compare Bullhorn IDs To Avoid bigint/Number Mismatch',
    changes: [
      { type: 'patch', text: 'After v3.22.1 the sample log showed clientCorporation.id = 3457 and corpToClient had 3457 as a key, yet every contact still skipped. Root cause: Supabase returns bigint columns (clients.bullhorn_client_id) as strings to preserve precision, but Bullhorn returns ids as numbers in JSON — Map.get uses strict equality so "3457" !== 3457 and every lookup missed. Switched the dedupe map and lookups to String() on both sides, which works regardless of how the underlying source represents the id. Also future-proofs against any other place where the two sources disagree on int vs string.' },
    ],
  },
  {
    version: '3.22.1',
    date: '2026-04-28',
    title: 'Org Flow — Handle Multiple Shapes For Contact.clientCorporation',
    changes: [
      { type: 'patch', text: 'After v3.22.0 the metadata showed contactsFetched: 661 but contactsInserted: 0 — every contact was getting skipped at the "which Org Flow client?" lookup because c.clientCorporation was coming back as a bare numeric id, not the {id, name} object I assumed. The dedupe now accepts nested object, bare number, or string id. Also logs the first contact\'s shape on each run so any future tenant-specific quirks are visible in Railway logs.' },
    ],
  },
  {
    version: '3.22.0',
    date: '2026-04-28',
    title: 'Org Flow — Auto-Create Employee Cards From Bullhorn Contacts',
    changes: [
      { type: 'minor', text: 'Every linked Org Flow client (those with a bullhorn_client_id) now pulls its ClientContacts from Bullhorn on each sync run and inserts them as employees. Dedupe is two-tiered: by bullhorn_contact_id, and by (client_id, lower(email)) so manually-typed contacts get linked instead of duplicated. Manager hierarchy is left blank — Apt\'s Bullhorn doesn\'t expose reportsTo to this app, so all imported employees land "disconnected" and can be wired up via the existing OrgChart drag-and-drop. The "Sync from Bullhorn" alert now shows the new contact count alongside client counts.' },
      { type: 'patch', text: 'New migration server/migrations/006_orgflow_employees_bullhorn_contact_id.sql (apply in Supabase before deploy) adds the bullhorn_contact_id column on employees plus a partial unique index. Bulk fetch is chunked at 20 corps per Bullhorn call; if any chunk hits the 500-row count cap a warning logs to Railway so we know to paginate.' },
    ],
  },
  {
    version: '3.21.13',
    date: '2026-04-28',
    title: 'Daily Brief — Note Author Is Now The Logged-In User, Not The API Account',
    changes: [
      { type: 'patch', text: 'After v3.21.12 dual-write made Notes appear on the contact\'s Activity tab, the Author column showed "Anthropic Claude AI API" because Bullhorn defaults Note.commentingPerson to whoever holds the auth token (the API service account). The route now passes the signed-in user\'s CorporateUser id through createMeetingNote → bullhorn-mcp\'s add_note, which sets commentingPerson: { id, _subtype: "CorporateUser" } on the Note. Author now shows the actual user (e.g., Chris Schwab). Pair with bullhorn-mcp commit that adds the commentingPersonId field to handleAddNote.' },
    ],
  },
  {
    version: '3.21.12',
    date: '2026-04-28',
    title: 'Daily Brief — Dual-Write Appointment + Note for Contact-Activity Visibility',
    changes: [
      { type: 'patch', text: 'Chris confirmed: he opened ClientContact 28051 (Brian Somerford) directly and the Appointment was NOT on his Activity tab — even though the Appointment was created with the right Subject, dateAdded, clientContactReference, and an AppointmentAttendee junction. Apt\'s Bullhorn Activity tab renders Notes, not Appointments. Dual-write fix: keep creating the Appointment (drives MAR via the AM dashboard\'s clientContactReference query) AND also create a Bullhorn Note attached to the contact with action=meeting type and subject/comments, which is what surfaces on the Activity tab. Required updating bullhorn-mcp\'s add_note to accept ClientContact (was Candidate/JobOrder only).' },
    ],
  },
  {
    version: '3.21.11',
    date: '2026-04-28',
    title: 'Daily Brief — Modal Verify Copy Points At The Contact\'s Activity Tab',
    changes: [
      { type: 'patch', text: 'After v3.21.10, the AppointmentAttendee junction was being created successfully (id #17986 in James\'s test) but searching the Appointment id (37807) in Bullhorn\'s general Find returned Candidate 37807 (Frank Fishburn) — same number, different entity. Bullhorn ids are scoped per entity type so the same number can mean different records. Updated the modal copy to direct users to open the linked ClientContact and check its Activity tab — that\'s where the new appointment will actually appear, since the junction record now ties them together.' },
    ],
  },
  {
    version: '3.21.10',
    date: '2026-04-28',
    title: 'Daily Brief — AppointmentAttendee Uses Polymorphic `attendee` Field',
    changes: [
      { type: 'patch', text: 'Diagnostic from v3.21.9: the appointment was being created correctly (subject + dateAdded matched the meeting) but the AppointmentAttendee junction was failing with "missing required property: attendee, type: MISSING_REQUIRED". Bullhorn\'s AppointmentAttendee uses a polymorphic `attendee` person reference, not separate `clientContact`/`candidate` fields. Switched to `attendee: { id, _subtype: "ClientContact" }` (or "Candidate") so the junction record actually persists — once it does, the appointment will appear on the linked contact\'s Activity tab in Bullhorn.' },
    ],
  },
  {
    version: '3.21.9',
    date: '2026-04-28',
    title: 'Daily Brief — Create AppointmentAttendee + Show Verify Row in Modal',
    changes: [
      { type: 'patch', text: 'Two changes targeting the "appointment created but not on contact record" symptom: (1) the route now creates an AppointmentAttendee junction row after the Appointment, since Bullhorn\'s contact-Activity tab queries that junction (clientContactReference alone is enough for our MAR/dashboard reads but not for the contact UI). (2) The Log Activity modal now shows the verify row read back from Bullhorn — Subject, Created date, linked ClientContact name+id, and AppointmentAttendee junction status — so you can immediately tell whether the right meeting was logged or whether Bullhorn echoed an existing id.' },
    ],
  },
  {
    version: '3.21.8',
    date: '2026-04-28',
    title: 'Daily Brief — Verify the Created Appointment + Detect Echo Failures',
    changes: [
      { type: 'patch', text: 'Diagnostic: when Chris ran v3.21.7, the modal showed Bullhorn Appointment ID 37803 but searching that ID in Bullhorn opened ClientContact 37803 (Alex Francis) — the same number Chris had typed as the contact ID. Bullhorn was silently failing the create and echoing the input clientContactReference.id back as changedEntityId. The route now (a) checks changedEntityType is "Appointment", and (b) reads the appointment back via query_entity to confirm it actually exists. If either check fails the modal shows a clear "Bullhorn echoed an existing entity id" error pointing at Railway logs. The bullhorn-mcp side now logs the full PUT response so the next attempt produces a complete trace.' },
    ],
  },
  {
    version: '3.21.7',
    date: '2026-04-28',
    title: 'Daily Brief — Log Activity Now Shows the Bullhorn Appointment ID',
    changes: [
      { type: 'patch', text: 'After paired bullhorn-mcp deploy that adds the create_entity tool, the modal now stays open on success and shows the Bullhorn Appointment ID it just created. Click Done to close. The ID is selectable for paste into Bullhorn (Apps → Find → Appointment) so you can verify exactly where the new record landed instead of guessing whether the create silently failed. If the server reports success without an ID, the modal flags it and points at the Railway [createAppointment] log line.' },
    ],
  },
  {
    version: '3.21.6',
    date: '2026-04-28',
    title: 'Daily Brief — Log Activity Now Surfaces Bullhorn Errors + Sets `dateEnd`',
    changes: [
      { type: 'patch', text: 'The "Log activity" modal in the Last 7 Days section was silently reporting success even when Bullhorn rejected the create. Two fixes: (1) `dateEnd` is now sent on every Appointment create (Bullhorn requires it; previously only `dateBegin` + `duration` were sent so creates were silently rejected), and (2) when Bullhorn returns a non-JSON error the MCP wraps it as { message: "..." } — the route now detects that shape and returns a 502 with the rejection text so the modal shows what failed instead of fake-succeeding. Apply server/migrations/003_meeting_activity_logged.sql in Supabase if you haven\'t — without it the ✓ Logged badge resets on reload.' },
    ],
  },
  {
    version: '3.21.5',
    date: '2026-04-27',
    title: 'Org Flow — Allow Cards With No Matched Account Manager',
    changes: [
      { type: 'patch', text: 'Sync was failing with `null value in column "created_by" of relation "clients" violates not-null constraint` when a Bullhorn ClientCorporation\'s owner email did not match any user_profiles row. Apply migration server/migrations/005_orgflow_clients_created_by_nullable.sql in Supabase to drop the NOT NULL constraint — the dashboard already renders nullable account_manager safely. Auto-created cards with no matched manager will show a blank Account Manager until someone edits the card.' },
    ],
  },
  {
    version: '3.21.4',
    date: '2026-04-27',
    title: 'Org Flow — Drop `isDeleted` From Bullhorn Sync WHERE',
    changes: [
      { type: 'patch', text: 'Bullhorn rejected the sync query with "Where clause \'isDeleted\' at position 1 is not a valid field name." ClientCorporation does not expose isDeleted (only entities like JobOrder and ClientContact do). Replaced the WHERE with id > 0 for the initial backfill and dateLastModified > X for incremental runs — matches the field surface of the existing getClientCorporations helper.' },
    ],
  },
  {
    version: '3.21.3',
    date: '2026-04-27',
    title: 'Org Flow — Surface Bullhorn Error Text on Sync',
    changes: [
      { type: 'patch', text: 'When Bullhorn rejects the sync query (bad field name, bad WHERE, etc.) the MCP wraps the raw error string as { message: "..." } instead of returning structured data. The sync was treating that as "no rows" and silently writing 0/0/0 to sync_state. It now throws the message text into last_error in Supabase and into Railway logs, so the actual Bullhorn complaint is visible without grepping logs.' },
    ],
  },
  {
    version: '3.21.2',
    date: '2026-04-27',
    title: 'Org Flow — Bullhorn Sync `owner` → `owners` Fix',
    changes: [
      { type: 'patch', text: 'After dropping the status filter, the sync was still fetching 0 corps. Root cause: my fields list referenced owner(...) (TO_ONE subselect), but ClientCorporation actually has owners (TO_MANY) — an invalid field reference makes Bullhorn silently return zero rows. Switched to the same `owners` shape the existing getClientCorporations helper uses, and updated the account-manager mapping to read corp.owners[0].email. Also added a one-line server log on each sync so we can see fetched count and response shape in Railway logs going forward.' },
    ],
  },
  {
    version: '3.21.1',
    date: '2026-04-27',
    title: 'Org Flow — Bullhorn Sync Status Filter Removed',
    changes: [
      { type: 'patch', text: 'First sync after deploy returned 0 fetched / 0 inserted / 0 linked because the WHERE clause used a literal status = "Active" that did not match Apt\'s tenant. Dropped the status filter so the sync now pulls every non-deleted ClientCorporation. Trade-off: archived / inactive corps will surface as Org Flow cards on the next run — delete them from Org Flow as needed, or we can re-add a status filter later once we know the exact value(s) Apt uses.' },
    ],
  },
  {
    version: '3.21.0',
    date: '2026-04-27',
    title: 'Org Flow — Auto-Create Client Cards From Bullhorn',
    changes: [
      { type: 'minor', text: 'New clients created in Bullhorn now flow into Org Flow automatically. A background job runs every 30 minutes and pulls every active ClientCorporation; new corps become new Org Flow cards, existing cards with the same name get linked (case-insensitive), and the Bullhorn owner email is mapped to the matching user_profiles record so the Account Manager populates without a manual edit. The new bullhorn_client_id column on the clients table is the durable link going forward — name drift in Bullhorn keeps the card synced without creating a duplicate.' },
      { type: 'minor', text: 'Org Flow dashboard adds a "Sync from Bullhorn" button next to Import Clients for on-demand pulls between cron runs. The result toast reports new / linked / updated counts, the button shows a spinning icon while running, and a concurrent click is rejected so two syncs cannot stomp each other.' },
      { type: 'patch', text: 'Adds server/migrations/004_orgflow_bullhorn_sync.sql (apply via Supabase SQL editor before deploy) for the new bullhorn_client_id column and a sync_state watermark table. The sync only refetches ClientCorporations modified since the last successful run, so steady-state pulls are small.' },
    ],
  },
  {
    version: '3.20.4',
    date: '2026-04-27',
    title: 'Req Board — On The Board Triggered by Offer Extended',
    changes: [
      { type: 'patch', text: 'The "On The Board" stat now populates the moment a candidate’s submission status hits "Offer Extended" in Bullhorn (was: when the JobOrder was manually moved to "Filled"). The tile and modal still show one row per req with the candidate name(s) in the Candidate column — layout, sorting, owner filter, and inline edits are unchanged. Jobs whose status is "Filled" but with no Offer Extended candidate no longer appear; jobs with an Offer Extended candidate now appear regardless of JobOrder status.' },
    ],
  },
  {
    version: '3.20.3',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 Drill-Down Column Mapping Fix',
    changes: [
      { type: 'patch', text: 'Candidate Submissions and New Reqs drill-down modals were rendering "\u2014" in every column except Job Title because the modal column keys didn\'t match the server response field names. Submissions now reads candidateName / companyName / submittedBy / dateAdded (instead of candidate / client / recruiter / date) and New Reqs reads jobId / openings / priority (instead of id / numOpenings). The other modals already used matching keys and were not affected.' },
    ],
  },
  {
    version: '3.20.2',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 Potential New Input Formula Aligned to Req Board',
    changes: [
      { type: 'patch', text: 'Potential New Input was using ((Bill \u2212 Pay) \u00d7 1.25) \u00d7 2080 \u00d7 Openings, which annualized the gross spread and applied the 1.25 markup to the wrong side of the calculation. It is now the same per-opening formula the Req Board uses for ceSpread / permFee, multiplied by # of openings: Contract = (Bill \u2212 Pay \u00d7 1.25) \u00d7 40 weekly, Corp-to-Corp = (Bill \u2212 Pay \u00d7 1.05) \u00d7 40 weekly, Direct Hire = (Salary \u00d7 Fee%) / 26 weekly amortization. Direct Hire reqs are now included (the old formula required bill+pay so perm jobs were silently dropped). The breakdown modal now shows Type, Rate / Salary, Per Opening / Wk, and Total / Wk columns instead of Bill / Pay so perm rows render meaningfully. Current New Input was already on the same weekly basis \u2014 the two values are now apples-to-apples.' },
    ],
  },
  {
    version: '3.20.1',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 Drill Into Every Live Tile',
    changes: [
      { type: 'minor', text: 'Every live tile on Executive Reporting is now clickable. Click opens a sortable modal with the underlying records \u2014 same pattern as the existing Current/Potential New Input drill-downs. Weekly: New Reqs, New Placements, Candidate Submissions, Offers Extended & Accepted, Active Contractor Headcount, Attrition / Dropouts, Revenue/Spread/Pipeline. Monthly: New Hires vs Attrition (combined hire/attrition view), Active Clients (with placement counts), New Clients Onboarded, Client Retention (with Yes/No retained column), Off-boards Next 30d, YTD New Input. Quarterly: Talent Pipeline funnel (rows tagged by stage) and Key Client Reviews (tier + health + active count). Each modal table has clickable headers for ascending/descending sort.' },
      { type: 'patch', text: 'The three executive endpoints now return per-metric detail arrays alongside the count/value fields, so the modals open without an additional fetch. Coming Soon placeholder tiles stay non-interactive \u2014 no click affordance, no modal.' },
    ],
  },
  {
    version: '3.20.0',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 Most Bullhorn Tiles Live',
    changes: [
      { type: 'minor', text: 'Ten more Executive Reporting tiles now show live numbers instead of "Coming Soon". Weekly tab adds Active Contractor Headcount \u0394 vs prior week, Attrition / Dropouts (backout notes), and Offers Extended & Accepted (with breakdown subtitle). Monthly tab fills in New Hires vs Attrition (Net), Active Clients, New Clients Onboarded, Client Retention Rate, Contractor Headcount + Off-boards Next 30 Days, and YTD New Input. Quarterly tab adds the Talent Pipeline Health funnel \u2014 placements count headline with the full Lead \u2192 Sub \u2192 Interview \u2192 Placement chain in the subtitle. The toolbar date range continues to drive every tab; switching tabs no longer re-fetches data the other tab already pulled in this session.' },
      { type: 'minor', text: 'Three new admin-only API endpoints back the dashboard: /api/reporting/executive-weekly, /executive-monthly, and /executive-quarterly. Each fans out parallel Bullhorn queries server-side and returns a single aggregated payload, so a tab open is one round-trip instead of five. New Bullhorn helpers \u2014 countActivePlacementsAsOf (point-in-time headcount), getOffboardsInWindow (placements ending in a window), and getOffersExtendedInRange \u2014 live in server/lib/bullhorn.js for reuse.' },
      { type: 'patch', text: 'Tiles still pending external integration \u2014 Gross / Net Revenue, AR Aging, Payroll & Benefits, Compliance, P&L, GP vs Budget, Cost-Saving, Revenue Forecast, Budget vs Actuals, Headcount Plan vs Actuals, Regulatory Audit, Vendor Review, Client Escalations, Collections \u2014 keep their Coming Soon styling and tooltips describing the missing data source. Those unblock once accounting / payroll / compliance systems are connected.' },
    ],
  },
  {
    version: '3.19.1',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 First Live Tiles',
    changes: [
      { type: 'minor', text: 'Six tiles on Executive Reporting now show live data instead of "Coming Soon": New Reqs, New Placements This Week, Candidate Submissions, Active Contractor Headcount, and Revenue / Spread / Pipeline on the Weekly tab; Key Client Reviews & Health Scores on the Quarterly tab. The Weekly tab pulls counts from the existing sales-dashboard, recruiter-dashboard, stats, and executive-dashboard endpoints; the Quarterly client-health tile shows total active clients with a green / yellow / red breakdown subtitle. The toolbar date range now drives all three tabs. Remaining tiles stay as Coming Soon placeholders.' },
      { type: 'patch', text: 'Active Contractor Headcount label dropped the "(\u0394 vs prior week)" suffix until the prior-period comparison ships \u2014 the tile now reads as a current snapshot with a "\u0394 vs prior week coming soon" subtitle to set the right expectation.' },
    ],
  },
  {
    version: '3.19.0',
    date: '2026-04-27',
    title: 'Executive Reporting \u2014 Layout Shell',
    changes: [
      { type: 'minor', text: 'New Executive Reporting view at Reporting \u2192 Executive Reporting. The existing Current / Potential New Input cards now live in a pinned "New Input \u2014 Live" strip at the top of the page so they stay visible regardless of which section you\u2019re in. Below them, three tabs \u2014 Weekly, Monthly, Quarterly \u2014 lay out the full executive KPI vision: 9 weekly tiles (new reqs, placements, submissions, offers, contractor headcount, attrition, escalations, spread, collections), 14 monthly tiles (gross/net revenue, AR aging, hires vs attrition, paying clients, retention, payroll, P&L, GP vs budget, contractor margins, YTD trackers, cost-saving), and 8 quarterly tiles (full P&L, revenue forecast, budget vs actuals, headcount plan, pipeline health, client reviews, compliance audit, vendor review).' },
      { type: 'patch', text: 'Every tile in this release is a "Coming Soon" placeholder \u2014 same dimensions as a live KPI card, dashed border, gold pill badge top-right, and a hover tooltip describing the eventual data source (Bullhorn, accounting system, payroll, etc.). The structure ships first so tile order, labels, and groupings can be tuned cheaply before any data wiring begins. Live data wiring lands in subsequent updates, starting with the Bullhorn-backed weekly metrics.' },
    ],
  },
  {
    version: '3.18.1',
    date: '2026-04-27',
    title: 'Real-Time Req Board \u2014 Cache Removed',
    changes: [
      { type: 'patch', text: 'Fixed inline edits (most visibly the AM column) appearing to "blink" and revert. Removed the 30-second server-side cache on Bullhorn reads (open jobs, recently closed jobs, client submissions, offer-extended subs, corporate users) so every refresh tick pulls live data straight from Bullhorn. Trade-off: simultaneous logins now fan out to Bullhorn instead of sharing one cached response \u2014 acceptable given current usage.' },
    ],
  },
  {
    version: '3.18.0',
    date: '2026-04-24',
    title: 'Sales Dashboard \u2014 Fills/Losses/Washes by Priority (A/B/C)',
    changes: [
      { type: 'minor', text: 'Replaced the Fills/Losses/Washes bar chart with a per-AM priority breakdown table. Each row shows three column groups (Priority A, B, C), each with Reqs / Fills / Lost / Wash, plus a Total Closed column and a Total row across all AMs. Any cell with underlying reqs is clickable and opens the existing job-detail modal filtered to that priority + outcome.' },
      { type: 'patch', text: 'Backend closed-jobs query now pulls the Bullhorn priority (type) field so the dashboard can bucket each closed req into A/B/C without a follow-up lookup.' },
    ],
  },
  {
    version: '3.17.0',
    date: '2026-04-23',
    title: 'Apt Health \u2014 Drill Into Activity & Real Meeting Counts',
    changes: [
      { type: 'minor', text: 'Activities (14d) and Real Mtg. (90d) cells on the client health table are now clickable. Click opens a sortable modal listing the underlying Bullhorn appointments (ID link, Type, Subject, Date, Owner, Contact). The Activities view shows all appointment types in the 14-day window; the Real Meetings view shows only the eight BD types (In Person Meetings, New Meeting, Req Qual, Referral Meeting, OOA, Dinner, Sol Disc Meeting, Sol Pitch Meeting) in the 90-day window. Appointment IDs link directly to the record in Bullhorn.' },
      { type: 'patch', text: 'Bullhorn appointment query extended to include Subject and owner first/last name so the modal can render useful context without follow-up lookups.' },
    ],
  },
  {
    version: '3.16.3',
    date: '2026-04-23',
    title: 'Apt Health \u2014 In-Person Type List Aligned',
    changes: [
      { type: 'patch', text: 'HEALTH_CONFIG.IN_PERSON_TYPES now uses the same eight confirmed BD appointment types as REAL_MEETING_TYPES. Used by the Higher Up tier\u2019s in-person-months check, which will activate once org-tree data lands.' },
    ],
  },
  {
    version: '3.16.2',
    date: '2026-04-23',
    title: 'Apt Health \u2014 Real Meeting Types Confirmed',
    changes: [
      { type: 'patch', text: 'Swapped the placeholder real-meeting whitelist for the confirmed Apt appointment types: In Person Meetings, New Meeting, Req Qual, Referral Meeting, OOA, Dinner, Sol Disc Meeting, Sol Pitch Meeting. Real Mtg. (90d) counts and new-scoring thresholds now count exactly these eight types. In-person subset (used by the Higher Up tier) still uses placeholder values \u2014 Higher Up remains inert until org-tree data lands, so no live impact yet.' },
    ],
  },
  {
    version: '3.16.1',
    date: '2026-04-23',
    title: 'Apt Health \u2014 Column Labels',
    changes: [
      { type: 'patch', text: 'Renamed the Health column to "Old Scoring" and the Framework column to "New Scoring" on the client health table \u2014 makes the parallel-rollout intent explicit. Tooltip prefixes updated to match.' },
    ],
  },
  {
    version: '3.16.0',
    date: '2026-04-23',
    title: 'Apt Health \u2014 Framework Scoring (Parallel Rollout)',
    changes: [
      { type: 'minor', text: 'New client health framework runs alongside the existing score during validation. Each row now shows a Tier (Onboarding / Hiring Manager / Higher Up / Outlier), a Framework dot (green/yellow/red or \u2014 for Onboarding) with a direction arrow (\u2193 cooling / \u2191 warming) on yellow rows, and a Real Mtg. (90d) count filtered to real appointment types only. Old Health, Activities (14d), and Score columns are unchanged.' },
      { type: 'minor', text: 'Hover any score in the table to see how it was derived \u2014 tooltips on Health, Score, Tier, Framework, and Real Mtg. (90d) list the exact inputs and the tier-specific thresholds that produced the result.' },
      { type: 'patch', text: 'Framework config (appointment type whitelists, onboarding window, direction threshold, per-tier thresholds) lives in a single HEALTH_CONFIG block in server/routes/clientHealth.js so thresholds can be tuned without touching logic. Org-tree data and referral-placement source are stubbed until those inputs land; Higher Up and Outlier tiers activate automatically once the stubs are swapped for real data.' },
    ],
  },
  {
    version: '3.15.7',
    date: '2026-04-23',
    title: 'Near Real-Time Req Board',
    changes: [
      { type: 'minor', text: 'Auto-refresh cadence dropped from 2 minutes to 20 seconds on the Req Board and Operations Placements tracker. Colleagues\' edits now show up within 20 seconds instead of two minutes. The server-side 30-second cache and in-flight request de-duplication absorb the extra polls — upstream Bullhorn load stays flat.' },
      { type: 'fix', text: 'Inline text cells (Notes, Deadline, Follow Up, 48hr) now update the displayed value from a local safety-net state the instant you commit, so there is zero frame where the old value is still visible while the parent\'s optimistic update propagates. Previously React\'s batching handled this in most cases, but under load or on slower devices a sub-frame flicker could appear.' },
      { type: 'patch', text: '"Updated Xs ago" pill now ticks every 5 seconds instead of 15 so the freshness indicator keeps up with the faster refresh cadence.' },
    ],
  },
  {
    version: '3.15.6',
    date: '2026-04-23',
    title: 'Daily Brief — Evening Greeting',
    changes: [
      { type: 'patch', text: 'Masthead greeting now has three buckets instead of two: "Good morning" before noon, "Good afternoon" until 6pm, and "Good evening" after.' },
    ],
  },
  {
    version: '3.15.5',
    date: '2026-04-23',
    title: 'Daily Brief — Masthead Copy Polish',
    changes: [
      { type: 'patch', text: 'Masthead greeting now switches based on the time of day \u2014 "Good morning" before noon, "Good afternoon" after. The first name is pulled from your Bullhorn profile when available (which is always "First Last"), with a defensive fallback for MSAL accounts that return "Last, First" so nobody gets greeted as "Buchholz".' },
      { type: 'patch', text: 'Subtitle changed from "Three things that need you today." to "What needs attention today." \u2014 matches the scrollable Priorities stack shipped in v3.14.1, which already stopped capping at three items.' },
    ],
  },
  {
    version: '3.15.4',
    date: '2026-04-23',
    title: 'Daily Brief — Stale Clients Drawer',
    changes: [
      { type: 'patch', text: 'Renamed the AM "Stale client contacts" tile to "Stale clients" for brevity.' },
      { type: 'minor', text: 'Clicking the Stale clients tile now opens an inline drawer on the Daily Brief listing the contacts (name, client, email, direct Bullhorn link) instead of navigating away to Apt Health. Sorted by client then last name so you can work through multiple contacts at the same company back-to-back. Contact emails are clickable (mailto:) and the Bullhorn button opens the contact record in a new tab.' },
    ],
  },
  {
    version: '3.15.3',
    date: '2026-04-23',
    title: 'Instant Edits on the Req Board',
    changes: [
      { type: 'minor', text: 'Edits on the Req Board and Job Detail panel now update the UI immediately — no more waiting for the round-trip before you see your change. The save happens in the background; if it fails, the cell reverts and you see a toast.' },
      { type: 'fix', text: 'Rapid back-to-back edits on the same req no longer trigger a spurious "Someone else edited this" conflict dialog. Saves now chain per job so each one reads the latest version from the previous save\'s response.' },
      { type: 'patch', text: 'Auto-refresh stays paused until every in-flight save on the board has completed, so a background poll can\'t overwrite an edit that\'s still being written.' },
    ],
  },
  {
    version: '3.15.2',
    date: '2026-04-23',
    title: 'Req Board — Accurate Client Submission Counts',
    changes: [
      { type: 'patch', text: 'Fixed the inline # CS count undercounting on some jobs (e.g. job 2031 showing 2 when Bullhorn had 4). The JobSubmission query used to pull the 500 most recent client-stage submissions across all of Bullhorn; once older Placed/Interview records piled past that cap, submissions for newer jobs were silently dropped. The query is now scoped to just the jobs currently on the board, so the cap can no longer truncate results.' },
    ],
  },
  {
    version: '3.15.1',
    date: '2026-04-23',
    title: 'Daily Brief — Tile Tooltips',
    changes: [
      { type: 'patch', text: 'Hover (or keyboard-focus) any of the four "Today at a glance" tiles to see a tooltip explaining how the number is calculated — which Bullhorn fields and filters feed it, and which closed statuses are excluded. Screen readers announce the tooltip alongside the label via aria-label.' },
    ],
  },
  {
    version: '3.15.0',
    date: '2026-04-23',
    title: 'Daily Brief — Role-Aware Stats',
    changes: [
      { type: 'minor', text: 'The four "Today at a glance" tiles now split by Bullhorn role. Account Managers see Missed / Missing Follow-ups & Deadlines, Stale Client Contacts, Potential Input (sum of deal value on owned open jobs), and Open A & B Reqs. Recruiters see Candidates In Play (interview/offer stages), Assigned Reqs without a Client Submission, Pending 30 / 90 Check-ins, and Pending Input (sum of deal value on assigned open jobs).' },
      { type: 'minor', text: 'Clicking an AM\u2019s Missed / Missing tile opens an inline-editable drawer listing every flagged req \u2014 type or paste a date in the Deadline or Follow-up field, tab out to save, and close to refresh the tile count. Saves flow through the same optimistic-locking path the Req Board uses.' },
      { type: 'minor', text: 'Each tile is clickable and deep-links to the underlying page \u2014 Potential Input / A&B Reqs / Assigned Reqs / Pending Input jump to the Req Board, Stale Contacts to Client Health, and Pending 30 / 90 Check-ins to your Performance dashboard.' },
      { type: 'patch', text: 'Admin users default to the AM (sales) view for now. A dedicated Executive view is planned for a follow-up release.' },
      { type: 'patch', text: 'The Priorities section is unchanged \u2014 same scoring, same scroll behavior.' },
    ],
  },
  {
    version: '3.14.2',
    date: '2026-04-23',
    title: 'Req Board — Job Title Link Color',
    changes: [
      { type: 'patch', text: 'Job Title links on the Req Board now render in dark blue instead of gold, making them easier to read against the row background.' },
    ],
  },
  {
    version: '3.14.1',
    date: '2026-04-23',
    title: 'Daily Brief — Scrollable Priority Stack',
    changes: [
      { type: 'patch', text: 'The Priorities section now shows every flagged req instead of capping at the top 3. The visible size is locked (~560px, roughly three cards tall) and the list scrolls inside that window so the rest of the dashboard stays in place.' },
      { type: 'patch', text: 'Framing moved from the first card to the container — the 2px navy top rule now anchors the whole scroll region even when you scroll past the top card.' },
    ],
  },
  {
    version: '3.14.0',
    date: '2026-04-23',
    title: 'Daily Brief — Points-Based Priorities',
    changes: [
      { type: 'minor', text: 'Priority cards are now ranked by a points system rather than age. A req earns 1 point each for: (a) still in Accepting Candidates and open 2+ weeks, (b) a missed deadline, (c) a missed follow-up. Cards are ordered most points first; ties break on oldest dateAdded.' },
      { type: 'minor', text: 'Pill color now reflects the most severe flag on the card — red "DEADLINE MISSED", gold "FOLLOW-UP DUE", or gold "STALE". Context line lists every flag that tripped, followed by employment type and location.' },
      { type: 'patch', text: 'Priority candidate pool is no longer restricted to A/B reqs — any of your reqs with at least one flag is eligible.' },
      { type: 'patch', text: 'Empty state copy updated: "Nothing flagged on your board right now — no stale reqs, missed deadlines, or overdue follow-ups."' },
    ],
  },
  {
    version: '3.13.0',
    date: '2026-04-23',
    title: 'Universal Search — Cmd+K Across M365 + Bullhorn',
    changes: [
      { type: 'major', text: 'New Cmd+K / Ctrl+K command palette searches across Microsoft 365 (email, files, calendar, people) and Bullhorn (jobs, candidates) in parallel. Results are grouped by type, keyboard navigable (↑↓ nav, ↵ open, Esc close), and open the source item in a new tab with one click.' },
      { type: 'minor', text: 'New "Search everything…" item added to the sidebar just above Quick Links — click the item or press ⌘K from anywhere in the app to open the palette.' },
      { type: 'minor', text: 'Results page preserves hit highlighting from Graph Search, groups by People / Jobs / Candidates / Files / Emails / Events, and shows a "See all N →" inline expander per group. Partial failures (one source down) show a warning banner and still render whatever came back.' },
      { type: 'minor', text: 'Recent searches persist in localStorage — up to 5 recent queries appear as chips on the empty state.' },
      { type: 'patch', text: 'Backend /api/search caches per-user query results for 60 seconds (reusing the existing in-flight-dedup cache) so repeat searches return instantly.' },
    ],
  },
  {
    version: '3.12.0',
    date: '2026-04-23',
    title: 'Goal Tracking — The Quarterly Ledger',
    changes: [
      { type: 'major', text: 'Goal Tracking has been rebuilt as "The Quarterly Ledger" — an editorial layout matching the Daily Brief vocabulary. Serif masthead headline, gold hairline rule, a quarter switcher with a hairline through-quarter indicator, a tabbed filter bar (All / My Goals / Company Priorities) with owner and status dropdowns, and a single continuous goal list instead of separate cards.' },
      { type: 'minor', text: 'Goal rows redesigned: serif index numbers on roots, gold-tinted avatar + "COMPANY PRIORITY" micro-eyebrow for company priorities, status dot + uppercase label (ON TRACK / AT RISK / OFF TRACK / COMPLETE) in place of the old black ROLLUP pill, 2px hairline progress rules with a serif percentage readout, and tinted navy-50 bleed rows for nested sub-goals so the hierarchy reads as a distinct band.' },
      { type: 'minor', text: 'New right-hand side rail: "The quarter at a glance" 2×2 stats (active goals, company priorities, on-track count, aggregate progress) and a "Distribution" block with a stacked hairline bar + three-row legend.' },
      { type: 'minor', text: 'Route moved to /goals; legacy /goal-tracking now redirects to /goals so existing bookmarks keep working. URL now carries the current quarter as ?q=2026-Q2 and archive state as ?archived=2026-Q1.' },
      { type: 'minor', text: 'New archive view: footer shows "Plus N archived goals from {prev quarter}" with a "View archive →" button that loads a read-only ledger of archived goals for that period. Server adds GET /api/goals?archived=true&period=X and an archivedCount on the live response.' },
      { type: 'patch', text: 'Responsive breakpoints tuned: below 1200px the side rail stacks under the ledger; below 900px status labels collapse to dots only and the watermark hides; below 680px goal rows fold into a two-line layout.' },
    ],
  },
  {
    version: '3.11.3',
    date: '2026-04-23',
    title: 'Daily Brief — Clickable Stats',
    changes: [
      { type: 'minor', text: 'All four "Today at a glance" stats are now click-through. Active jobs opens the Req Board; New Input QTD, Placements QTD, and Client Submissions each open your Individual Performance dashboard where the detail rows live.' },
      { type: 'patch', text: 'Hover state darkens the top border and stat value to signal the interaction.' },
    ],
  },
  {
    version: '3.11.2',
    date: '2026-04-23',
    title: 'Daily Brief — Masthead & Announcement Polish',
    changes: [
      { type: 'patch', text: 'Masthead volume number now shows the short-form year (e.g. Vol. 26 for 2026) instead of a years-since-2023 counter.' },
      { type: 'patch', text: 'Announcement card footer now reads "Last Updated: MON 3:28 PM" — the author email is no longer shown.' },
    ],
  },
  {
    version: '3.11.1',
    date: '2026-04-23',
    title: 'Daily Brief — Live Priorities & New Input Stat',
    changes: [
      { type: 'minor', text: 'The three priority cards now pull live from your Req Board — the three oldest A or B reqs in "Accepting Candidates" assigned to you, with the oldest at the top. Cards auto-populate with the client, the title, days open, employment type, and location.' },
      { type: 'minor', text: 'Swapped "Submittals this week" for "New Input QTD" in the side-rail stat grid, formatted as compact currency (e.g. $87K) from the same source as your Recruiter Dashboard.' },
      { type: 'patch', text: 'If you have no A or B Accepting Candidates reqs, the priorities section shows a friendly italic "No A or B reqs..." empty state instead of placeholder cards.' },
      { type: 'patch', text: 'Retired the placeholder demo data — every card on the dashboard is now wired to real Req Board and Performance data.' },
    ],
  },
  {
    version: '3.11.0',
    date: '2026-04-23',
    title: 'Daily Brief — Dashboard Redesign',
    changes: [
      { type: 'major', text: 'The home dashboard has been rebuilt as "The Daily Brief" — an editorial, priorities-first morning page. A serif masthead headline greets you by name, followed by three ranked priority cards (URGENT / INTERVIEW / OFFER) with client context and a one-click action per card. A footer row links directly to the full Req Board.' },
      { type: 'minor', text: 'Right-hand side rail now packs three focused blocks: "Today at a glance" (Active jobs assigned, Submittals this week, Placements QTD, Client submissions QTD pulled live from the performance API), "Your day" (today\'s Outlook meetings in a clean agenda list with Teams join links), and a single Announcement block in navy with the quote-glyph flourish.' },
      { type: 'minor', text: 'Typography system upgraded — Cormorant Garamond for editorial serif moments (masthead headline, big stat numbers, priority titles), Inter for UI, JetBrains Mono for timestamps. Gold is now an accent only, not a fill.' },
      { type: 'patch', text: 'Retired the standalone Calendar widget — its data source (Microsoft Graph) now powers the side-rail "Your day" agenda. All-day events continue to be filtered out.' },
      { type: 'patch', text: 'Retired the Reminders card and its backend routes. Announcements remain and drive the navy card in the side rail.' },
      { type: 'patch', text: 'Fully responsive: under 1100px the side rail stacks below priorities; under 720px the masthead shrinks and the stat grid collapses to a single column.' },
    ],
  },
  {
    version: '3.10.0',
    date: '2026-04-22',
    title: 'Calendar Widget on Dashboard',
    changes: [
      { type: 'minor', text: 'New Calendar widget on the home dashboard below Reminders — today\'s Outlook calendar pulled live from Microsoft Graph. Header shows meeting count and total hours; a "Next up" hero callout surfaces the in-progress or next meeting with a one-click Teams join button.' },
      { type: 'minor', text: '8 AM–6 PM vertical timeline with meeting blocks positioned by start time and sized by duration. Overlapping meetings render side-by-side so nothing gets hidden, and a red "now" line marks the current time. Click any meeting to expand an inline detail panel with attendees, location, body preview, and Teams join link. Events outside 8 AM–6 PM roll up into "+ N earlier / + N later" toggles.' },
      { type: 'minor', text: 'Mobile (under 640px) collapses the timeline to a simple chronological list with the same click-to-expand detail.' },
      { type: 'patch', text: 'All-day events are excluded so they don\'t inflate the meeting count, dominate the "Next up" callout, or clutter the timeline.' },
      { type: 'patch', text: 'Calendars.Read scope is acquired incrementally — separate from login, so users who never open the widget aren\'t prompted. Admin-granted tenant-wide so there\'s no per-user consent popup on first load.' },
    ],
  },
  {
    version: '3.9.2',
    date: '2026-04-22',
    title: 'Faster Auto-Refresh',
    changes: [
      { type: 'patch', text: 'Auto-refresh cadence on the Req Board and Operations Placements tracker dropped from 5 minutes to 2 minutes. Edits by colleagues now show up more than twice as fast. Server-side 30-second cache + in-flight request de-duplication absorb the extra polls, so upstream load on Bullhorn barely changes.' },
    ],
  },
  {
    version: '3.9.1',
    date: '2026-04-22',
    title: 'Org Flow — Import Cache Fix',
    changes: [
      { type: 'fix', text: 'Newly imported clients and employees (and reporting-relationship updates) now appear immediately after a successful upload. The global 5-minute browser cache was masking updates so the UI looked unchanged until the cache expired — GETs on Org Flow routes now send Cache-Control: no-store so the browser always revalidates.' },
    ],
  },
  {
    version: '3.9.0',
    date: '2026-04-21',
    title: 'Pipeline — Convert Opportunity to Job',
    changes: [
      { type: 'minor', text: 'New "Convert → Job" button on every Pipeline row. Opens a modal prefilled with the Opportunity\'s title, client, owner, deal value, and close date; AM fills in employment type, # openings, remote, pay/bill rate, salary range, and client contact. On save, creates a new JobOrder in Bullhorn, marks the Opportunity Closed-Won, and drops a Bullhorn Note on the Opportunity linking to the new req. The new req appears on the Req Board at the next refresh.' },
    ],
  },
  {
    version: '3.8.0',
    date: '2026-04-21',
    title: 'Concurrency Safety & Reliability',
    changes: [
      { type: 'minor', text: 'Save failures now surface as toasts with one automatic retry on transient errors (429 / 5xx / network). Silent console-only failures across the Req Board, Job Detail panel, compensation fields, submission statuses, and notes are gone — you\'ll always know if a save didn\'t land.' },
      { type: 'minor', text: 'Auto-refresh pauses while you\'re editing a cell or have the detail panel open, so the 5-minute poll never clobbers an in-flight edit. Toolbar now shows "Updated Xs ago" (refreshes at a glance) with a "paused" indicator when applicable.' },
      { type: 'minor', text: 'Concurrent-edit protection — when two users edit the same req\'s overrides at the same time, the loser sees a "Someone else edited this req" dialog and can reload to pick up the other user\'s changes before reapplying their own. No more silently-lost edits.' },
      { type: 'minor', text: 'Bullhorn ↔ local split-brain is now captured. If Bullhorn accepts a write but the local sync fails, the event is queued for admin reconciliation and you see a yellow warning toast instead of believing the change went through cleanly.' },
      { type: 'patch', text: 'Per-user API rate limits — the 200 reads / 30 writes per minute budget is now keyed to each Entra user rather than shared across everyone behind one office IP. Large teams no longer rate-limit each other.' },
      { type: 'patch', text: 'In-memory 30-second cache on the hot Bullhorn read paths and on local overrides. 30 users loading the board in the same minute now trigger roughly one upstream call instead of 30. Cache is busted on every mutation.' },
      { type: 'patch', text: 'Circuit breaker around Bullhorn MCP — after five consecutive failures the server fails fast for ten seconds instead of letting every request hang for its 30-second timeout. Half-open probes detect recovery automatically.' },
      { type: 'patch', text: 'Removed unused better-sqlite3 dependency and the vestigial local SQLite database. All persistence lives in Supabase; nothing is lost on Railway redeploy.' },
    ],
  },
  {
    version: '3.7.12',
    date: '2026-04-21',
    title: 'Pipeline — Opportunity Status Edit Fix',
    changes: [
      { type: 'fix', text: 'Inline Status edits on the Pipeline tab now persist to Bullhorn. The server-side whitelist was silently dropping status updates, so edits appeared to save but reverted on refresh.' },
    ],
  },
  {
    version: '3.7.11',
    date: '2026-04-21',
    title: 'Called Shots Persist on Board',
    changes: [
      { type: 'minor', text: 'Called Shot jobs now stay on the Req Board regardless of status (Archive, Placed, Lost, Wash). They persist until the Called Shot box is unchecked, then fall off under the normal 12-hour rules.' },
    ],
  },
  {
    version: '3.7.10',
    date: '2026-04-21',
    title: 'Called Shots — Show Total Spread',
    changes: [
      { type: 'minor', text: 'Called Shots counter now shows the combined CE + Perm spread across all Called Shot jobs instead of the count. Hover shows the number of jobs; click still opens the list.' },
    ],
  },
  {
    version: '3.7.9',
    date: '2026-04-21',
    title: 'Notes — Wrap + Page Breaks',
    changes: [
      { type: 'fix', text: 'Notes cell now wraps long text at 175px AND preserves Shift+Enter line breaks. Manual line breaks render as explicit <br> elements so the column\'s native wrapping behavior is untouched.' },
    ],
  },
  {
    version: '3.7.8',
    date: '2026-04-21',
    title: 'Notes — Restore Row Expansion',
    changes: [
      { type: 'fix', text: 'Notes cell now expands vertically again for long entries, while still honoring Shift+Enter line breaks. Row wraps long text and grows as needed, matching the previous behavior.' },
    ],
  },
  {
    version: '3.7.7',
    date: '2026-04-21',
    title: 'Job Detail — Editable Compensation',
    changes: [
      { type: 'minor', text: 'Pay Rate, Bill Rate, Salary Low, and Salary High are now editable inline in the job detail panel. Click the value to edit, Enter or click away to save to Bullhorn.' },
    ],
  },
  {
    version: '3.7.6',
    date: '2026-04-21',
    title: 'Notes — Multi-line Support',
    changes: [
      { type: 'minor', text: 'Notes cell on the Req Board now supports multi-line entries. Press Shift+Enter to add a new line, Enter to save. Existing newlines are preserved on display.' },
    ],
  },
  {
    version: '3.7.5',
    date: '2026-04-21',
    title: 'On The Board — Candidate from Offer Out',
    changes: [
      { type: 'minor', text: 'On The Board modal now shows the candidate whose submission is in "Offer Extended" (Offer Out) status, instead of pulling from placements. Reliable from the moment an offer is extended, not just after hiring paperwork is finalized.' },
    ],
  },
  {
    version: '3.7.4',
    date: '2026-04-21',
    title: 'Client Submissions — Exclude Internally Submitted',
    changes: [
      { type: 'fix', text: 'Client Submissions inline count no longer includes "Internally Submitted" candidates (that status is an internal pre-client review, not a client submission). Counts now match Bullhorn exactly.' },
    ],
  },
  {
    version: '3.7.3',
    date: '2026-04-21',
    title: 'Client Submissions — Full Lifecycle Count',
    changes: [
      { type: 'fix', text: 'Client Submissions count (inline and detail panel) now includes candidates that progressed past Client Submission — Interview Scheduled, Interview Feedback, Client Feedback, Offer Extended, Backout, Placed. Counts now match what Bullhorn shows on the job.' },
    ],
  },
  {
    version: '3.7.2',
    date: '2026-04-21',
    title: 'Job Detail — Client Submissions Fix',
    changes: [
      { type: 'fix', text: 'Job detail panel now reliably shows all Client Submissions. Previously, jobs with many New Leads would push real Client Submissions out of the result window, causing the detail panel to show 0 submissions even when the inline count said otherwise.' },
    ],
  },
  {
    version: '3.7.1',
    date: '2026-04-21',
    title: 'PDF Export — Expanded Team Alerts',
    changes: [
      { type: 'patch', text: 'PDF exports (Sales & Recruiter dashboards) now auto-expand every person\'s Team Alerts section so the specific alerts per person are visible in the PDF' },
    ],
  },
  {
    version: '3.7.0',
    date: '2026-04-20',
    title: 'Executive Reporting — Current & Potential New Input',
    changes: [
      { type: 'minor', text: 'Executive Reporting dashboard now live (admin only) — two KPI tiles: Current New Input (same calc as Apt Health Input gauge) and Potential New Input (open reqs × ((Bill−Pay)×1.25)×2080 × # Openings)' },
      { type: 'minor', text: 'Click either KPI for a per-placement or per-req breakdown modal' },
      { type: 'minor', text: 'Date range picker drives Current New Input; Potential is a live snapshot of all open reqs with bill and pay set' },
    ],
  },
  {
    version: '3.6.4',
    date: '2026-04-20',
    title: 'Reporting — Executive Reporting Section (Admin)',
    changes: [
      { type: 'minor', text: 'Added "Executive Reporting" card to the Reporting home — visible to admin users only, placed after Individual Performance' },
      { type: 'patch', text: 'Non-admin layout unchanged (Recruiting, Sales, Individual Performance centered below)' },
    ],
  },
  {
    version: '3.6.3',
    date: '2026-04-20',
    title: 'Recruiter Dashboard — PDF Export',
    changes: [
      { type: 'minor', text: 'Added "Export PDF" button to Recruiter Dashboard alongside existing Excel export — captures the full dashboard (metrics, charts, detail tables) as a multi-page landscape PDF' },
      { type: 'minor', text: 'PDF respects the currently-applied recruiter/client filter and date range' },
    ],
  },
  {
    version: '3.6.2',
    date: '2026-04-20',
    title: 'Sales Dashboard — PDF Export',
    changes: [
      { type: 'minor', text: 'Added "Export PDF" button to Sales Dashboard alongside existing Excel export — captures the full dashboard (charts, metrics table, team alerts) as a multi-page landscape PDF' },
      { type: 'minor', text: 'PDF respects the currently-applied AM filter and date range' },
    ],
  },
  {
    version: '3.6.1',
    date: '2026-04-18',
    title: 'Goal Tracking — Owner Picker Cleanup',
    changes: [
      { type: 'patch', text: 'Owner dropdown now shows only first + last name (dropped the role suffix)' },
      { type: 'patch', text: 'Filtered "Unassigned User" and "Webdeveloper API" out of the owner dropdown — not real people you would assign a goal to' },
    ],
  },
  {
    version: '3.6.0',
    date: '2026-04-18',
    title: 'Goal Tracking — Owner Picker & Task Alerts',
    changes: [
      { type: 'minor', text: 'Admins and managers now pick the goal owner from a dropdown of active Bullhorn users when creating or editing a goal' },
      { type: 'minor', text: 'Basic users can only create goals owned by themselves — the owner is auto-assigned and not shown in the form' },
      { type: 'minor', text: 'Overdue and upcoming goal tasks (assigned to you with a due date within 7 days or past due) now appear in the "Tasks Needing Attention" alert on your Individual Performance report alongside follow-ups, deadlines, and check-ins' },
      { type: 'patch', text: 'Renamed that alert from "Overdue Tasks" to "Tasks Needing Attention" since it now includes upcoming items' },
    ],
  },
  {
    version: '3.5.4',
    date: '2026-04-18',
    title: 'Goal Tracking — Simpler Form',
    changes: [
      { type: 'minor', text: 'Rollup goals always use a simple average of their children — removed the Weighted option from the create/edit form' },
      { type: 'minor', text: 'Color status is always Calculated (green/yellow/red from progress vs time elapsed) — removed the User Driven toggle' },
      { type: 'patch', text: 'Required-field asterisks now sit inline with the label text instead of dropping to their own line' },
    ],
  },
  {
    version: '3.5.3',
    date: '2026-04-18',
    title: 'Goal Tracking — Delete + Connector Fixes',
    changes: [
      { type: 'fix', text: 'Delete now actually works — the server\u2019s CORS allow-list was missing DELETE so the browser was cancelling the request before it reached the API' },
      { type: 'fix', text: 'Dotted connector line stops at the last sibling\u2019s center instead of running down to the next root goal below, so sibling goals are no longer visually confused with sub-goals' },
    ],
  },
  {
    version: '3.5.2',
    date: '2026-04-18',
    title: 'Goal Tracking — Tree Connectors',
    changes: [
      { type: 'minor', text: 'Expanded parent goals now show dotted connector lines to their children so the hierarchy reads at a glance' },
    ],
  },
  {
    version: '3.5.1',
    date: '2026-04-18',
    title: 'Goal Tracking — Delete Fixes',
    changes: [
      { type: 'fix', text: 'Deleted goals (parent or sub) now disappear from the list immediately — optimistic removal before the server round-trip, with automatic rollback if the delete fails' },
      { type: 'fix', text: 'Deleting a parent now also removes its descendants from the view so the tree stays consistent' },
      { type: 'patch', text: 'Rollup goal detail panel no longer shows a Children list — children are already visible in the tree' },
    ],
  },
  {
    version: '3.5.0',
    date: '2026-04-18',
    title: 'Goal Tracking — Inline Editing & Smarter Tasks',
    changes: [
      { type: 'minor', text: 'Goal row menu now has Edit and Add Sub-Goal — no need to open the detail panel to make changes or nest a new goal' },
      { type: 'minor', text: 'Rollup Method dropdown shows an inline description of what Average vs Weighted actually do, updating with your selection' },
      { type: 'minor', text: 'Task rows color-code by due date: green when done, yellow within 7 days of due date, red when overdue' },
      { type: 'minor', text: 'Task add form now explicitly labels the Due Date field so it\'s not mistaken for a start date' },
      { type: 'patch', text: 'Removed the standalone "Record Check-In" panel — editing current value via the Edit form now records a check-in automatically, keeping the Graph tab populated with less clutter' },
    ],
  },
  {
    version: '3.4.2',
    date: '2026-04-18',
    title: 'Goal Tracking — Row Layout Fix',
    changes: [
      { type: 'fix', text: 'Goals with no sub-goals no longer render the type badge as a giant bar — grid now always reserves the sub-count column so the type pill, progress bar, and percentage line up consistently' },
      { type: 'patch', text: 'Tightened row grid so long goal names ellipsize cleanly instead of wrapping' },
    ],
  },
  {
    version: '3.4.1',
    date: '2026-04-18',
    title: 'Goal Tracking — Cache Fix',
    changes: [
      { type: 'fix', text: 'Newly created goals and check-ins now appear immediately — global 5-minute browser cache was masking updates until it expired' },
    ],
  },
  {
    version: '3.4.0',
    date: '2026-04-18',
    title: 'Goal Tracking — Quarterly OKRs',
    changes: [
      { type: 'major', text: 'New Goal Tracking tab replaces the disabled Huddles stub — hierarchical quarterly OKRs with three goal types: Rollup (auto-averages children), Number (start/current/target), and Task (checklist with due dates and assignees)' },
      { type: 'minor', text: 'Quarter navigator auto-defaults to the current quarter with a progress-through-quarter bar; arrows move prev/next and a Today button jumps back' },
      { type: 'minor', text: 'Fiscal-year configurable — flip FISCAL_YEAR_START_MONTH in server/lib/period.js to shift the quarter boundaries' },
      { type: 'minor', text: 'Per-goal detail slide-out with Overview, Tasks, and Graph tabs — progress history line chart plots every check-in against the quarter pacing line' },
      { type: 'minor', text: 'Update Progress panel records a check-in (manual entry only in this release); task toggles also write check-ins and cascade rollup recompute to ancestor goals' },
      { type: 'minor', text: 'Company Priority flag (manager/admin only) and My Priority pin (per-user) with All / My Goals / Company Priorities view filters' },
      { type: 'minor', text: 'Calculated or User Driven status colors — green if progress ≥ time elapsed, yellow within 15pp, red beyond' },
      { type: 'patch', text: 'Schema reserves metric_key / metric_params / metric_last_synced_at columns for a Phase 2 "Connect a Metric" that auto-pulls from existing /api/reporting, /api/performance, and /api/req-board/stats endpoints' },
    ],
  },
  {
    version: '3.3.5',
    date: '2026-04-17',
    title: 'Ticket Search by Number',
    changes: [
      { type: 'minor', text: 'Search box on all ticket list tabs (My Tickets, My Queue, All Tickets) — filter by ticket number' },
      { type: 'minor', text: 'Flexible matching — type Apt000007, 7, or any substring; results filter as you type' },
      { type: 'patch', text: 'Search clears automatically when switching tabs so you never carry stale filters between views' },
    ],
  },
  {
    version: '3.3.4',
    date: '2026-04-17',
    title: 'Clickable Support Reporting',
    changes: [
      { type: 'minor', text: 'Every chart and KPI card on the Support Reporting tab is now clickable — open a modal showing the underlying ticket data' },
      { type: 'minor', text: 'Modal displays ticket number, title, category, tool, status, submitter, assignee, and open/resolved dates' },
      { type: 'minor', text: 'Click a bar, pie slice, or line point to drill into that segment; click a KPI card to see its full data set' },
    ],
  },
  {
    version: '3.3.3',
    date: '2026-04-17',
    title: 'Smarter Notification Polling',
    changes: [
      { type: 'patch', text: 'Unread notification polling now pauses when the Support tab is hidden — no wasted requests in background tabs' },
      { type: 'patch', text: 'Counts refetch immediately when you switch back to the tab or refocus the window' },
      { type: 'patch', text: 'Polling interval raised from 60s to 120s — roughly 70% fewer requests in steady state' },
      { type: 'patch', text: 'New FAQ under Support Center explaining notification triggers and how to clear them' },
    ],
  },
  {
    version: '3.3.2',
    date: '2026-04-17',
    title: 'Unread Ticket Badges',
    changes: [
      { type: 'minor', text: 'Red notification badges on My Tickets and My Queue tabs show unread count — like iPhone notifications' },
      { type: 'minor', text: 'My Tickets badge counts tickets with new comments from someone else' },
      { type: 'minor', text: 'My Queue badge counts tickets newly assigned to you OR with new comments' },
      { type: 'minor', text: 'Expanding a ticket marks it as viewed; badge updates automatically' },
      { type: 'minor', text: 'Counts refresh every 60 seconds so new activity appears without a page reload' },
    ],
  },
  {
    version: '3.3.1',
    date: '2026-04-17',
    title: 'Support Reporting Dashboard + Playbook Links',
    changes: [
      { type: 'minor', text: 'New Reporting tab (admin-only) in Support & Requests with ticket analytics: volume by tool, top submitters, status donut, avg time-to-close by category and tool, open workload by assignee, and 12-week volume trend' },
      { type: 'minor', text: 'Four KPI cards at the top of Reporting — Total, Open, Avg Time to Close, This Month' },
      { type: 'minor', text: 'Sales, Delivery, and Operations playbook links wired to live SharePoint documents in Help & Docs' },
      { type: 'minor', text: 'New "Why am I red boxed?" FAQ under Req Board explaining the three conditions (missed follow up, missed deadline, 48hr TR clock)' },
    ],
  },
  {
    version: '3.3.0',
    date: '2026-04-16',
    title: 'Support Center — Ticket Numbers, Queue, Comments & Tool Tracking',
    changes: [
      { type: 'minor', text: 'Sequential ticket numbers — every ticket now has an Apt000001-style reference shown across ticket cards, performance dashboard, and Teams notifications' },
      { type: 'minor', text: 'Threaded comments on tickets — click any ticket to expand inline and exchange notes; admin + submitter only' },
      { type: 'minor', text: 'Ticket queue system — new My Queue tab (admin-only) between My Tickets and All Tickets showing tickets assigned to you' },
      { type: 'minor', text: 'Admins can assign tickets to other admins from the expanded ticket view; assignee badge visible in header' },
      { type: 'minor', text: 'Assignee filter on All Tickets with KPI scoping — pick an admin to see their personal avg time-to-close per category' },
      { type: 'minor', text: 'Tool sub-dropdown on Issue tickets — Alex, FullyRamped, CloudCall, BullHorn, Apt Command, ZoomInfo, Align, Sharepoint, Outlook, Other' },
      { type: 'minor', text: 'My Tickets section added to the bottom of every Performance dashboard — track your open tickets without leaving your report' },
      { type: 'minor', text: 'Managers viewing another team member\'s Performance dashboard now see that user\'s tickets (same permission pattern as the rest)' },
      { type: 'minor', text: 'New Playbooks section in Help & Docs with Sales, Delivery, and Operations links (placeholders until SharePoint URLs are added)' },
      { type: 'minor', text: 'Renamed General Feedback category to General Question; KPI label updated to General Questions' },
      { type: 'patch', text: 'Centered the Change Log card beneath Help & Docs and Support & Requests on the Support home' },
      { type: 'patch', text: 'Ticket status changes update inline without refreshing the whole list' },
    ],
  },
  {
    version: '3.2.7',
    date: '2026-04-15',
    title: 'Security Hardening (Round 4)',
    changes: [
      { type: 'patch', text: 'Operations tab now enforces admin-only access at both the server and client route level (previously UI-only via sidebar)' },
      { type: 'patch', text: 'Added React Error Boundary — graceful fallback instead of white screen if a component crashes' },
      { type: 'patch', text: 'URL-encoded query parameters in API calls for defense-in-depth' },
      { type: 'patch', text: 'Excel exports now escape values starting with =, +, -, @ to prevent formula injection' },
      { type: 'patch', text: 'Removed production MCP URL from committed documentation' },
    ],
  },
  {
    version: '3.2.6',
    date: '2026-04-16',
    title: 'Total Spread — Use Actual Fee',
    changes: [
      { type: 'patch', text: 'Direct Hire perm contribution to Total Weekly Spread now uses the actual fee percentage from each placement instead of a flat 20%' },
    ],
  },
  {
    version: '3.2.5',
    date: '2026-04-16',
    title: 'Total Spread — Perm Fees Included',
    changes: [
      { type: 'minor', text: 'Direct Hire placements now contribute to Total Weekly Spread in Active Contractors modal using (Salary × Fee %) ÷ 52' },
    ],
  },
  {
    version: '3.2.4',
    date: '2026-04-16',
    title: 'Total Spread Tooltip',
    changes: [
      { type: 'patch', text: 'Added tooltip to Total Spread in the Active Contractors modal showing the calculation formula' },
    ],
  },
  {
    version: '3.2.3',
    date: '2026-04-16',
    title: 'Active Contractors — Type Filter',
    changes: [
      { type: 'minor', text: 'Added multi-select Type filter to Active Contractors modal (e.g. Contract, Direct Hire, Corp-to-Corp)' },
    ],
  },
  {
    version: '3.2.2',
    date: '2026-04-16',
    title: 'Active Contractors — Total Spread',
    changes: [
      { type: 'minor', text: 'Active Contractors modal now shows the total weekly spread (sum of all CE spreads) in the header, updates with filters' },
    ],
  },
  {
    version: '3.2.1',
    date: '2026-04-16',
    title: 'Called Shots Modal Enhancements',
    changes: [
      { type: 'minor', text: 'Called Shots modal columns are now sortable' },
      { type: 'minor', text: 'Added multi-select Owner and TR filters to Called Shots modal' },
      { type: 'minor', text: 'Status, TR, and Type are now editable inline in the Called Shots modal' },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-04-16',
    title: 'Stats Strip Updates',
    changes: [
      { type: 'minor', text: 'Added Called Shots counter between On The Board and Opportunities — click to see the list of flagged jobs' },
      { type: 'patch', text: 'Removed Open Reqs counter from the top of the Req Board' },
    ],
  },
  {
    version: '3.1.1',
    date: '2026-04-16',
    title: 'Fall-Off Timer Fix',
    changes: [
      { type: 'fix', text: 'Archive, Placed, Lost, and Wash jobs now correctly fall off the Req Board 12 hours after the status change — previously any edit to the job would reset the timer and keep it on the board indefinitely' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-04-15',
    title: 'Reporting Consolidation',
    changes: [
      { type: 'minor', text: 'Performance tab merged into Reporting — now accessible as "Individual Performance", the third option alongside Recruiting and Sales' },
      { type: 'minor', text: 'Sidebar simplified — Performance removed as a standalone nav item' },
      { type: 'patch', text: 'Old /performance URL automatically redirects to /reporting/performance for existing bookmarks' },
      { type: 'patch', text: 'Individual Performance card centered below Recruiting and Sales on the Reporting home page' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-04-15',
    title: 'Visual Redesign',
    changes: [
      { type: 'major', text: 'Hexagonal network background pattern across all pages — subtle navy-blue hex clusters fade from corners into the background' },
      { type: 'major', text: 'Glass card styling — all cards now feature frosted-glass backgrounds with prominent navy-tinted drop shadows' },
      { type: 'minor', text: 'Hover states enhanced with deeper shadow lift and brighter card surface' },
    ],
  },
  {
    version: '2.9.0',
    date: '2026-04-15',
    title: 'Support Center Enhancements',
    changes: [
      { type: 'minor', text: 'Service Health cards (API, Bullhorn MCP, Database) now display at top of Support Center home page' },
      { type: 'minor', text: 'Teams notifications — new support tickets post an Adaptive Card to the Support channel automatically' },
      { type: 'minor', text: 'Resolved tickets auto-close after 72 hours' },
      { type: 'minor', text: 'Category filter and avg time-to-close KPI cards on the All Tickets admin view' },
      { type: 'minor', text: 'Prominent Opened and Resolved dates on every ticket card' },
      { type: 'minor', text: 'Renamed Bug & Feedback to Support & Requests, System Status to Change Log' },
      { type: 'minor', text: 'Removed IT Support section — quick tickets now submit from Support & Requests' },
      { type: 'minor', text: 'All Tickets view restricted to admin role only' },
      { type: 'patch', text: 'Fixed ticket status changes not reflecting without page refresh (browser cache bypass)' },
      { type: 'patch', text: 'Fixed Bullhorn MCP health check showing Down (exported callTool from bullhorn.js)' },
      { type: 'patch', text: 'Fixed rate limiter crash on Railway (enabled trust proxy for reverse proxy)' },
    ],
  },
  {
    version: '2.8.2',
    date: '2026-04-15',
    title: 'Performance Fixes',
    changes: [
      { type: 'patch', text: 'Added gzip compression to all API responses — 60-80% smaller payloads over the wire' },
      { type: 'patch', text: 'Added Cache-Control headers to GET endpoints — browser reuses recent responses for 5 minutes' },
      { type: 'patch', text: 'Added 30-second timeout to Bullhorn MCP calls — prevents server hanging if Bullhorn is slow or down' },
      { type: 'patch', text: 'Split 2.0 MB JavaScript bundle into 6 vendor chunks — main app chunk reduced to 260 KB (87% smaller)' },
    ],
  },
  {
    version: '2.8.1',
    date: '2026-04-15',
    title: 'Security Hardening (Round 3)',
    changes: [
      { type: 'patch', text: 'Removed localhost from production CORS — dev origins only allowed in development mode' },
      { type: 'patch', text: 'Centralized Supabase client to a single shared instance — removed 4 duplicate connections' },
    ],
  },
  {
    version: '2.8.0',
    date: '2026-04-15',
    title: 'Fluid Sidebar Redesign & Dev Tooling',
    changes: [
      { type: 'major', text: 'Active sidebar tab now seamlessly merges into the content area — light background with inverse rounded corners creates a fluid, connected tab effect' },
      { type: 'major', text: 'Dev auth bypass for local preview — set VITE_DEV_BYPASS_AUTH=true to skip Microsoft login during development' },
    ],
  },
  {
    version: '2.7.0',
    date: '2026-04-15',
    title: 'Support Center — Help, Status & IT Contact',
    changes: [
      { type: 'minor', text: 'New Support tab with four sections: Help & Docs, Bug & Feedback, System Status, and IT Support' },
      { type: 'minor', text: 'Searchable FAQ accordion with answers grouped by module (Req Board, Reporting, Pipeline, etc.)' },
      { type: 'minor', text: 'Live system health dashboard — real-time status of API server, Bullhorn MCP, and database' },
      { type: 'minor', text: 'Bug & Feedback form with screenshot upload, ticket tracking, and admin triage view' },
      { type: 'minor', text: 'Known Issues board — managers can post and resolve active issues visible to all users' },
      { type: 'minor', text: 'IT Support page with contact info, escalation path, and quick ticket submission' },
      { type: 'minor', text: 'Resolved tickets auto-close after 72 hours' },
      { type: 'minor', text: 'All Tickets admin view restricted to admin role only' },
      { type: 'minor', text: 'Full version changelog now accessible from the System Status page' },
    ],
  },
  {
    version: '2.6.2',
    date: '2026-04-14',
    title: 'Security Hardening — Input Validation & Log Sanitization',
    changes: [
      { type: 'patch', text: 'Added allowlist validation on MCP checkin note queries to prevent query injection' },
      { type: 'patch', text: 'Added ID parameter validation on job detail, opportunity update, and related endpoints — invalid IDs now return 400 instead of server errors' },
      { type: 'patch', text: 'Sanitized server startup logs to stop printing Supabase URLs and CORS origin lists to Railway logs' },
    ],
  },
  {
    version: '2.6.1',
    date: '2026-04-14',
    title: 'Replace Vulnerable xlsx Library',
    changes: [
      { type: 'patch', text: 'Replaced SheetJS (xlsx) with ExcelJS for Excel import/export — eliminates prototype pollution and ReDoS vulnerabilities' },
      { type: 'patch', text: 'Client now has zero known npm audit vulnerabilities' },
    ],
  },
  {
    version: '2.6.0',
    date: '2026-04-14',
    title: 'Org Flow Security — Server-Side Data Access',
    changes: [
      { type: 'minor', text: 'Moved all Org Flow data operations from browser-direct Supabase calls to authenticated server API — all data now flows through the secure Express backend' },
      { type: 'minor', text: 'Removed Supabase anonymous key from client bundle — no database credentials are exposed in the browser' },
      { type: 'patch', text: 'Fixed client assignment "assigned_by" tracking — now uses authenticated Azure AD user instead of broken Supabase auth lookup' },
    ],
  },
  {
    version: '2.5.4',
    date: '2026-04-14',
    title: 'API Rate Limiting',
    changes: [
      { type: 'patch', text: 'Added rate limiting to API server — 200 requests/min for reads, 30/min for writes — protects against runaway scripts and abuse' },
      { type: 'patch', text: 'Client now handles 429 (rate limited) responses gracefully with a user-friendly error message' },
    ],
  },
  {
    version: '2.5.3',
    date: '2026-04-14',
    title: 'Security Hardening (Round 2)',
    changes: [
      { type: 'patch', text: 'Added Helmet middleware for secure HTTP response headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)' },
      { type: 'patch', text: 'Patched Vite dev server vulnerabilities (path traversal, WebSocket file read)' },
      { type: 'patch', text: 'Disabled production source maps explicitly to prevent code exposure' },
      { type: 'patch', text: 'Suppressed auth config console errors in production builds' },
      { type: 'patch', text: 'Added .env exclusion to client .gitignore for defense-in-depth' },
    ],
  },
  {
    version: '2.5.2',
    date: '2026-04-14',
    title: 'On The Board — Candidate Name',
    changes: [
      { type: 'minor', text: 'On The Board modal now shows the placed candidate name next to the client for each filled job' },
    ],
  },
  {
    version: '2.5.1',
    date: '2026-04-14',
    title: 'Req Board Column & Contractor Fixes',
    changes: [
      { type: 'patch', text: 'Moved # Op and # CS columns to the right of Follow Up for better workflow visibility' },
      { type: 'patch', text: 'Fixed Active Contractors count showing 0 — removed assignedUsers field that corrupted Bullhorn query' },
    ],
  },
  {
    version: '2.5.0',
    date: '2026-04-14',
    title: 'Operations Tab — Placements Tracker',
    changes: [
      { type: 'minor', text: 'New Operations tab (admin-only) with Placements Tracker — view all Pending & Approved placements from Bullhorn' },
      { type: 'minor', text: 'Onboarding checklist per placement: OB Paperwork, New Hire Filed, Enrolled in Healthcare, Added to Payroll, 401k Opt In, 401k Forms Received, Added to Census' },
      { type: 'minor', text: 'Editable Healthcare Effective Date and Healthcare Payroll Deduction Date fields per placement' },
      { type: 'minor', text: 'All checklist and date fields persist to Supabase and are shared across the team' },
      { type: 'minor', text: 'Completed rows (all checkboxes checked) highlight green for at-a-glance status' },
    ],
  },
  {
    version: '2.4.7',
    date: '2026-04-14',
    title: 'Recruiter Dashboard — Leads Submitted Chart',
    changes: [
      { type: 'minor', text: 'Added Leads Submitted bar chart to Recruiter Dashboard — shows Bullhorn Lead count per recruiter, filtered by date range and recruiter filters' },
    ],
  },
  {
    version: '2.4.6',
    date: '2026-04-14',
    title: 'Active Contractors & TR Updates',
    changes: [
      { type: 'minor', text: 'Active Contractors modal now shows AM and TR columns with initials' },
      { type: 'minor', text: 'All columns in Active Contractors modal are now sortable' },
      { type: 'minor', text: 'Added multi-select AM and TR filters to Active Contractors modal' },
      { type: 'patch', text: 'A/B Reqs Covered count no longer counts "*" as covered' },
      { type: 'patch', text: 'TR assignment now defaults to "*" for all jobs with no recruiter assigned (previously showed "—")' },
    ],
  },
  {
    version: '2.4.4',
    date: '2026-04-14',
    title: 'Editable Opportunity Status',
    changes: [
      { type: 'minor', text: 'Opportunity Status is now editable inline on the Pipeline tab — click to update directly in Bullhorn' },
      { type: 'minor', text: 'Opportunity Status is now editable inline in the Req Board opportunities modal' },
    ],
  },
  {
    version: '2.4.3',
    date: '2026-04-14',
    title: 'Fix Opportunities Count',
    changes: [
      { type: 'patch', text: 'Req Board opportunities stat now counts only Open, Qualifying, and Negotiating stages' },
    ],
  },
  {
    version: '2.4.2',
    date: '2026-04-14',
    title: 'Bug Fixes',
    changes: [
      { type: 'fix', text: '"On The Board" counter now correctly counts all Filled jobs visible on the board, including recently closed ones' },
      { type: 'fix', text: 'Archive, Placed, and Lost jobs now fall off the board after 24 hours instead of 48' },
    ],
  },
  {
    version: '2.4.1',
    date: '2026-04-14',
    title: 'AM Performance — Fills / Losses / Washes Chart',
    changes: [
      { type: 'minor', text: 'Added Fills / Losses / Washes bar chart to each AM\'s individual performance score card, below the MAR & Input charts' },
      { type: 'minor', text: 'Chart bars are clickable — click to view job detail records with Bullhorn links' },
    ],
  },
  {
    version: '2.4.0',
    date: '2026-04-14',
    title: 'Sales Dashboard — Fills / Losses / Washes Chart',
    changes: [
      { type: 'minor', text: 'Added Fills / Losses / Washes bar chart to Sales Dashboard — full-width below the existing charts, updates with date range and AM filters' },
      { type: 'minor', text: 'Chart bars are clickable — click any bar to view the job detail records with Bullhorn links' },
    ],
  },
  {
    version: '2.3.8',
    date: '2026-04-13',
    title: 'Pipeline Multi-Select Status Filter',
    changes: [
      { type: 'minor', text: 'Pipeline status filter is now multi-select — pick any combination of statuses to filter by' },
    ],
  },
  {
    version: '2.3.7',
    date: '2026-04-13',
    title: 'Pipeline — Show All Opportunities',
    changes: [
      { type: 'minor', text: 'Pipeline tab now shows all opportunities regardless of status (previously excluded Closed, Closed-Lost, Closed-Won, Converted)' },
    ],
  },
  {
    version: '2.3.6',
    date: '2026-04-13',
    title: 'Submissions & Req Board Updates',
    changes: [
      { type: 'minor', text: 'Added "48 hr" free-text column next to TR on the Req Board (saved to Supabase)' },
      { type: 'minor', text: 'Opportunities modal now has an Owner filter dropdown and all columns are sortable' },
      { type: 'minor', text: 'Filled jobs automatically drop off the main Req Board list the day after status change (still counted in On The Board)' },
      { type: 'minor', text: 'On The Board modal: TR, Type, and Start Date are now editable inline' },
      { type: 'minor', text: 'Submissions panel now shows the TR (recruiter) who submitted each candidate' },
      { type: 'minor', text: 'Submission Status is now editable inline — click to update directly in Bullhorn' },
      { type: 'patch', text: 'Submissions panel now shows Client Submissions only (removed Internally Submitted)' },
      { type: 'minor', text: 'Accepting Candidates modal: Owner filter, sortable columns, editable TR/Type/Remote' },
      { type: 'minor', text: 'A/B Reqs modal: Owner filter, sortable columns, editable Status/Type' },
      { type: 'minor', text: 'C Reqs modal: Owner filter, sortable columns, editable Status/Type' },
      { type: 'minor', text: 'On The Board modal: Owner filter and editable Status column added' },
      { type: 'patch', text: 'Removed Req# column from main board; Job Title is now a clickable Bullhorn link' },
    ],
  },
  {
    version: '2.2.2',
    date: '2026-04-13',
    title: 'Apt Allies Detail Modal',
    changes: [
      { type: 'patch', text: 'Apt Allies on Org Flow client cards is now a clickable link that opens a detail modal showing each active placement (client contact, candidate, job title, type)' },
    ],
  },
  {
    version: '2.2.1',
    date: '2026-04-13',
    title: 'Database Fixes',
    changes: [
      { type: 'patch', text: 'Fix Reminders not saving — updated Supabase announcements constraint to allow reminder row (id=2)' },
      { type: 'patch', text: 'Fix 500 error when setting Manager role — updated Supabase role check constraint to include "manager"' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-04-13',
    title: 'Manager Role',
    changes: [
      { type: 'minor', text: 'Added new Manager role — full admin access except Operations tab and user role changes' },
      { type: 'minor', text: 'Managers can edit announcements, reminders, view other users\' performance dashboards, and access the Admin panel (read-only for roles)' },
      { type: 'patch', text: 'Role dropdown in Admin panel now shows Basic, Manager, and Admin options' },
    ],
  },
  {
    version: '2.1.3',
    date: '2026-04-13',
    title: 'Reminders Section',
    changes: [
      { type: 'minor', text: 'Added Reminders section to home screen below Announcements — admin-editable, visible to all users' },
    ],
  },
  {
    version: '2.1.2',
    date: '2026-04-13',
    title: 'Splash Screen Timing',
    changes: [
      { type: 'patch', text: 'Reduced splash loading screens from 5 seconds to 3 seconds for faster navigation' },
    ],
  },
  {
    version: '2.1.1',
    date: '2026-04-13',
    title: 'Commission & Rounding Fixes',
    changes: [
      { type: 'patch', text: 'Fix split commission credit: all recruiters and AMs on a placement now receive their share (previously only the last entry was credited)' },
      { type: 'patch', text: 'Starts now round up to the nearest .25 instead of rounding to 2 decimal places' },
      { type: 'patch', text: 'Fix 500 error when updating user roles in Admin panel' },
      { type: 'patch', text: 'Fix incorrect default admin assignments in user profiles database' },
      { type: 'patch', text: 'Operations tab now restricted to admin users only' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-04-13',
    title: 'User Management & Roles',
    changes: [
      { type: 'minor', text: 'Added Admin and Basic roles with user management system' },
      { type: 'minor', text: 'New Admin panel for managing user roles (admin-only)' },
      { type: 'minor', text: 'Admin tab in sidebar visible only to admin users' },
      { type: 'patch', text: 'Server-side role resolution with bootstrap admin fallback' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-04-13',
    title: 'Sidebar Navigation Redesign',
    changes: [
      { type: 'major', text: 'Replaced card-grid home page with persistent left sidebar navigation' },
      { type: 'major', text: 'Dark navy sidebar with module icons, active state highlighting, and gold accent' },
      { type: 'minor', text: 'Quick Links moved to collapsible sidebar section' },
      { type: 'minor', text: 'User info, version, and logout relocated to sidebar footer' },
      { type: 'minor', text: 'Mobile responsive: hamburger menu toggles sidebar on small screens' },
      { type: 'minor', text: 'Home route simplified to a clean welcome dashboard' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-13',
    title: 'Versioning & Changelog',
    changes: [
      { type: 'minor', text: 'Added semantic versioning (Major.Minor.Patch) to footer' },
      { type: 'minor', text: 'Clickable version link opens release notes modal' },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-04-12',
    title: 'Security Hardening',
    changes: [
      { type: 'patch', text: 'Cosmetic security fixes: innerHTML sanitization, gitignore cleanup' },
      { type: 'patch', text: 'MCP auth, production guard, CORS lockdown, secret cleanup' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-04-11',
    title: 'Dashboard Enhancements',
    changes: [
      { type: 'minor', text: 'Static quarterly MAR goals + pacing line on both dashboards' },
      { type: 'patch', text: 'Fix Healthy Managers modal: add name and role to employee query' },
      { type: 'minor', text: 'Add tooltip and clickable detail modal to Healthy Managers' },
      { type: 'minor', text: 'Add Healthy Managers percentage to Org Flow client cards' },
      { type: 'patch', text: 'Fix edit panel overflow: use fixed positioning anchored to viewport' },
      { type: 'minor', text: 'Replace manual Apt Contractors with live Bullhorn count' },
      { type: 'patch', text: 'Fix AM Checkin gauge: filter NoteEntity to User rows' },
      { type: 'minor', text: 'Add live Active Contractor count to Org Flow employee cards' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-01',
    title: 'Initial Release',
    changes: [
      { type: 'major', text: 'Apt Command platform launch with Req Board, Org Flow, Pipeline, Apt Health, Reporting, and Individual Performance modules' },
      { type: 'major', text: 'Live Bullhorn CRM integration via MCP server' },
      { type: 'minor', text: 'Called Shot checkbox and filter on Req Board' },
      { type: 'minor', text: 'Quick Links bar on home screen' },
      { type: 'minor', text: 'Operations module placeholder (coming soon)' },
      { type: 'minor', text: 'TR & AM Checkin Completion gauges on Apt Health' },
      { type: 'minor', text: 'Pacing Target lines on Recruiter and Sales dashboards' },
      { type: 'minor', text: 'Follow Ups and Overdue Tasks on Individual Performance' },
    ],
  },
];

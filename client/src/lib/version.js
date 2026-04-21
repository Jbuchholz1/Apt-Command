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

export const APP_VERSION = '3.7.3';

export const CHANGELOG = [
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
      { type: 'minor', text: 'Executive Reporting dashboard now live (admin only) — two KPI tiles: Current New Input (same calc as APT Health Input gauge) and Potential New Input (open reqs × ((Bill−Pay)×1.25)×2080 × # Openings)' },
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
      { type: 'major', text: 'APT Command platform launch with Req Board, Org Flow, Pipeline, Apt Health, Reporting, and Individual Performance modules' },
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

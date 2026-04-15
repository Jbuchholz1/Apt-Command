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

export const APP_VERSION = '2.7.0';

export const CHANGELOG = [
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

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

export const APP_VERSION = '2.0.0';

export const CHANGELOG = [
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

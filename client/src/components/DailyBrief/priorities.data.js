/**
 * @typedef {Object} Priority
 * @property {string} id
 * @property {'urgent' | 'interview' | 'offer'} kind
 * @property {string} clientLabel   // uppercase display label
 * @property {string} headline      // serif title
 * @property {string} context       // paragraph copy
 * @property {{ label: string, href: string }} action
 */

// TODO: wire to live data source — likely Called Shots (`job_overrides.called_shot`
// joined with JobOrder data) + pipeline stage for `kind`. Until then, these
// static defaults demonstrate the Daily Brief priority card layout.

/** @type {Priority[]} */
export const DEFAULT_PRIORITIES = [
  {
    id: 'priority-urgent',
    kind: 'urgent',
    clientLabel: 'Fortune 500 Utility',
    headline: 'Sr. Cloud Architect — 9 days open, 2 subs',
    context: 'Client escalated Friday. SVP Infra wants to see 3 qualified candidates by EOD Wednesday. Maria is sourcing; Jamal flagged one strong internal ref.',
    action: { label: 'Review shortlist', href: '/req-board' },
  },
  {
    id: 'priority-interview',
    kind: 'interview',
    clientLabel: 'N.A. Railway Leader',
    headline: 'PTC Systems Eng — panel at 2:00 PM ET',
    context: 'Candidate: Priya Desai. Fourth-round panel with Director of Signals + 2 staff engineers. Technical take-home cleared 96%.',
    action: { label: 'Open prep doc', href: '/req-board' },
  },
  {
    id: 'priority-offer',
    kind: 'offer',
    clientLabel: 'Regional Health Sys.',
    headline: 'HIPAA Data Engineer — offer out Monday',
    context: 'Awaiting counter-signature from candidate. Start date confirmed 05/11. Background check initiated, compliance docs delivered to client.',
    action: { label: 'Confirm start', href: '/operations' },
  },
];

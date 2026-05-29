// Single source of truth for the req board's job-status set.
// Colors, abbreviations, and the canonical ordered list all live here so they
// can't drift. StatusBadge renders from the maps; FilterBar / ReqBoard /
// StatsStrip use JOB_STATUSES for their option lists.
//
// (Kept in its own module — not in StatusBadge.jsx — so the component file
// only exports a component, which Fast Refresh requires.)

export const STATUS_COLORS = {
  'Accepting Candidates': { bg: '#16a34a', text: '#fff' },
  'Covered':             { bg: '#2563eb', text: '#fff' },
  'Offer Out':           { bg: '#ea580c', text: '#fff' },
  'Placed':              { bg: '#9333ea', text: '#fff' },
  'Filled':              { bg: '#0d9488', text: '#fff' },
  'Lost':                { bg: '#dc2626', text: '#fff' },
  'Wash':                { bg: '#6b7280', text: '#fff' },
  'Archive':             { bg: '#374151', text: '#9ca3af' },
};

export const STATUS_ABBREV = {
  'Accepting Candidates': 'AC',
  'Covered': 'CV',
  'Offer Out': 'OO',
  'Placed': 'PL',
  'Filled': 'FL',
  'Lost': 'LO',
  'Wash': 'WA',
  'Archive': 'AR',
};

// Canonical job statuses in board order — derived from STATUS_COLORS so the
// list and the badge palette can never drift.
export const JOB_STATUSES = Object.keys(STATUS_COLORS);

const POINTS = {
  CLIENT_SUB: 1,
  INTERVIEW: 3,
  START: 10,
  WEEKLY_TARGET: 26,
};

const TIERS = {
  1: { spreadGoal: 7000 },
  3: { spreadGoal: 9000 },
};

// Map recruiter names to tiers. Names must match Bullhorn CorporateUser
// firstName + ' ' + lastName exactly. Update this when recruiters change.
const RECRUITER_TIERS = {
  'Megan Calvert': 1,
  'Brooke Avant': 1,
  'Meg Basden': 1,
  'Catherine Ross': 3,
  'Ked Bailey': 3,
  'Ben Mahaffey': 3,
};

// Recruiting leaders — excluded from the recruiter dashboard.
// Currently empty: Ben Mahaffey was added to the recruiter dashboard as a
// Tier 3 recruiter (2026-06-01). Add a full name (Bullhorn firstName + ' ' +
// lastName) here to hide someone from the dashboard again.
const EXCLUDED_RECRUITERS = new Set([]);

function getRecruiterTier(fullName) {
  return RECRUITER_TIERS[fullName] || 1;
}

function getSpreadGoal(fullName) {
  const tier = getRecruiterTier(fullName);
  return TIERS[tier]?.spreadGoal || TIERS[1].spreadGoal;
}

const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';
function bhLink(entity, id) {
  return `${BH_BASE}?Entity=${entity}&id=${id}`;
}

module.exports = { POINTS, TIERS, RECRUITER_TIERS, EXCLUDED_RECRUITERS, getRecruiterTier, getSpreadGoal, bhLink };

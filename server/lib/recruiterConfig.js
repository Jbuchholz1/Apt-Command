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
};

function getRecruiterTier(fullName) {
  return RECRUITER_TIERS[fullName] || 1;
}

function getSpreadGoal(fullName) {
  const tier = getRecruiterTier(fullName);
  return TIERS[tier]?.spreadGoal || TIERS[1].spreadGoal;
}

module.exports = { POINTS, TIERS, RECRUITER_TIERS, getRecruiterTier, getSpreadGoal };

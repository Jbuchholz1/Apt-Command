const SALES_POINTS = {
  'Touch Point': 0.25,
  'Virtual Meeting': 0.75,
  'In Person Meeting': 1,
  'Coffee': 2,
  'Breakfast': 3,
  'Lunch': 3,
  'New Meeting': 3,
  'Req Qual': 3,
  'Referral Meeting': 4,
  'Happy Hour': 4,
  'Dinner': 5,
  'OOA': 5,
  'Discovery': 7,       // "Sol Disc Meeting" in Canvas
  'Solutions Pitch': 10, // "Sol Pitch Meeting" in Canvas
  'Solutions Touch': 1,  // "Sol Touch Points" in Canvas
  'Solutions Opp Uncovered': 4, // "Sol Opp Uncovered" in Canvas
};

// Display labels for activity types (Canvas naming)
const ACTIVITY_LABELS = {
  'Touch Point': 'Touch Point',
  'Virtual Meeting': 'Virtual Meeting',
  'In Person Meeting': 'In Person Meeting',
  'Coffee': 'Coffee',
  'Breakfast': 'Breakfast',
  'Lunch': 'Lunch',
  'New Meeting': 'New Meeting',
  'Req Qual': 'Req Qual',
  'Referral Meeting': 'Referral Meeting',
  'Happy Hour': 'Happy Hour',
  'Dinner': 'Dinner',
  'OOA': 'OOA',
  'Discovery': 'Sol Disc Meeting',
  'Solutions Pitch': 'Sol Pitch Meeting',
  'Solutions Touch': 'Sol Touch Points',
  'Solutions Opp Uncovered': 'Sol Opp Uncovered',
};

// Ordered list of activity types for display
const ACTIVITY_ORDER = [
  'Touch Point', 'Virtual Meeting', 'In Person Meeting', 'Coffee',
  'Breakfast', 'Lunch', 'New Meeting', 'Req Qual', 'Referral Meeting',
  'Happy Hour', 'Dinner', 'OOA', 'Discovery', 'Solutions Pitch',
  'Solutions Touch', 'Solutions Opp Uncovered',
];

const TIERS = {
  1: { spreadGoal: 7000 },
  3: { spreadGoal: 9000 },
};

// Default all AMs to Tier 1 for now. Update when tier assignments are known.
const AM_TIERS = {};

function getAMTier(fullName) {
  return AM_TIERS[fullName] || 1;
}

function getAMSpreadGoal(fullName) {
  const tier = getAMTier(fullName);
  return TIERS[tier]?.spreadGoal || TIERS[1].spreadGoal;
}

module.exports = { SALES_POINTS, ACTIVITY_LABELS, ACTIVITY_ORDER, TIERS, AM_TIERS, getAMTier, getAMSpreadGoal };

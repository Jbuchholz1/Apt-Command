/**
 * Module catalog — single source of truth for the per-module access system.
 *
 * Every gated tool in the app has an entry here. The key is the value stored
 * in user_module_permissions.module_key. The frontend mirrors this in
 * client/src/lib/modules.js — keep them in sync.
 *
 * Reporting is split into one entry per sub-dashboard. The `parent: 'reporting'`
 * hint lets the sidebar collapse them into a single nav item.
 */

const MODULES = Object.freeze({
  req_board:             { label: 'Req Board' },
  org_flow:              { label: 'Org Flow' },
  pipeline:              { label: 'Pipeline' },
  client_health:         { label: 'APT Health' },
  reporting_recruiter:   { label: 'Recruiter Dashboard',  parent: 'reporting' },
  reporting_sales:       { label: 'Sales Dashboard',      parent: 'reporting' },
  reporting_executive:   { label: 'Executive Dashboard',  parent: 'reporting' },
  reporting_performance: { label: 'My Performance',       parent: 'reporting' },
  goal_tracking:         { label: 'Goal Tracking' },
  support:               { label: 'Support' },
  operations:            { label: 'Operations' },
  project_management:    { label: 'Project Management' },
  admin:                 { label: 'Admin' },
});

const MODULE_KEYS = Object.freeze(Object.keys(MODULES));
const MODULE_KEY_SET = new Set(MODULE_KEYS);

const ACCESS_LEVELS = Object.freeze(['basic', 'admin']);
const ACCESS_LEVEL_SET = new Set(ACCESS_LEVELS);

function isValidModuleKey(key) {
  return typeof key === 'string' && MODULE_KEY_SET.has(key);
}

function isValidAccessLevel(level) {
  return typeof level === 'string' && ACCESS_LEVEL_SET.has(level);
}

module.exports = {
  MODULES,
  MODULE_KEYS,
  ACCESS_LEVELS,
  isValidModuleKey,
  isValidAccessLevel,
};

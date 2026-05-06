// Mirror of server/lib/modules.js. Keep in sync — both files are the
// source of truth for the per-module access system.

export const MODULES = {
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
};

export const MODULE_KEYS = Object.keys(MODULES);

export const ACCESS_LEVELS = ['basic', 'admin'];

export const REPORTING_SUB_KEYS = MODULE_KEYS.filter(k => MODULES[k].parent === 'reporting');

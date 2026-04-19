-- Goal Tracking — Phase 1 (manual entry)
-- Run this in the Supabase SQL editor. Idempotent.

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  parent_id uuid references goals(id) on delete set null,
  name text not null,
  description text,
  goal_type text not null check (goal_type in ('rollup','number','task')),
  owner_email text not null,
  owner_name text,
  rollup_method text check (rollup_method in ('average','weighted')),
  start_value numeric,
  current_value numeric,
  target_value numeric,
  unit text,
  status_mode text not null default 'calculated' check (status_mode in ('calculated','user_driven')),
  status_override text check (status_override in ('green','yellow','red')),
  is_company_priority boolean not null default false,
  weight numeric not null default 1,
  sort_order integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Forward-compat columns for Phase 2 auto-metrics (null until then)
  metric_key text,
  metric_params jsonb,
  metric_last_synced_at timestamptz
);

create index if not exists idx_goals_period_parent on goals(period, parent_id);
create index if not exists idx_goals_owner_period  on goals(owner_email, period);
create index if not exists idx_goals_priority      on goals(is_company_priority, period);

create table if not exists goal_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  assignee_email text,
  assignee_name text,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_goal_tasks_goal on goal_tasks(goal_id);

create table if not exists goal_checkins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  progress_pct numeric not null,
  value numeric,
  status text check (status in ('green','yellow','red')),
  note text,
  source text not null check (source in ('manual','task_completion','rollup')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_goal_checkins_goal_time on goal_checkins(goal_id, created_at);

create table if not exists goal_priorities (
  user_email text not null,
  goal_id uuid not null references goals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_email, goal_id)
);

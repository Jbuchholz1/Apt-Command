-- Project Management — Trello-style kanban for internal projects/tasks/deadlines.
-- Audience: admin + manager only (gated at the API layer via requireManager).
-- Run this in the Supabase SQL editor. Idempotent.

create table if not exists pm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text,
  archived_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create index if not exists idx_pm_projects_archived on pm_projects(archived_at);

create table if not exists pm_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pm_projects(id) on delete cascade,
  name text not null,
  position double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_columns_project on pm_columns(project_id, position);

create table if not exists pm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pm_projects(id) on delete cascade,
  column_id uuid not null references pm_columns(id) on delete cascade,
  title text not null,
  description text,
  assignee_email text,
  assignee_name text,
  due_date date,
  priority text check (priority in ('low','normal','high','urgent')),
  labels jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  position double precision not null,
  completed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create index if not exists idx_pm_tasks_column on pm_tasks(column_id, position);
create index if not exists idx_pm_tasks_project on pm_tasks(project_id);
create index if not exists idx_pm_tasks_assignee on pm_tasks(assignee_email);
create index if not exists idx_pm_tasks_due on pm_tasks(due_date) where due_date is not null;

create table if not exists pm_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references pm_tasks(id) on delete cascade,
  body text not null,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists idx_pm_comments_task on pm_comments(task_id, created_at);

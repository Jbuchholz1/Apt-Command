# Apt Command — Digital Req Board

A live, web-accessible operations platform for **APT Companies** (staffing firm, Southeast US). Replaces a manually-updated SharePoint Excel file with a real-time dashboard that pulls directly from **Bullhorn CRM** via a custom MCP server, layers in firm-specific overrides and tracking via **Supabase**, and exposes reporting dashboards across recruiting, sales, performance, and operations.

> Internal tool. Not open-source. Code lives at <https://github.com/Jbuchholz1/Apt-Command>.

---

## At a glance

- **Audience:** APT recruiters, account managers, leadership, and a small set of external vendors (India team).
- **Replaces:** A weekly Excel-driven "Req Board" that drifted from CRM reality and required manual upkeep.
- **Now does:** Live job-order board with inline editing, real-time SSE updates, reporting dashboards, opportunity pipeline, individual performance dashboards, nightly SharePoint export, admin user/permission management, and an India-specific board for the offshore team.
- **Current version:** `3.29.17` (source: [`client/src/lib/version.js`](client/src/lib/version.js)).

---

## Architecture

```
                    Browser (React SPA, MSAL + JWT auth)
                                  │
                                  ▼
                  ┌──────────────────────────────────┐
                  │  Railway: frontend                │  Vite build, served
                  │  Static React SPA                 │  static via Express
                  └────────────────┬──────────────────┘
                                   │  HTTPS, Bearer JWT
                                   ▼
                  ┌──────────────────────────────────┐
                  │  Railway: api-server              │  Node.js / Express
                  │  Auth, rate-limit, route          │  3-layer rate limiting,
                  │  MCP proxy, Supabase ORM, CSP     │  optimistic locking,
                  │                                   │  SSE event broadcast
                  └────┬────────┬──────────┬──────┬───┘
                       │        │          │      │
                       ▼        ▼          ▼      ▼
                ┌──────────┐ ┌──────┐ ┌────────┐ ┌──────────┐
                │ Bullhorn │ │ Sup- │ │ Microsoft│ │ SharePoint│
                │ MCP      │ │ abase│ │ Entra ID │ │  (Graph,  │
                │ Server   │ │ (PG +│ │ + Graph  │ │   nightly │
                │ (Railway)│ │  RT) │ │  (SSO)   │ │   export) │
                └────┬─────┘ └──────┘ └──────────┘ └──────────┘
                     │
                     ▼
                Bullhorn REST API
                (rest42.bullhornstaffing.com)
```

**Why the api-server sits in the middle:** the Bullhorn MCP credentials must never reach the browser. The api-server keeps every MCP call server-side and is also the single chokepoint for `READ_ONLY_MODE` (sandbox write-protection), rate limiting, and the Supabase service-role connection.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, MSAL.js (Azure AD SSO), recharts, React Router |
| API server | Node.js, Express, Supabase JS client, `@azure/msal-node`, `node-fetch` |
| Database | Supabase (Postgres + Realtime + Storage) |
| CRM source | Bullhorn (via custom MCP server) |
| Auth | Microsoft Entra ID (Azure AD) SSO for internal staff; signed email/password JWT for external vendors |
| Hosting | Railway (frontend + api-server as two services) |
| Object storage | Supabase Storage (client logos, support screenshots) |
| Document export | Microsoft Graph → SharePoint (nightly Excel backup) |

---

## Feature modules

Each module is a self-contained area of the frontend (`client/src/modules/<name>/`). All are gated by per-user module permissions stored in Supabase (`user_module_permissions`).

| Module | What it does |
|--------|--------------|
| **Req Board** | Main job-order board — sortable table, multi-filter, inline editing of overrides + Bullhorn write-back fields, status badges, JobDetail slide-out, real-time updates via SSE. |
| **India Req Board** | Same board, scoped to jobs flagged for the India team. Identical edit surface, identical underlying data. |
| **Reporting** | Recruiter, Sales, and Executive dashboards — KPI cards, line/bar/scatter charts, period filters (weekly/monthly/quarterly), goal-tracking. |
| **Performance** | Individual "My Dashboard" — personal metrics for the logged-in user. |
| **Pipeline** | Opportunity pipeline + Convert-to-Job workflow that creates a Bullhorn JobOrder from an Opportunity. |
| **Org Flow** | Org chart / workflow visualization. |
| **Client Health** | Client relationship health gauges. |
| **Goal Tracking** | Goal-setting and pacing against quotas. |
| **Operations** | Operations module. |
| **Project Management** | Internal project tracking. |
| **Support** | Support ticket UI for end users to report issues. |
| **Admin** | User roles, per-module permissions, external-user creation, ad-hoc SharePoint export trigger. |

Universal search (Cmd+K / Ctrl+K) opens a global search modal across jobs, candidates, and clients.

---

## Data sources — what lives where

The app is two databases stitched together. Knowing which is which is the single biggest thing to internalize.

| Concern | Source of truth | Notes |
|---------|----------------|-------|
| Job title, client, status, employment type, owner, priority, rates, # openings | **Bullhorn** | Read on every refresh. Write-back through whitelisted API endpoints. |
| Submissions, placements, candidates | **Bullhorn** | Read-only on the board; placement dates + rates are editable via `/placements/:id/update`. |
| Inline notes, deadlines, follow-up, coverage flags, 48-hr indicator, called-shot count, "Apt India" flag | **Supabase** (`job_overrides`) | Local to this app; optimistically locked per row. |
| Job-thread notes (timeline) | **Supabase** (`job_notes`) | Fire-and-forget mirror to a Bullhorn Note. |
| User profiles, roles, module permissions, announcements | **Supabase** (`user_profiles`, `user_module_permissions`, `announcements`) | External users (`auth_provider='external'`) have bcrypt-hashed passwords here. |
| Opportunity overrides (`note` field) | **Supabase** (`opportunity_overrides`) | Local-only metadata on Bullhorn Opportunities. |
| Goal targets and tracking | **Supabase** | Per-user / per-team goals + pacing computation. |
| Org Flow snapshots | **Supabase** (synced every 30 min) | From Bullhorn via `lib/orgflowSync.js`. |

**Gotcha:** Bullhorn `Placement` records have no `isDeleted` field — adding `AND isDeleted = false` to a Placement query returns HTTP 400. The "always filter isDeleted" rule applies to JobOrder, JobSubmission, Note, Candidate but NOT Placement.

---

## Environments

Two parallel Railway environments backed by separate Supabase projects. Same MCP server reads both (Bullhorn has no vendor-provided sandbox).

| | Production | Sandbox |
|---|------------|---------|
| Branch | `main` | `staging` |
| Railway env | `production` | `sandbox` (same Railway project) |
| Supabase project | prod | sandbox (full data isolation) |
| Bullhorn reads | live | live (shared MCP) |
| Bullhorn writes | live | **blocked** via `READ_ONLY_MODE=true` env var |
| Auth | Azure AD SSO + external JWT | same Azure app (sandbox URL added as redirect URI) |
| UI banner | none | orange "🟡 SANDBOX" strip |
| Frontend URL | (see Railway dashboard) | `https://front-end-services-sandbox.up.railway.app` |

`READ_ONLY_MODE` is enforced at one chokepoint (`server/lib/bullhorn.js`): mutating MCP tools return a `403 READ_ONLY_MODE` error which the UI surfaces as a clean toast. Local Supabase writes are unaffected, so sandbox can still build its own override + note state.

---

## Deployment workflow

Railway auto-deploys on push. The branch determines which environment redeploys:

```
feature-branch ──► merge to staging ──► Railway redeploys SANDBOX (~2 min)
                                       └─► validate in sandbox
                                       └─► fast-forward staging → main
                                                                │
                                                                ▼
                                              Railway redeploys PROD (~2 min)
```

Promotion is always a **fast-forward merge** of `staging` into `main` — same commit hash promotes through both environments. No re-deploys with subtly different builds.

### To ship a change

```bash
# 1. Branch from staging, do work, commit
git checkout staging && git pull
git checkout -b feature/whatever
# ...edits, commits...

# 2. Merge to staging (this triggers sandbox redeploy)
git checkout staging
git merge --no-ff feature/whatever
git push origin staging

# 3. Validate in sandbox at the URL above

# 4. Promote to prod (fast-forward, triggers prod redeploy)
git checkout main && git pull
git merge --ff-only staging
git push origin main
```

For Claude Code sessions: saying "push it" or "ship it" without naming a branch defaults to step 2 (staging). The session waits for explicit "promote" before doing step 4. This is documented in `CLAUDE.md` under "Default deploy behavior for Claude".

---

## Local development

### Prerequisites
- Node.js 20+
- A `.env` for the server with at minimum: `BULLHORN_MCP_URL`, `BULLHORN_MCP_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`. See `.env.example` for the full list.
- A `.env` for the client with `VITE_API_BASE_URL`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`. Set `VITE_DEV_BYPASS_AUTH=true` to skip MSAL during local dev (note: the api-server still needs a real token).

### Run

```bash
# api-server (port 3001 by default)
cd server
npm install
npm run dev       # node --watch index.js

# frontend (port 5173 by default)
cd client
npm install
npm run dev       # vite

# lint client
npm run lint      # eslint .
```

The frontend talks to the api-server at `VITE_API_BASE_URL`. Set it to `http://localhost:3001` for local dev.

### Tests

No automated test suite is currently wired up — see `scripts/test-search.js` for the only manual harness. UAT scripts are a planned addition.

---

## Project structure

```
.
├── README.md                    ← This file
├── CLAUDE.md                    ← Project-wide brief for Claude Code sessions
├── .env.example                 ← Full env var template (server + client)
├── scripts/                     ← One-off SQL exports, manual test scripts
│
├── server/                      ← Railway service: api-server
│   ├── CLAUDE.md                ← Endpoints, rules, gotchas, task recipes
│   ├── index.js                 ← Express entry, CORS, rate limits, error handler
│   ├── routes/                  ← 16 route files
│   ├── lib/                     ← 18 helpers (bullhorn MCP, db, cache, ...)
│   ├── middleware/              ← auth.js, adminAuth.js
│   └── migrations/              ← Numbered SQL migrations for Supabase
│
└── client/                      ← Railway service: frontend
    ├── README.md                ← Frontend-specific notes
    ├── CLAUDE.md                ← Modules, components, editing patterns
    ├── vite.config.js
    └── src/
        ├── App.jsx              ← Routing + sandbox banner + auth gating
        ├── components/          ← AppShell, Sidebar, LoginPage, UniversalSearch, ...
        ├── modules/             ← 12 feature modules (see table above)
        ├── hooks/               ← Shared React hooks
        └── lib/                 ← api.js, UserRoleContext, authConfig, version.js
```

---

## API surface (high level)

Full reference is in [`server/CLAUDE.md`](server/CLAUDE.md). Quick orientation:

| Group | Canonical prefix | What it does |
|-------|------------------|--------------|
| Req Board reads | `GET /api/req-board/jobs/*` | Jobs, stats, single-job detail, SSE event stream, offer-out candidates, Excel export. |
| Req Board writes | `POST /api/req-board/jobs/:id/bullhorn-update`, `PATCH /api/req-board/jobs/:id/overrides`, `POST /api/req-board/jobs/:id/notes` | Bullhorn write-back vs Supabase override vs note-thread. |
| Submissions / Placements | `POST /api/req-board/jobs/submissions/:id/update`, `POST /api/req-board/jobs/placements/:id/update` | Per-record updates against Bullhorn. |
| Pipeline | `GET /api/req-board/jobs/opportunities`, `POST /api/req-board/jobs/opportunities/:id/convert` | Opportunities + Convert-to-Job. |
| Auth | `POST /api/auth/external/login`, `POST /api/auth/external/change-password` | External vendor email/password flow. Internal users come in via Azure AD MSAL on the frontend. |
| Admin | `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PUT /api/admin/announcement` | User management + site announcement. |
| Health (public) | `GET /api/health`, `POST /api/csp-report` | Railway healthcheck + CSP violation collector. |

Legacy `/api/jobs`, `/api/placements`, `/api/stats` aliases still resolve to the canonical `/api/req-board/*` handlers.

---

## Auth & permissions

**Authentication:**
- **Internal staff** sign in via Microsoft Entra ID (Azure AD) using MSAL.js. Token is `RS256`-signed, validated server-side against the tenant JWKS endpoint.
- **External vendors** sign in via `POST /api/auth/external/login` with email + bcrypt-hashed password. Server issues an `HS256` JWT signed with `EXTERNAL_JWT_SECRET`, 8-hour expiry. Rate-limited 5 attempts / 15 min per IP; 10 consecutive failures lock the account for 30 min.
- All authenticated requests use `Authorization: Bearer <JWT>`. **No cookies, ever** — CSRF is non-applicable as a result. Do not introduce cookie sessions without also adding CSRF protection.

**Authorization:**
- Role tiers: `admin`, `editor`, `viewer`, `guest` (stored in `user_profiles.role`).
- Module access controlled by `user_module_permissions` (14 modules, each grantable at `basic` or `admin` level).
- Server middleware: `requireModule(name, level)` from `lib/modules.js`.
- Client gate: `hasAccess(module, level)` from `UserRoleContext`. Sidebar links hide modules the user lacks.
- Bootstrap admins are seeded via `BOOTSTRAP_ADMIN_EMAILS` env var (comma-separated) so first-run access always works even before any `user_profiles` row exists.

---

## Background jobs

| Job | Schedule | Lives in | Gated by |
|-----|----------|----------|----------|
| Org Flow sync (Bullhorn → Supabase) | every 30 min | `server/lib/orgflowSync.js` | `ENABLE_SYNC_CRON=true` (always on in prod) |
| SharePoint Excel export (Req Board, Org Flow, Pipeline) | nightly 23:00 CT | `server/lib/scheduledExport.js` | `ENABLE_EXPORT_CRON=true` (always on in prod) |

The SharePoint export uploads to a configured drive (`SHAREPOINT_DRIVE_ID`) under `SHAREPOINT_FOLDER_PATH=Daily Backups`. An ad-hoc "Run Export Now" button in the Admin module triggers the same code path.

---

## Where to find more

| Doc | What's in it |
|-----|--------------|
| [`CLAUDE.md`](CLAUDE.md) | Project-wide brief: architecture, Bullhorn data model, deploy workflow, env vars, Gotchas. Read first if you're picking up a task. |
| [`server/CLAUDE.md`](server/CLAUDE.md) | Full API endpoint reference, route + lib file maps, server rules, common task recipes (add an override field, add a Bullhorn write-back field, add a route). |
| [`client/CLAUDE.md`](client/CLAUDE.md) | Module list, shared components/libs, status badge colors, refresh cadence, inline editing patterns + conflict resolution. |
| [`.env.example`](.env.example) | Authoritative env var template, well-commented. |
| `client/src/lib/version.js` | App version + in-app changelog content. |

---

## License

Internal — APT Companies. Not licensed for external distribution.

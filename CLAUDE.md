# Digital Req Board — Project Brief for Claude Code

## What We're Building

A live, web-accessible **Digital Req Board** for APT Companies (staffing firm, Southeast US). This replaces a manually-updated SharePoint Excel file with a real-time dashboard that pulls directly from Bullhorn CRM via a custom MCP server.

The app has two parts:
1. **API Server** — Node.js backend that proxies requests to the Bullhorn MCP server and serves clean JSON to the frontend
2. **Frontend** — React SPA with a polished req board UI, auto-refresh, filters, and status color-coding

Both are deployed on **Railway**.

---

## Architecture

```
Browser (React SPA, Vite build)
        │
        ▼
Railway Service A: Frontend (static, served by Express)
        │
        ▼
Railway Service B: API Server (Node.js/Express)
        │           │              │              │
        ▼           ▼              ▼              ▼
   Bullhorn      Supabase     Microsoft Entra   SharePoint
   MCP Server    (overrides,  ID (Azure AD     (nightly export
   (Railway)     notes,       SSO + Graph)     cron, lib/
       │         users,                        scheduledExport.js)
       ▼         perms)
   Bullhorn
   REST API
```

> **Why a separate API server?** The Bullhorn MCP URL requires auth credentials that must never be exposed to the browser. The Node.js API server keeps all MCP calls server-side. The API server also fans out to Supabase (overrides + app-owned data), Microsoft Graph (SharePoint export), and Microsoft Entra (auth validation).

> **Live URLs**: not hard-coded here. The sandbox frontend is `https://front-end-services-sandbox.up.railway.app` (referenced in the deploy workflow below). Prod URLs and the MCP server URL live in Railway env vars per service — check the Railway dashboard for current values.

---

## Bullhorn MCP Server

- **URL:** `BULLHORN_MCP_URL` env var on the api-server Railway service (do not hard-code)
- **Protocol:** MCP (Model Context Protocol) over SSE; response is line-based event stream parsed in `server/lib/bullhorn.js`
- **Auth:** Bearer token via `BULLHORN_MCP_API_KEY` env var
- **Resilience:** `server/lib/mcpBreaker.js` is a circuit breaker that trips after repeated failures, protecting the API from cascading Bullhorn outages. 30s per-call timeout.
- **Read-only sandbox mode:** when `READ_ONLY_MODE=true`, mutating tools (`update_entity`, `add_note`, `create_entity`) are blocked at the MCP wrapper and surface as `403 READ_ONLY_MODE` to the client.

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `search_jobs` | Search JobOrders by status, owner, keyword |
| `query_entity` | Raw WHERE-clause query on any Bullhorn entity |
| `get_submissions` | Get candidate submissions for a job order ID |
| `get_candidate` | Look up a candidate by name or ID |
| `search_candidates` | Search candidates by skill, status, keyword |
| `get_entity_fields` | Get metadata/schema for any entity type |
| `update_entity` | Write to any entity (blocked in sandbox via READ_ONLY_MODE) |
| `add_note` | Add a Note record (blocked in sandbox) |
| `create_entity` | Create a new entity record (blocked in sandbox) |

---

## Bullhorn Data Model (Verified from Live Schema)

### JobOrder — Key Fields

| Field | Bullhorn Name | Notes |
|-------|--------------|-------|
| Job Title | `title` | String |
| Client Company | `clientCorporation.name` | TO_ONE → ClientCorporation |
| Client Contact | `clientContact.firstName` + `lastName` | TO_ONE |
| Status | `status` | See status options below |
| Owner/Recruiter | `owner.firstName` + `owner.lastName` | TO_ONE → CorporateUser |
| Assigned Users | `assignedUsers` | TO_MANY → CorporateUser |
| Employment Type | `employmentType` | Direct Hire, Contract, Contract To Hire, Project |
| # of Openings | `numOpenings` | Integer |
| Pay Rate | `payRate` | BigDecimal |
| Salary Low | `salary` | BigDecimal |
| Salary High | `customFloat1` | BigDecimal (labeled "Salary High") |
| Deal Value | `customFloat2` | BigDecimal (labeled "Deal Value") |
| Remote | `customText1` | Yes / No / Hybrid |
| # Filled | `customText2` | String (labeled "# Filled") |
| # Washed | `customText3` | String (labeled "# Washed") |
| # Lost | `customText4` | String (labeled "# Lost") |
| Staffing or Project | `customText5` | "1"=staffing / "0"=project |
| Apriora Status | `customText40` | String |
| Date Added | `dateAdded` | Timestamp (Unix ms) — use `new Date(val)` |
| Date Closed | `dateClosed` / `customDate1` | Timestamp |
| Start Date | `startDate` | Timestamp |
| Estimated End Date | `estimatedEndDate` | Date |
| Is Open | `isOpen` | Boolean |
| Priority | `type` | 1=A, 2=B, 3=C |
| Work From Home | `isWorkFromHome` | Boolean |
| Location City | `address.city` | Nested composite |
| Location State | `address.state` | Nested composite |
| Timesheet Filter | `correlatedCustomText1` | labeled "Timesheet Filter" |

### JobOrder Status Options (exact values)
```
"Accepting Candidates"
"Covered"
"Offer Out"
"Placed"
"Filled"
"Lost"
"Wash"
"Archive"
```

### Active / Open Job Query
```javascript
// To get all open/active reqs:
query_entity({
  entityType: "JobOrder",
  where: "isOpen = true AND isDeleted = false",
  fields: "id,title,status,owner,clientCorporation,clientContact,employmentType,numOpenings,payRate,salary,customFloat1,customFloat2,customText1,customText2,customText3,customText4,customText5,customText40,dateAdded,startDate,estimatedEndDate,address,assignedUsers,type",
  orderBy: "-dateAdded",
  count: 100
})
```

### Placement — For Active Contractors
```javascript
query_entity({
  entityType: "Placement",
  where: "status = 'Active'",
  fields: "id,candidate,jobOrder,dateBegin,dateEnd,payRate,clientBillRate,status",
  orderBy: "-dateBegin",
  count: 100
})
```

### Timestamp Handling (CRITICAL)
Bullhorn returns timestamps as Unix milliseconds. Always convert with:
```javascript
const date = new Date(timestampMs);
// Format for display:
date.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })
```
Never manually calculate from raw ms values.

---

## Project File Structure (Actual)

```
digital-req-board/
├── CLAUDE.md                  ← This file (project-wide brief)
├── README.md
├── .env.example               ← Full env var template (server + client)
├── scripts/                   ← One-off SQL exports, manual test harnesses
│
├── server/                    ← Railway Service: api-server
│   ├── CLAUDE.md              ← Server-specific: endpoints, gotchas, recipes
│   ├── index.js               ← Express entry — routes, CORS, rate limits
│   ├── routes/                ← 16 route files (jobs, auth, admin, reporting, etc.)
│   ├── lib/                   ← 18 helpers (bullhorn MCP, db, cache, mcpBreaker,
│   │                            realtimeBroadcast, sharepoint, scheduledExport, ...)
│   ├── middleware/            ← auth.js (Entra + external JWT), adminAuth.js
│   └── migrations/            ← Supabase schema migrations (numbered SQL files)
│
└── client/                    ← Railway Service: frontend
    ├── CLAUDE.md              ← Client-specific: modules, components, edit patterns
    ├── vite.config.js
    └── src/
        ├── App.jsx            ← Routing + sandbox banner + auth gating
        ├── main.jsx
        ├── components/        ← AppShell, Sidebar, LoginPage, HomePage,
        │                        UniversalSearch/, ChangelogModal, ...
        ├── modules/           ← Feature modules — each self-contained:
        │   ├── req-board/     ← Main board (ReqBoardModule, JobDetail,
        │   │                    StatusBadge, FilterBar, ConflictDialog, ...)
        │   ├── india-req-board/  ← Thin wrapper over ReqBoardModule
        │   ├── reporting/     ← Recruiter/Sales/Exec dashboards
        │   ├── performance/   ← Individual "My Dashboard"
        │   ├── pipeline/      ← Opportunities + Convert-to-Job
        │   ├── admin/         ← User roles, permissions, ad-hoc export
        │   ├── org-flow/      ← Org chart / workflow
        │   ├── client-health/ ← Client relationship gauges
        │   ├── goal-tracking/ ← Goals + pacing
        │   ├── operations/    ← Operations module
        │   ├── project-management/
        │   └── support/       ← Support ticket UI
        ├── hooks/             ← Shared React hooks
        └── lib/               ← api.js, UserRoleContext, authConfig, toast, version
```

---

## Environment Variables

Authoritative template lives in `/.env.example` (single file, server + client sections). Set per-service in the Railway dashboard.

### Server (api-server Railway service)
```
PORT=3001
NODE_ENV=production|development

# Bullhorn MCP
BULLHORN_MCP_URL=<MCP server URL>
BULLHORN_MCP_API_KEY=<bearer token>

# Sandbox guard — blocks update_entity/add_note/create_entity at the MCP wrapper.
# Set to 'true' on sandbox; unset/false in prod.
READ_ONLY_MODE=false

# Background crons (always on in prod; opt-in for dev)
ENABLE_SYNC_CRON=false          # Org Flow sync every 30 min
ENABLE_EXPORT_CRON=false        # Nightly SharePoint export at 23:00 CT

# Microsoft Entra (Azure AD) — SSO + Graph
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=            # required for SharePoint export (app-only Graph)

# SharePoint export target — set ONE
SHAREPOINT_DRIVE_ID=            # preferred (any library on any site)
SHAREPOINT_SITE_ID=             # fallback (default "Documents" library only)
SHAREPOINT_FOLDER_PATH=Daily Backups

# CORS + Supabase
FRONTEND_URL=                   # frontend Railway URL (for CORS allowlist)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=           # service-role key

# Auth bootstrap + CSP
BOOTSTRAP_ADMIN_EMAILS=         # comma-separated; resolve to admin even without
                                # a user_profiles row. Critical for first-run.
CSP_MODE=report-only            # off | report-only | enforce
```

### Client (frontend Railway service)
```
VITE_API_BASE_URL=              # api-server Railway URL
VITE_AZURE_TENANT_ID=
VITE_AZURE_CLIENT_ID=
VITE_DEV_BYPASS_AUTH=           # local dev only — skip MSAL; backend still requires real token
VITE_ENV=sandbox                # renders orange SANDBOX banner; leave unset in prod
```

---

## Railway Deployment Notes

- Two Railway services in one project: `api-server` and `frontend`
- Both deploy from the same GitHub repo using Railway's root directory setting
- API server: root dir = `server/`, start command = `node index.js`
- Frontend: root dir = `client/`, build command = `npm run build`, serve with static or a simple Express static server
- Set all env vars in Railway dashboard per service
- The API server URL becomes the `VITE_API_BASE_URL` for the frontend

---

## Environments

Two parallel deployments, one Bullhorn tenant (no separate Bullhorn sandbox available from the vendor).

| | Production | Sandbox |
|---|---|---|
| Branch | `main` | `staging` |
| Railway | `production` environment | `sandbox` environment (same Railway project) |
| Supabase | prod project | separate sandbox project (full data isolation) |
| Bullhorn reads | live | live (same MCP server) |
| Bullhorn writes | live | **blocked** via `READ_ONLY_MODE=true` |
| Auth | Azure AD SSO | same Azure AD app (sandbox URL added as redirect URI) |
| UI banner | none | orange "SANDBOX" banner (`VITE_ENV=sandbox`) |

**Workflow:** feature branch → merge to `staging` → auto-deploys to sandbox → validate → merge `staging` → `main` → auto-deploys to prod. Same commit hash promotes — guaranteed 1:1.

**Default deploy behavior for Claude — IMPORTANT:** When the user says "push it", "ship it", "deploy", or any similar phrase **without explicitly naming a branch or environment**, the default action is:
1. Commit and push to `staging` (sandbox), **not** `main` (prod).
2. After pushing, tell the user: *"Pushed to staging — sandbox will redeploy in ~2 min. Test at https://front-end-services-sandbox.up.railway.app, then say 'promote' (or 'ship to prod') once you've confirmed it works."*
3. Wait for the user to confirm the change works in sandbox. Typical confirmations: "works", "looks good", "promote", "ship it to prod", "push to prod".
4. Once confirmed, fast-forward merge `staging` → `main` and push, which triggers the prod redeploy. Tell the user: *"Promoted to prod — Railway will redeploy in ~2 min."*
5. Skip the sandbox **only** when the user explicitly says "push directly to prod", "hotfix to prod", "skip sandbox", or names `main` directly. Even then, briefly confirm before doing it.

This protects the user's old "push it" muscle memory by making the default destination safe. The user's prior workflow was direct-to-prod; the new default is direct-to-sandbox, with promotion as a separate explicit step.

**Testing in sandbox:** push to `staging` → wait ~2 min for Railway to redeploy → open the sandbox frontend URL → log in with the same Azure SSO account as prod → use the app exactly like prod. The orange banner confirms you're in sandbox. Any Bullhorn write attempts surface as a 403 read-only toast; local Supabase writes hit the sandbox DB.

**The READ_ONLY_MODE toggle** (`server/lib/bullhorn.js`): when `true`, blocks `update_entity`, `add_note`, and `create_entity` at the MCP chokepoint. The route error handler (`server/index.js`) surfaces these as `403 READ_ONLY_MODE` so the UI can show a clean toast. Local Supabase writes are unaffected.

**To test write-back specifically** in sandbox: temporarily set `READ_ONLY_MODE=false` on the sandbox api-server, redeploy, run the test against a clearly-marked test record in Bullhorn, then flip back to `true`.

**Sandbox Supabase provisioning:** the sandbox project's initial schema was copied from prod via `scripts/export-prod-schema.sql` — paste that file into the **prod** Supabase SQL Editor, copy the single-cell result, paste into the **sandbox** SQL Editor, run. Reusable any time you need to re-provision a Supabase env from prod's schema. No DB password required (uses the SQL Editor's dashboard auth).

**Refreshing sandbox data from prod:** not yet automated. The sandbox currently builds up its own test data organically. If you want real prod data in sandbox for realistic testing, the path is:
1. Resolve the Supabase pooler auth issue (DB password reset against the prod project's pooler kept returning "auth failed" — likely needs a Supabase support ticket or comes free when upgrading off the free tier).
2. Once `pg_dump` against the pooler works, write a fresh refresh script (5-min job for Claude).
3. Storage buckets (client-logos, support-screenshots) would need manual copy via the dashboard regardless — `pg_dump` doesn't capture Supabase Storage.

---

## Architectural Rules

1. **MCP calls are server-side only** — never call the MCP URL from the browser. `BULLHORN_MCP_API_KEY` stays on the api-server.
2. **Bearer auth only — no cookies.** Every authenticated request carries `Authorization: Bearer <JWT>`. The server never sets a session cookie and the client never uses `credentials: 'include'`. Do not introduce cookie-based sessions without also adding CSRF protection — the switch silently turns CSRF from "not applicable" to "exposed".
3. **CORS** — api-server reads `FRONTEND_URL` for the allowlist. Update both Railway services together if either URL changes.
4. **Timestamps** — Bullhorn returns Unix ms. Always `new Date(ms)`, then format with `toLocaleDateString('en-US', { timeZone: 'America/Chicago' })`. Never math on raw ms for display.
5. **Pagination** — Bullhorn default `count` is 20; req board uses 100+; handle pagination explicitly when needed.
6. **TO_ONE fields** — request them by name in `fields` (e.g. `owner,clientCorporation`); Bullhorn returns the nested object automatically.

---

## Gotchas (read this before debugging)

These are the traps that have cost real time on this codebase. Most are non-obvious from the code alone.

1. **`Placement` has no `isDeleted` field.** Adding `AND isDeleted = false` to a Placement query returns HTTP 400 and zero records. The generic isDeleted rule does NOT apply to Placement — only JobOrder / JobSubmission / Note / Candidate / etc. Bullhorn's schema is inconsistent here.

2. **Override saves are optimistically locked.** `PATCH /api/req-board/jobs/:id/overrides` requires `If-Match: <version>` (from the prior read). A concurrent edit causes `409 OVERRIDE_CONFLICT`; the client `ConflictDialog` reloads-and-retries. If you bypass If-Match you will silently overwrite other users' edits.

3. **READ_ONLY_MODE surfaces as `403 READ_ONLY_MODE`.** `server/lib/bullhorn.js` blocks mutating MCP tools when the env var is true. The route error handler converts to a 403 with `code: 'READ_ONLY_MODE'` so the UI can toast cleanly. Local Supabase writes are NOT blocked — only Bullhorn writes.

4. **Falloff rule:** statuses `['Archive', 'Placed', 'Lost', 'Wash', 'Filled']` (in `server/routes/jobs.js`) cause a req to disappear from both Req Boards 12 hours after the status change. **Called Shot jobs bypass this rule** so manually-flagged high-priority reqs don't vanish.

5. **Auto-refresh is 20 seconds, not 5 minutes** (`client/src/modules/req-board/ReqBoardModule.jsx:16`). Plus a 5s relative-time ticker, plus an SSE event stream (`/api/req-board/jobs/events`) for realtime override merges. Auto-refresh pauses while the detail panel is open or any cell is being edited, to avoid clobbering in-flight saves.

6. **3-layer rate limiting** in `server/index.js`:
   - IP flood limiter — 1000 req/min per IP, **before** auth
   - Per-user limiter — 200 req/min, keyed by Entra `oid` or IP, **after** auth
   - Write limiter — 30 mutations/min per user
   If a test or sync script is getting throttled, this is why.

7. **MCP circuit breaker** (`server/lib/mcpBreaker.js`) trips after repeated failures and short-circuits subsequent MCP calls. If Bullhorn is down, expect the breaker to surface errors instead of long timeouts.

8. **External-login lockout.** `/api/auth/external/login` rate-limits to 5 attempts per 15 min per IP; 10 consecutive failures triggers a 30-min lockout on the account. Useful to know when an external vendor user can't log in.

9. **India Req Board shares everything with the regular board.** `IndiaReqBoardModule` is a thin wrapper over `ReqBoardModule` with `apiFilter={{ apt_india: true }}` and `permissionKey="india_req_board"`. Edits on either board hit the same Bullhorn record and the same `job_overrides` Supabase row. Backed by `/api/req-board/jobs` and `/api/req-board/stats` with the `?apt_india=true` query param. The flag is set via a checkbox column on the regular board; gated by the `india_req_board` module permission (off by default for everyone).

10. **App version source of truth** is `client/src/lib/version.js` (currently `3.29.17`). Update on every prod deploy and add a changelog entry there — the in-app Changelog modal reads from this constant.

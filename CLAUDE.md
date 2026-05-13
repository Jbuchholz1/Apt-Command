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
Browser (React SPA)
        │
        ▼
Railway Service A: Frontend (React, static or served via Express)
        │
        ▼
Railway Service B: API Server (Node.js/Express)
        │
        ▼
Bullhorn MCP Server (already running on Railway)
URL: https://your-mcp-server.up.railway.app/mcp
        │
        ▼
Bullhorn REST API (rest42.bullhornstaffing.com)
```

> **Why a separate API server?** The Bullhorn MCP URL requires auth credentials that must never be exposed to the browser. The Node.js API server keeps all MCP calls server-side.

---

## Bullhorn MCP Server

- **URL:** `https://your-mcp-server.up.railway.app/mcp`
- **Protocol:** MCP (Model Context Protocol) over SSE or HTTP
- **Auth:** Check `.env` for `BULLHORN_MCP_API_KEY` or existing Railway env vars

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `search_jobs` | Search JobOrders by status, owner, keyword |
| `query_entity` | Raw WHERE-clause query on any Bullhorn entity |
| `get_submissions` | Get candidate submissions for a job order ID |
| `get_candidate` | Look up a candidate by name or ID |
| `search_candidates` | Search candidates by skill, status, keyword |
| `get_entity_fields` | Get metadata/schema for any entity type |

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

## Project File Structure (Recommended)

```
digital-req-board/
├── CLAUDE.md                  ← This file
├── README.md
├── .env.example
├── .gitignore
│
├── server/                    ← Railway Service 1: API
│   ├── CLAUDE.md              ← Server-specific instructions
│   ├── package.json
│   ├── index.js               ← Express server
│   ├── routes/
│   │   ├── jobs.js
│   │   ├── placements.js
│   │   └── stats.js
│   └── lib/
│       └── bullhorn.js        ← MCP client wrapper
│
└── client/                    ← Railway Service 2: React app
    ├── CLAUDE.md              ← Client-specific instructions
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── ReqBoard.jsx   ← Main table
        │   ├── StatsStrip.jsx
        │   ├── FilterBar.jsx
        │   ├── JobDetail.jsx  ← Slide-out panel
        │   └── StatusBadge.jsx
        └── lib/
            └── api.js         ← Fetch wrapper for API server
```

---

## Environment Variables

### Server `.env`
```
PORT=3001
BULLHORN_MCP_URL=https://your-mcp-server.up.railway.app/mcp
BULLHORN_MCP_API_KEY=           # from Railway env vars on existing MCP service
NODE_ENV=production
```

### Client `.env`
```
VITE_API_BASE_URL=https://your-api-server.railway.app
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

## Key Technical Notes

1. **MCP calls are server-side only** — never call the MCP URL from the browser
2. **CORS** — API server must allow requests from the frontend Railway domain
3. **Timestamps** — Always use `new Date(ms)` for Bullhorn timestamp fields
4. **Pagination** — Default `count` is 20; set to 100+ for req board; handle pagination if needed
5. **TO_ONE fields** — Must be in the `fields` param as nested e.g. `owner,clientCorporation` — Bullhorn returns the nested object automatically
6. **isDeleted filter** — Always add `AND isDeleted = false` to queries
7. **FALLOFF_STATUSES** — `['Archive', 'Placed', 'Lost', 'Wash', 'Filled']` (`server/routes/jobs.js`). Reqs in these statuses disappear from both Req Boards 12h after the status change. Called Shot jobs bypass this rule entirely. `'Filled'` was added in v3.30.0 alongside the India Req Board so filled reqs don't linger forever.
8. **India Req Board** — A second tab that reuses `ReqBoardModule` with props (`title="India Req Board"`, `apiFilter={{ apt_india: true }}`, `permissionKey="india_req_board"`). Backed by the same `/api/req-board/jobs` and `/api/req-board/stats` endpoints, which accept `?apt_india=true` to filter to jobs whose `apt_india` Supabase override is true. The flag is set via a checkbox column at position 0 on the regular Req Board. Gated by the `india_req_board` module permission — granted per-user via the admin panel; nobody sees it by default. Edits made on either board hit the same Bullhorn record and the same `job_overrides` Supabase row.

---

## Build Order

**Phase 1 — API Server**
- [ ] Init Node.js/Express project in `server/`
- [ ] Build `bullhorn.js` MCP client that calls the Railway MCP server
- [ ] Implement `/api/jobs` endpoint with correct fields and WHERE clause
- [ ] Implement `/api/placements` for active contractors
- [ ] Implement `/api/stats` for header counts
- [ ] Test all endpoints locally

**Phase 2 — Frontend**
- [ ] Init Vite + React project in `client/`
- [ ] Build `StatsStrip` component
- [ ] Build `FilterBar` with Status, Type, Owner, Remote filters
- [ ] Build `ReqBoard` main table with sorting
- [ ] Build `StatusBadge` with color mapping
- [ ] Build `JobDetail` slide-out panel with submissions
- [ ] Wire up auto-refresh (5-minute interval)

**Phase 3 — Deploy**
- [ ] Push to GitHub
- [ ] Create Railway project with two services
- [ ] Set env vars per service
- [ ] Confirm live URL loads and data flows end-to-end

---

## Questions to Resolve Early

1. **MCP auth method** — Does the existing Bullhorn MCP server use bearer token, API key header, or something else? Check the Railway env vars on your MCP server to confirm.
2. **Office/branch field** — Confirm if jobs are tagged by office (Birmingham/Dallas/Nashville) via `branchCode` or another field — may want to add office filter.
3. **"Called shots"** — This was a concept from the old req board (a manually-flagged high-priority req). Discuss whether to replicate via `type` (Priority A/B/C) or a custom field.

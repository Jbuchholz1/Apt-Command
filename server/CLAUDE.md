# Server — API Server (Node.js/Express)

This is the backend that proxies the Bullhorn MCP server and serves clean JSON to the React frontend. Deployed as the `api-server` Railway service.

---

## Endpoints

All endpoints require `Authorization: Bearer <JWT>` unless marked `(public)`. Auth supports two providers: Microsoft Entra SSO (`RS256` verified against JWKS) and external email/password JWT (`HS256`). See `middleware/auth.js`.

### Req Board — reads
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/req-board/jobs` | Open + recently-closed jobs + Supabase overrides. `?apt_india=true` filters to India-flagged jobs. |
| GET | `/api/req-board/jobs/all` | All jobs including closed (no time window). |
| GET | `/api/req-board/jobs/:id` | Single job + submissions + notes. |
| GET | `/api/req-board/jobs/users` | CorporateUser dropdown list. `?role=` filter. |
| GET | `/api/req-board/jobs/events` | **SSE** stream of override/note events. Heartbeat 25s. |
| GET | `/api/req-board/jobs/offer-out-candidates` | Flat list across Offer Extended subs + Pending/Submitted placements. |
| GET | `/api/req-board/jobs/export` | Excel workbook (Req Board / Org Flow / Pipeline tabs). Admin-gated. |

### Req Board — writes
| Method | Path | Writes to |
|--------|------|-----------|
| POST | `/api/req-board/jobs/:id/bullhorn-update` | **Bullhorn** (whitelisted fields only — status, owner, employmentType, customText1, dates, assignedUsers, rates, type/priority, headcount counters, isOpen). |
| PATCH | `/api/req-board/jobs/:id/overrides` | **Supabase only**. Requires `If-Match` header; returns 409 `OVERRIDE_CONFLICT` on version mismatch. Fields: recruiter, notes, follow_up, deadline, coverage_needed, tr_reassigned, tr_assigned_at, called_shot_count, forty_eight_hr, apt_india. |
| POST | `/api/req-board/jobs/:id/notes` | Supabase (`job_notes`); fire-and-forget Bullhorn note push. |

### Submissions / Placements / Pipeline
| Method | Path | Writes to |
|--------|------|-----------|
| POST | `/api/req-board/jobs/submissions/:id/update` | Bullhorn JobSubmission (status, rates). |
| PATCH | `/api/req-board/jobs/submissions/:id/overrides` | Supabase (interview-box `rejected` flag). |
| POST | `/api/req-board/jobs/placements/:id/update` | Bullhorn Placement (rates, fee, dateBegin/dateEnd). |
| GET | `/api/req-board/placements` | Active placements. `?apt_india=true` supported. |
| GET | `/api/req-board/stats` | Aggregated counts. `?apt_india=true` filters jobs + placements; opportunities stay firm-wide. |
| GET | `/api/req-board/jobs/opportunities` | Open opportunities + overrides. |
| POST | `/api/req-board/jobs/opportunities/:id/update` | Bullhorn Opportunity (status, expectedClose, nextActivity). |
| PATCH | `/api/req-board/jobs/opportunities/:id/overrides` | Supabase (note). |
| GET | `/api/req-board/jobs/client-contacts?corpId=N` | ClientContact list for Convert-to-Job modal. |
| POST | `/api/req-board/jobs/opportunities/:id/convert` | Creates Bullhorn JobOrder + marks opportunity Closed-Won. |

### Auth
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/external/login` | Email/password → 8h JWT. **Rate-limited 5/15min per IP; 10 fails = 30min account lockout.** |
| POST | `/api/auth/external/change-password` | Invalidates prior tokens via `pwUpdatedAt` claim check. |

### Admin
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/users` | List user_profiles. |
| PATCH | `/api/admin/users/:id/role` | Change role. Prevents self-demotion. |
| PUT | `/api/admin/announcement` | Upsert site-wide announcement. |

### Health (public — no auth)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Railway healthcheck. |
| POST | `/api/csp-report` | CSP violation reports — browsers can't send auth headers. No-op 204. |

> **Legacy aliases.** `/api/jobs`, `/api/jobs/all`, `/api/jobs/:id`, `/api/placements`, `/api/stats` still resolve — same handlers as the canonical `/api/req-board/*` paths. Prefer canonical paths in new code.

---

## File map

### Entry + middleware
| File | Purpose |
|------|---------|
| `index.js` | Express entry — route registration, CORS, 3-layer rate limiting, error handler that converts MCP `READ_ONLY_MODE` errors to 403. |
| `middleware/auth.js` | Entra JWT (JWKS, RS256) + external JWT (HS256) verification. Sets `req.user`. |
| `middleware/adminAuth.js` | Admin-only gate. |

### lib/
| File | Purpose |
|------|---------|
| `bullhorn.js` | Single `callTool()` gateway to the MCP server. Bearer auth, 30s timeout, READ_ONLY_MODE block on mutating tools. |
| `db.js` | Supabase client wrapper. Tables: `job_overrides`, `submission_overrides`, `opportunity_overrides`, `job_notes`, `reconciliation_queue`, `user_profiles`, `announcements`. Optimistic locking via `version` column. |
| `cache.js` | In-memory cache for hot Bullhorn queries. |
| `mcpBreaker.js` | Circuit breaker on MCP failures — short-circuits after repeated errors. |
| `realtimeBroadcast.js` | One shared Supabase Realtime subscription fanned out to all SSE clients. |
| `exporters.js` | Excel workbook builder (used by `/jobs/export` and the nightly cron). |
| `excelSafe.js` | Excel-safe value coercion. |
| `imageUpload.js` | Image upload handling (client logos, support screenshots). |
| `modules.js` | Module permissions — 14 modules, `requireModule(name, 'basic'\|'admin')` middleware. Checks `user_module_permissions` table. |
| `roles.js` | Role definitions (admin/editor/viewer/guest). |
| `recruiterConfig.js` / `salesConfig.js` | Per-team config + leader exclusion lists for dashboards. |
| `period.js` | Date-period helpers (weekly/monthly/quarterly). |
| `passwords.js` | bcrypt hashing for external users. |
| `orgflowSync.js` | Bullhorn → Org Flow sync (every 30 min, gated by `ENABLE_SYNC_CRON`). |
| `scheduledExport.js` | Nightly 23:00 CT SharePoint export (gated by `ENABLE_EXPORT_CRON`). |
| `sharepoint.js` | Microsoft Graph client for SharePoint uploads. |

### routes/ (16 files)
| File | Mounts |
|------|--------|
| `jobs.js` | `/api/req-board/jobs/*` + legacy `/api/jobs/*` |
| `placements.js` | `/api/req-board/placements` + legacy `/api/placements` |
| `stats.js` | `/api/req-board/stats` + legacy `/api/stats` |
| `auth.js` | `/api/auth/external/*` |
| `admin.js` | `/api/admin/*` |
| `users.js` | `/api/users/*` |
| `search.js` | `/api/search/*` (universal search) |
| `reporting.js` | `/api/reporting/*` (dashboards) |
| `dashboard.js` | `/api/dashboard/*` |
| `performance.js` | `/api/performance/*` (individual "My Dashboard") |
| `clientHealth.js` | `/api/client-health/*` |
| `orgflow.js` | `/api/orgflow/*` |
| `operations.js` | `/api/operations/*` |
| `goals.js` | `/api/goals/*` |
| `projectManagement.js` | `/api/project-management/*` |
| `support.js` | `/api/support/*` |

### migrations/
Numbered SQL files for Supabase schema changes. Apply by pasting into the Supabase SQL Editor (no programmatic runner). Write idempotent SQL where possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

---

## Server rules

1. **MCP server-side only** — never expose the MCP URL or `BULLHORN_MCP_API_KEY` to the browser.
2. **Bearer auth only, no cookies** — every authenticated request carries `Authorization: Bearer <JWT>`. The server never sets a session cookie and the client never uses `credentials: 'include'`. CSRF is non-applicable as a result. **Do not introduce cookie sessions** without also adding CSRF protection — the switch silently turns CSRF from "not applicable" to "exposed".
3. **CORS** — driven by `FRONTEND_URL` env. Update both Railway services together if either URL changes.
4. **Pagination / data completeness — READ THIS before any list query.** Two hard caps silently truncate "fetch all" reads, and partial data here is a serious correctness bug:
   - **Bullhorn MCP caps responses at ~200 rows** even when a larger `count` is requested, and does not reliably honor `start`. NEVER write a bare `callTool('query_entity', { ..., count: N })` that is meant to return *all* matches. Route it through **`paginateQuery(label, baseArgs)`** in `lib/bullhorn.js` (id-cursor pagination). The only bare-`count` exceptions allowed: `count: 1` single-record lookups, and intentional top-N search (`search_jobs`/`search_candidates` for Cmd+K). If you add a new "get all X" wrapper, it MUST use `paginateQuery`.
   - **Supabase/PostgREST caps a `.select()` at 1000 rows** by default. Any list-returning select that can grow past 1000 (anything firm-wide, or `.in(manyIds)`) MUST go through **`selectAllRows(label, buildQuery, opts)`** in `lib/db.js` — and `buildQuery` MUST apply a stable, UNIQUE `.order()` (the table's `id` as the final tiebreaker) or range pages can overlap/miss rows. A `.select().single()/.maybeSingle()` (one row) or a select bounded to one parent's small child set (e.g. one job's notes, one ticket's comments) is fine as-is. For cached getters pass `{ throwOnError: true }` so a transient DB error doesn't pin an empty result for the TTL.
   - Rule of thumb: if the answer to "could this ever match >200 (Bullhorn) / >1000 (Supabase) rows?" is anything but a confident no, paginate it.
5. **TO_ONE fields** — request them by name in `fields` (e.g. `owner,clientCorporation`); Bullhorn returns the nested object automatically.
6. **isDeleted filter** — add `AND isDeleted = false` to JobOrder / JobSubmission / Note / Candidate queries. **EXCEPTION: Placement has no `isDeleted` field** — including it returns HTTP 400 and zero results.
7. **Overrides persistence** — all local field edits, notes, placement checklist, goal tracking live in Supabase (`lib/db.js`). Nothing is stored on local disk, so Railway redeploys do not lose data.
8. **READ_ONLY_MODE chokepoint** — sandbox blocks `update_entity`, `add_note`, `create_entity` at `lib/bullhorn.js`. Route handler surfaces as `403 READ_ONLY_MODE`. Local Supabase writes are unaffected.
9. **Mutations write to Bullhorn or Supabase, never both implicitly** — `bullhorn-update` route → Bullhorn; `overrides` route → Supabase. **One exception:** status changes to a falloff status (`Archive / Placed / Lost / Wash / Filled`) trigger a Bullhorn write *and* a Supabase `status_changed_at` upsert so the 12h fade can be measured locally.
10. **Rate limiting** (`index.js`) is 3-layer:
    - IP flood limiter — 1000 req/min per IP, **before** auth
    - Per-user limiter — 200 req/min, keyed by Entra `oid` or IP, **after** auth
    - Write limiter — 30 mutations/min per user
    If a sync script or test gets throttled, this is why.

---

## Common task recipes

### Add a new local-only override field (e.g. `next_step`)
1. Add column to `job_overrides` in Supabase via a new file in `migrations/`. Bump the version-bump trigger if you have one.
2. Whitelist the field name in the `PATCH /api/req-board/jobs/:id/overrides` handler (`routes/jobs.js`).
3. Expose the field in the `/api/req-board/jobs` response — the job formatter merges overrides onto the Bullhorn record; add it to the merge.
4. Wire optimistic update through `client/src/lib/api.js`, then a new column or input in `ReqBoard.jsx`.
5. No Bullhorn changes — this is local-only.

### Add a new Bullhorn write-back field
1. Whitelist the field name in `POST /api/req-board/jobs/:id/bullhorn-update` (`routes/jobs.js`).
2. If the field needs coercion (numeric, date, int-string), add to the coercion block in that route.
3. Confirm `lib/bullhorn.js` `updateJobField()` doesn't need a custom mapping for the field name (most just pass through).
4. Verify sandbox correctly blocks it: set `READ_ONLY_MODE=true` locally, hit the endpoint, confirm 403 `READ_ONLY_MODE` surfaces.

### Add a new route file
1. Create `routes/<name>.js` exporting an Express Router.
2. Register in `index.js` after auth middleware: `app.use('/api/<name>', requireModule('<module>'), require('./routes/<name>'));`
3. If it needs a new module permission, add to `lib/modules.js` and grant via the admin panel.
4. Follow existing pattern: validate inputs, call `lib/bullhorn.js` or `lib/db.js`, never both for the same write.

### Add a new Supabase migration
1. New numbered SQL file in `migrations/` — e.g. `0042_add_next_step.sql`.
2. Write idempotent SQL: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, `CREATE INDEX IF NOT EXISTS ...`.
3. Apply to prod Supabase via the SQL Editor first, then sandbox (or vice versa per the deploy direction).
4. Note: sandbox can be reprovisioned anytime via `scripts/export-prod-schema.sql` — re-run if drift gets confusing.

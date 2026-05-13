# Server — API Server (Node.js/Express)

This is the backend API server that proxies requests to the Bullhorn MCP server and serves clean JSON to the React frontend. Deployed as its own Railway service.

---

## API Server Endpoints

```
GET /api/jobs          — All open job orders (isOpen=true)
GET /api/jobs/all      — All jobs including closed (for history)
GET /api/jobs/:id      — Single job detail + submissions
GET /api/placements    — Active placements (active contractors)
GET /api/stats         — Summary counts for stats strip
GET /api/health        — Health check for Railway
```

### Optional query params

- **`/api/req-board/jobs?apt_india=true`** and **`/api/req-board/stats?apt_india=true`** — filter the response to jobs whose `apt_india` override is true. Used by the India Req Board tab. Without the param the endpoints behave exactly as before (firm-wide).

---

## Server File Map

| File | Purpose |
|------|---------|
| `index.js` | Express entry point — registers all routes, CORS, middleware |
| `lib/bullhorn.js` | MCP client wrapper — all calls to the Bullhorn MCP server go through here |
| `lib/db.js` | Supabase client wrapper for local overrides, notes, and other app-owned tables (field edits that live outside Bullhorn) |
| `lib/roles.js` | Role definitions and permission checks (admin, recruiter, sales, etc.) |
| `lib/recruiterConfig.js` | Recruiter-specific configuration and user lists |
| `lib/salesConfig.js` | Sales-specific configuration and user lists |
| `middleware/auth.js` | Authentication middleware for protected routes |
| `middleware/adminAuth.js` | Admin-only authentication middleware |

### Routes

| Route File | Serves |
|------------|--------|
| `routes/jobs.js` | `/api/jobs`, `/api/jobs/all`, `/api/jobs/:id` |
| `routes/placements.js` | `/api/placements` |
| `routes/stats.js` | `/api/stats` |
| `routes/admin.js` | `/api/admin/*` — admin panel operations |
| `routes/users.js` | `/api/users/*` — user management |
| `routes/performance.js` | `/api/performance/*` — individual performance data |
| `routes/reporting.js` | `/api/reporting/*` — recruiter and sales dashboard data |
| `routes/clientHealth.js` | `/api/client-health/*` — client health metrics |
| `routes/orgflow.js` | `/api/orgflow/*` — org chart / workflow data |

---

## Server-Specific Rules

1. **MCP calls are server-side only** — never expose the MCP URL or credentials to the browser
2. **CORS** — must allow requests from the frontend Railway domain
3. **Pagination** — Bullhorn default `count` is 20; set to 100+ for req board; handle pagination if needed
4. **TO_ONE fields** — must be in the `fields` param as nested e.g. `owner,clientCorporation` — Bullhorn returns the nested object automatically
5. **isDeleted filter** — always add `AND isDeleted = false` to queries
6. **Overrides persistence** — all local field edits, notes, placement checklist, goal tracking, etc. live in Supabase (see `lib/db.js`). Nothing is stored on local disk, so Railway redeploys do not lose data.
7. **Bearer-header auth only — no session cookies.** Every authenticated request carries `Authorization: Bearer <Microsoft Entra JWT>`; the server never sets a session cookie and the client never uses `credentials: 'include'`. CSRF is a non-concern as a result — browsers don't auto-attach a Bearer header to cross-origin requests, and the CORS allowlist in `index.js` is the second layer. **Do not introduce cookie-based sessions or `credentials: 'include'`** without adding CSRF protection (synchronizer tokens or SameSite=Strict + origin checks), since the switch silently turns CSRF from "not applicable" to "exposed".

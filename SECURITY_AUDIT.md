# Security Audit — APT Digital Req Board

**Audit cycles:**
- **Cycle 2 — re-audit:** 2026-05-22 (this section, top of doc)
- **Cycle 1 — initial audit:** 2026-04-29 (preserved below as historical record)

ID convention: `DRB-SEC-NNN` numbers are continuous across cycles. Cycle 1 covered 001–011; Cycle 2 adds 012–020. To see the status of a cycle-1 item, check the "Cycle 1 status snapshot" table below.

---

# Cycle 2 — re-audit (2026-05-22)

**Auditor:** Claude (Opus 4.7)
**Scope:** Re-verification of cycle 1 findings + new audit of code added since (Org Flow client management, external user accounts, expanded support module, project management, SharePoint nightly export, optimistic locking on overrides).
**Mode:** Read-only audit. No code changes — findings only. (Action list at the bottom.)

## Cycle 2 executive summary

**Overall risk: LOW.** The April audit cycle delivered. Most cycle-1 mediums are closed; cycle-2 finds the codebase materially harder to attack than the April snapshot. **One genuinely exploitable issue** showed up in the Org Flow code shipped since April — DRB-SEC-012, an IDOR + PostgREST filter-injection in a single route.

| Severity | Cycle 2 count | Headline |
|---|---|---|
| Critical | 0 | — |
| **High** | **1** | Org Flow `userId` IDOR + PostgREST filter injection (DRB-SEC-012) |
| Medium | 2 | `BULLHORN_MCP_URL` still in git history (DRB-SEC-013); CSP not reaching the SPA (DRB-SEC-021) |
| Low | 4 | CORS `credentials: true` vestige; userEmail in `.or()`; no admin audit log; no per-entity write rate limit |
| Informational | 3 | No error tracking; passwordMustChange not server-enforced; `scripts/export-prod-data.sql` untracked |

**Act this week:**
1. **DRB-SEC-012** — Fix Org Flow `userId` IDOR + add UUID validator
2. **DRB-SEC-001** (carryover from cycle 1) — Flip `CSP_MODE` from `report-only` to `enforce` after verifying clean report logs
3. **DRB-SEC-005** (carryover from cycle 1) — Upgrade `exceljs` to clear the `uuid` CVE

## Cycle 1 status snapshot

| ID | Title | Cycle 2 status | Notes |
|---|---|---|---|
| DRB-SEC-001 | CSP disabled | ⚠️ INCORRECT FIX | `CSP_MODE=enforce` env var set on both production and sandbox api-server (2026-05-22). However, see new finding **DRB-SEC-021** below — the api-server CSP doesn't reach the browser because the SPA is served by a separate `frontend` Railway service with no CSP header. The env-var flip is correctly configured for when CSP is relocated; today it has no browser-side effect. |
| DRB-SEC-002 | File-upload mimetype-only | ✅ FIXED | Magic-byte verification + SVG denylist via `server/lib/imageUpload.js`. |
| DRB-SEC-003 | Full datasets to all users | 🔴 OPEN | Per-route role-scoping not started. Same as April. |
| DRB-SEC-004 | Hardcoded admin bootstrap | ✅ FIXED | `BOOTSTRAP_ADMIN_EMAILS` env var. |
| DRB-SEC-005 | `uuid <14.0.0` CVE via exceljs | ✅ FIXED | `package.json` overrides force `uuid ^14.0.0` (server + client). Fixed in v3.29.19 alongside a broader dep sweep that also cleared 5 high-sev `tar` CVEs (via `bcrypt` 5.1.1 → 6.0.0) and a `ws` memory-disclosure CVE (via `@supabase/supabase-js` 2.103.0 → 2.106.1). `npm audit`: 0 vulns. |
| DRB-SEC-006 | Lucene partial escape on email | ✅ FIXED | Strict regex validator at `server/lib/bullhorn.js:802-820`. |
| DRB-SEC-007 | PII in MCP debug logs | 🔴 OPEN | Appointment payloads still logged in full at `server/lib/bullhorn.js` (lines ~626, 634, 648, 669, 692, 705). |
| DRB-SEC-008 | No CSRF token (mitigated) | ✅ FIXED | Documented as Rule 2/7 in `server/CLAUDE.md`. |
| DRB-SEC-009 | Graph token client-supplied | ℹ️ INFO | Unchanged; design choice still appropriate. |
| DRB-SEC-010 | No branch protection / CI gates | ℹ️ INFO | Unchanged. |
| DRB-SEC-011 | Stale memory note | ✅ FIXED | One-shot fix from April session. |

Net: 5 fixed, 3 still open (DRB-SEC-001 partial, -003, -005, -007), 3 informational unchanged.

## Cycle 2 methodology

1. **Three parallel `Explore` agents** investigated three domains concurrently:
   - Authentication, authorization, session handling, RBAC, IDOR.
   - Injection (MCP WHERE, Supabase filters, XSS, formula, SSRF, mass assignment, CSRF, file upload, path traversal, prompt injection, open redirect).
   - Secrets, data exposure, infra, logging, CSP/security headers, dependencies, git history.
2. **Manual verification** of every High/Medium finding against actual file contents and git history. Several agent claims did not survive verification — listed under "Discarded false positives" below.
3. **Cross-referenced** with the cycle 1 audit doc and the auto-memory project notes.

## Cycle 2 findings — new

### HIGH

#### DRB-SEC-012 — Org Flow `userId` IDOR + PostgREST filter injection

- **Where:** [server/routes/orgflow.js:54-63](server/routes/orgflow.js#L54), [server/lib/db.js:713-739](server/lib/db.js#L713) (especially line 730).
- **What:** `GET /api/org-flow/clients?view=my&userId=<arbitrary>` accepts `userId` from the query string with **no validation and no check that the value belongs to `req.user`**. It is then string-interpolated directly into a PostgREST `.or()` filter:

  ```js
  // db.js:730
  query = query.or(`created_by.eq.${userId},id.in.(${assignedClientIds.join(',')})`);
  ```

- **Two distinct issues in one route:**
  1. **IDOR (horizontal privilege escalation).** Any authenticated user with `org_flow` module access can supply *another user's* `userId` and view the clients owned/assigned to that user. The route gating is module-level only; it never verifies that the requested userId matches the caller.
  2. **PostgREST filter injection.** Because `userId` is not validated as a UUID, an attacker can inject filter syntax. A crafted `userId` like `00000000-0000-0000-0000-000000000000,id.gt.0` (URL-encoded) extends the `or` list, returning every client row.
- **Why exploitable:** the `org_flow` module is granted broadly — it's the client-management surface. Any user with read access to their own clients gains the ability to enumerate every client in the database via this route, including assignment metadata. Defense layers that do **not** save you: the module gate is satisfied (attacker is a legitimate user), Supabase RLS is irrelevant because the server uses the `service_role` key, and rate limiting does not stop a single curated request.
- **Fix sketch:**
  1. **IDOR:** ignore `req.query.userId`. Resolve the caller's profile ID server-side from `req.user.email` (same lookup pattern as [`server/routes/orgflow.js:42-47`](server/routes/orgflow.js#L42) — `GET /users/me`).
  2. **Injection defense (belt-and-suspenders):** add a UUID validator at the route boundary: `if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return 400`.
- **Severity rationale:** HIGH, not Critical, because it requires an authenticated user. But this is the kind of bug a curious user finds by editing a URL.

### MEDIUM

#### DRB-SEC-013 — `BULLHORN_MCP_URL` is still in git history

- **Where:** Commit `0543d3c` (initial commit) included a hardcoded fallback `const MCP_URL = process.env.BULLHORN_MCP_URL || 'https://bullhorn-mcp-production.up.railway.app/mcp';` in [server/lib/bullhorn.js](server/lib/bullhorn.js). Commit `0c4e0dd` ("Security hardening: MCP auth, prod guard, CORS, clean secrets") removed the fallback. **The URL remains visible in git history.**
- **Why it matters:** anyone with read access to the repo (current or former collaborators) can recover the production MCP URL via `git log -S`. MCP now requires bearer auth (`BULLHORN_MCP_API_KEY`), so the URL alone is insufficient — but if that bearer ever leaks via logs, env-file copy, or a compromised workstation, the URL is the keyhole.
- **Note on cycle 1 doc:** the April audit reported `git log --all --full-history -S 'BULLHORN_MCP_URL' returns nothing` (DRB-SEC-011, line 313). Re-verification shows the search **does** return commits — `git log --all -S 'BULLHORN_MCP_URL' --oneline` returns `b645fec`, `0c4e0dd`, `0543d3c`. The April claim was wrong, or the search syntax used then was different. Either way, the URL is in history today.
- **Fix sketch (decide before implementing):**
  - **Option A — clean history.** Use `git filter-repo` to remove the URL string. Force-push. Cost: all collaborators must re-clone; open PRs need rebasing; commit hashes shift.
  - **Option B — rotate the MCP URL.** Redeploy the MCP server to a new Railway service name so the leaked URL no longer resolves. Update `BULLHORN_MCP_URL` env on the api-server. Cost: one MCP redeploy, brief downtime. Pair with rotating `BULLHORN_MCP_API_KEY`.
  - **Option C — accept and document.** Bearer auth + circuit breaker + 30s timeout already mean an attacker with the URL but no key can only DoS the MCP, and the breaker would trip.
  - **Recommendation: B.** Cheapest, decisive, and rotates the key as a side benefit.

#### DRB-SEC-021 — CSP header is set on api-server but doesn't reach the SPA

- **Where:** [server/index.js:78-84](server/index.js#L78) (CSP is applied via `helmet` here); the `frontend` Railway service serving the Vite SPA sends no CSP header.
- **What:** The cycle-1 audit added a `CSP_MODE` env var on the api-server that controls a `helmet` CSP middleware. Browsers, however, only honor CSP from the headers (or `<meta>`) of the **document** they are rendering. The SPA's HTML document is served by the separate `frontend` Railway service (`serve` package, no Express layer, no helmet). Verified on 2026-05-22: `curl -I https://front-end-services-sandbox.up.railway.app/` returns no `Content-Security-Policy` or `Content-Security-Policy-Report-Only` header.
- **Why it matters:** the CSP work shipped in cycle 1 — and the `CSP_MODE=enforce` env-var change on 2026-05-22 — has **zero browser-side effect**. The directives are correctly scoped (`script-src 'self'`, `frame-ancestors 'none'`, no `unsafe-eval`, no `unsafe-inline` in scripts, `report-uri /api/csp-report`), but none of them reach the browser. If an XSS regression slipped into the SPA, CSP would not catch it because there is no CSP active on the document.
- **Note on cycle-1 status:** cycle 1 marked DRB-SEC-001 as "infrastructure shipped, awaiting `enforce` flip." Both halves of that read as positive, which masked the real issue — the infrastructure was placed on the wrong service. This audit corrects that.
- **Fix sketch (two reasonable paths):**
  - **Option A — `client/serve.json` (recommended).** The `serve` package reads a `serve.json` with a `headers` array per path. Copy the directives from `server/index.js:59-76` into a `serve.json` block that sends `Content-Security-Policy` (or `Content-Security-Policy-Report-Only` to start) on every response. One file, ships with the next frontend deploy. The `/api/csp-report` endpoint already exists — reports route to it cleanly.
  - **Option B — `<meta http-equiv="Content-Security-Policy">` in `client/index.html`.** Works for most directives but **cannot set `frame-ancestors` or `report-uri`** — browsers ignore those when set via meta. Reports wouldn't flow to the existing endpoint.
- **Severity rationale:** Medium. There is no live XSS today (the SPA's `dangerouslySetInnerHTML` site is properly escaped), but the supposed defense-in-depth doesn't exist. The fix is small (a single config file) and the impact of XSS containment for a future regression is high.

### LOW

#### DRB-SEC-014 — CORS `credentials: true` is vestigial but still set

- **Where:** [server/index.js:153](server/index.js#L153).
- **What:** The CORS config sets `credentials: true` even though the app uses bearer-only auth. The inline comment correctly notes this is vestigial.
- **Why it matters today:** nothing — no cookies are sent. But it primes the system for a footgun if cookies are ever added later without also adding CSRF protection.
- **Fix sketch:** set `credentials: false` and update the comment. Cross-reference with Rule 2 in [server/CLAUDE.md](server/CLAUDE.md). One-liner; safe.

#### DRB-SEC-015 — `userEmail` interpolated into Supabase `.or()` filter

- **Where:** [server/lib/db.js:1384](server/lib/db.js#L1384) in `getUnreadCounts(userEmail)`:

  ```js
  .or(`submitted_by.eq.${userEmail},assigned_to.eq.${userEmail}`);
  ```

- **What:** Same pattern as DRB-SEC-012, but `userEmail` comes from the JWT (`req.user.email`), which is verified server-side. So it's only attacker-controlled if the IdP is compromised.
- **Why it still matters:** if a future change makes `userEmail` flow from request input, this becomes injectable. Even today, an email with PostgREST-special characters (parens, commas) could produce malformed filters.
- **Fix sketch:** validate email against a strict regex before interpolation, or pre-resolve to the user's profile ID and use `.in('submitted_by', [id])`.

#### DRB-SEC-016 — No audit log for admin role / permission changes

- **Where:** [server/routes/admin.js:34-73](server/routes/admin.js#L34) (`PATCH /api/admin/users/:id/role`) and other admin mutations.
- **What:** Role changes write into the `user_profiles` row directly. No immutable audit trail of `who changed whom, when, from what role to what role`.
- **Why it matters:** a rogue admin could promote themselves, do damage, then demote back. Without a separate append-only audit table, forensic reconstruction is impossible.
- **Fix sketch:** new Supabase migration creating `admin_audit_log` (`actor_email`, `target_email`, `event`, `old_value`, `new_value`, `created_at`). Insert rows from `routes/admin.js` and `lib/roles.js` on role and permission changes. Never UPDATE or DELETE rows in this table.

#### DRB-SEC-017 — No per-entity write rate limit

- **Where:** [server/index.js:124-131](server/index.js#L124) — global per-user write limiter is 30/min.
- **What:** A user can spam writes to a single Bullhorn record (status, notes) up to 30/min. Each write hits the Bullhorn API and pollutes Bullhorn audit logs.
- **Why it matters:** internal abuse / noise / Bullhorn-API-cost concern. Not a confidentiality bug.
- **Fix sketch:** per-entity write rate limit — e.g., max 3 writes per `jobId` per minute per user. In-memory map keyed by `user:jobId`, sliding window eviction.

### INFORMATIONAL

#### DRB-SEC-018 — No structured error tracking

- All errors go to `console.error` on Railway with 7-day retention. No alerting, no aggregation, no PII filtering. Recommend Sentry or similar — `Sentry.init()` at the top of `server/index.js`, send error events, filter PII via `beforeSend`.

#### DRB-SEC-019 — `password_must_change` not enforced server-side

- External users with `password_must_change=true` see a modal in the client, but the server still accepts their API calls — the flag is purely advisory. A user who suppresses the modal (devtools, custom client) can keep using the initial password indefinitely.
- Fix sketch (if strict enforcement desired): in `requireAuth()`, refuse requests when `req.user.pwMustChange === true` and `req.path !== '/api/auth/external/change-password'`.

#### DRB-SEC-020 — `scripts/export-prod-data.sql` is untracked

- Untracked at audit time per `git status`. The script is a SQL Editor copy-paste template — no secrets in the file, but it generates a destructive `TRUNCATE … CASCADE` dump in the prod SQL Editor. Verify before committing that the file contains only the template and not any captured output that might include real rows. Either commit cleanly or add to `.gitignore`.

## Cycle 2 findings — false positives

The Explore agents surfaced these claims that did not survive verification. Listed so they don't get raised again:

- **"Supabase credentials committed to git history" (Agent 3, MEDIUM).** Wrong. `git ls-files | grep env` returns only `.env.example`. `git log --all --diff-filter=A --name-only` shows `.env.prod-supabase` and `.env.sandbox-supabase` were never added to git. They exist only on the local workstation (correctly), and `.gitignore` covers them by name.
- **"CSP disabled by default" (Agent 3, MEDIUM).** Wrong. [server/index.js:57](server/index.js#L57) sets default to `report-only`, not off. The real issue is failure to promote to `enforce` — already tracked as DRB-SEC-001 (carryover from cycle 1).
- **"MCP query injection via WHERE clauses."** Verified safe. All IDs flowing into WHERE clauses are parsed with `parseInt()`/`Number()` first; status values come from hardcoded constants.
- **"XSS in UniversalSearch dangerouslySetInnerHTML."** Verified safe. The helper HTML-escapes input first, then re-permits only `<em>` / `<mark>` tags.
- **"`exec_sql` calls user-controlled strings."** Verified safe. [db.js:45-47](server/lib/db.js#L45) documents that `exec_sql` is used only with string literals.
- **"`credentials: 'include'` introduces CSRF."** Verified safe. Bearer-only is enforced; client never uses `credentials: 'include'`; no `Set-Cookie` headers are sent. (DRB-SEC-014 covers the leftover server-side setting.)

## Cycle 2 — Verified-safe additions

Strengths confirmed during cycle 2 that were not on cycle 1's list (or are worth re-confirming since the cycle-2 code has grown):

| Control | Where | Notes |
|---|---|---|
| External JWT verification | [server/middleware/auth.js:53-95](server/middleware/auth.js#L53) | HS256 with issuer + audience checks; `pwUpdatedAt` claim invalidates tokens after password reset. |
| Token dispatch by `iss` claim | [server/middleware/auth.js:157-161](server/middleware/auth.js#L157) | Azure and external verifiers can't be cross-fed. |
| Module-level RBAC | [server/middleware/adminAuth.js:40-58](server/middleware/adminAuth.js#L40) | `requireModule(moduleKey, level)` enforced server-side; replaces ad-hoc admin/manager checks. |
| External login lockout | [server/routes/auth.js](server/routes/auth.js) | 5 attempts/15min/IP; 10 fails → 30-min lockout per account. |
| Supabase RLS posture | [015_revoke_public_role_grants.sql](server/migrations/015_revoke_public_role_grants.sql) | `anon` + `authenticated` revoked from all tables — only `service_role` accesses tables. |
| Optimistic locking on overrides | [server/routes/jobs.js](server/routes/jobs.js) | `If-Match` header; 409 `OVERRIDE_CONFLICT` on race. |
| Mass-assignment defenses | various write routes | Explicit field whitelists on Bullhorn writebacks and override patches. |
| MCP read-only sandbox guard | [server/lib/bullhorn.js:47-52](server/lib/bullhorn.js#L47) | `READ_ONLY_MODE` blocks `update_entity`, `add_note`, `create_entity` at the chokepoint. |

## Cycle 2 — what could NOT be verified

Honest scope limits worth flagging:

- **MCP server itself.** This audit looked at how the api-server *calls* the MCP. Whether the MCP service *enforces* bearer auth (rejects requests without `Authorization`) is a property of the MCP server's own code outside this repo. Test directly: `curl -i https://<MCP_URL>/mcp` with no auth header — expect 401.
- **Supabase Storage bucket permissions.** Logo and screenshot buckets — public-read or signed-URL-only is a Supabase dashboard setting, not in code.
- **Railway env var leakage.** Service env vars are only as secure as Railway's RBAC and the team's session hygiene.
- **GitHub repo visibility.** Findings have higher severity if the repo is public. (Should be private.)

## Cycle 2 — fix breakage risk (1-10)

For each finding, an estimate of "likelihood that fixing it breaks something" — 1 = totally safe, 10 = will probably break stuff.

| ID | Action | Risk | Notes |
|---|---|---|---|
| DRB-SEC-012 | Resolve userId server-side, add UUID validator | **2** | "My Clients" still works; identity comes from trusted source. |
| DRB-SEC-021 (relocate CSP to frontend) | Add `client/serve.json` with directives; start report-only | **3** | The directives are already audited and correct in `server/index.js`. Risk is `serve.json` syntax issues or a directive that the SPA actually needs (e.g. an inline style attribute Vite injects). Reversible by removing the file or starting `report-only`. |
| DRB-SEC-005 (carryover) | Upgrade `exceljs` | **3** | Minor risk of subtle export formatting change. Test by running an export. |
| DRB-SEC-007 (carryover) | Redact appointment-payload logs | **1** | Logs only — no behavior change. |
| DRB-SEC-013 | Rotate MCP URL/key (Option B) | **5** | Brief MCP downtime during cutover. |
| DRB-SEC-013 | History rewrite (Option A) | **8** | All collaborators re-clone; open PRs rebase; commit hashes shift. |
| DRB-SEC-014 | Set `credentials: false` | **1** | No cookies in use. |
| DRB-SEC-015 | Validate or parameterize userEmail | **2** | Only risk: unusual email under stricter format. |
| DRB-SEC-016 | Add `admin_audit_log` table | **2** | Purely additive. |
| DRB-SEC-017 | Per-entity write rate limit | **3** | Risk: legitimate bulk scripts hit the limit — needs sizing. |
| DRB-SEC-018 | Sentry integration | **2** | Mostly additive; risk is sending PII to Sentry — filter via `beforeSend`. |
| DRB-SEC-019 | Server-enforce passwordMustChange | **3** | Make sure change-password flow doesn't make blocked side calls. |
| DRB-SEC-020 | Commit or `.gitignore` the SQL file | **1** | Filesystem decision. |

## Cycle 2 — Prioritized remediation list

| Priority | ID | Effort | Action |
|---|---|---|---|
| P0 (this week) | **DRB-SEC-012** | S | Fix Org Flow `userId` IDOR + add UUID validator |
| P0 (this week) | DRB-SEC-021 | S | Add CSP at the frontend layer (`client/serve.json`) so the policy actually reaches the browser. Start in report-only, observe, then enforce. The api-server `CSP_MODE=enforce` env var is already set on both envs (2026-05-22) and can stay — once relocated, the directives are correct. |
| P0 (this week) | DRB-SEC-005 | S | Upgrade `exceljs` (or `package.json` override pinning `uuid >= 14`) |
| P1 (this month) | DRB-SEC-013 | M | Decide Option A vs B for MCP URL leak; recommend B (rotate URL/key) |
| P1 (this month) | DRB-SEC-007 | XS | Redact appointment payloads from `console.log` calls in `lib/bullhorn.js` |
| P1 (this month) | DRB-SEC-014 | XS | Set `credentials: false` in CORS |
| P1 (this month) | DRB-SEC-015 | XS | Validate or parameterize `userEmail` in `getUnreadCounts` |
| P2 (this quarter) | DRB-SEC-016 | M | Add `admin_audit_log` table + writes |
| P2 (this quarter) | DRB-SEC-017 | M | Per-entity write rate limit |
| P2 (this quarter) | DRB-SEC-003 | M-L | Per-route role-scoping of dataset routes (still open from cycle 1) |
| P2 (this quarter) | DRB-SEC-010 | XS | Enable GitHub branch protection on `main` and `staging` |
| P2 (this quarter) | DRB-SEC-018 | M | Sentry integration |
| P3 (whenever) | DRB-SEC-020 | XS | Clean up `scripts/export-prod-data.sql` (commit or ignore) |
| P3 (whenever) | DRB-SEC-019 | S | Server-side `passwordMustChange` enforcement if strict policy desired |

Effort scale: XS = under 30min, S = 1–2h, M = half day, L = 1+ day.

## Cycle 2 — Verification plan (when fixes land)

**DRB-SEC-012 — Org Flow IDOR:**
1. Log in as user A (Azure SSO).
2. Find user A's Supabase profile ID via `GET /api/org-flow/users/me`.
3. Look up another user B's profile ID (any way — e.g., from `/api/admin/users` if admin during the test).
4. **Before fix:** `GET /api/org-flow/clients?view=my&userId=<B's id>` returns B's clients. **After fix:** the route ignores `userId` from query and returns only A's clients.
5. Repeat with a non-UUID `userId=foo)bar` — before fix produces a Supabase error or unexpected rows; after fix returns 400.

**DRB-SEC-021 — CSP at the frontend:**
1. Confirm the change before flipping enforce: `curl -I https://<frontend-url>/` should show `Content-Security-Policy` (or `Content-Security-Policy-Report-Only`) on the document response. If absent, the `serve.json` wasn't picked up.
2. Open the app, DevTools → Console.
3. Exercise every module (Req Board, Org Flow, Reporting, Pipeline, Admin).
4. Confirm no `Refused to load…` errors. If any appear, fix the directive in `serve.json` (or temporarily switch to `Content-Security-Policy-Report-Only`), redeploy, retry.
5. After 5–7 days of clean `/api/csp-report` logs (use [scripts/csp-report-check.sh](scripts/csp-report-check.sh)), promote to enforce by changing the header name in `serve.json`.

**DRB-SEC-005 — uuid upgrade:**
1. `cd server && npm install exceljs@latest && npm audit --omit=dev --audit-level=moderate`.
2. Trigger an Excel export end-to-end (`/api/req-board/jobs/export`) and confirm the workbook opens cleanly in Excel.

**DRB-SEC-013 — MCP URL/key rotation (Option B):**
1. Deploy MCP to a new Railway service URL.
2. Update `BULLHORN_MCP_URL` and `BULLHORN_MCP_API_KEY` env on the api-server Railway service.
3. Hit a few read endpoints (`/api/req-board/jobs`, `/api/req-board/stats`) and confirm 200s.
4. Disable the old MCP service.

---

# Cycle 1 — initial audit (2026-04-29)

_Preserved verbatim from the original audit for historical reference. For the current status of any cycle-1 finding, see the "Cycle 1 status snapshot" table at the top of cycle 2._

**Repo:** `Claude Digital Req Board` (Railway-deployed Node.js + React SPA)
**Scope:** Application code (server + client), configuration & secrets, dependencies, infrastructure posture, and a project-specific threat model.
**Mode:** Identify-only, except for four zero-impact hardening fixes applied during the session (listed below). No behavioral changes.

---

## Executive summary (cycle 1)

**Overall risk: LOW–MEDIUM.** This is a small-team internal tool behind Microsoft Entra ID, with sound auth, role-gated admin routes, two-layer rate limiting, a CORS allowlist, server-side-only MCP credentials, and Supabase as the persistence layer (no on-disk DB). The codebase shows evidence of prior security work (Helmet middleware, formula-injection sanitization, an XSS-safe HTML-escape helper, optimistic locking on overrides).

The remaining concerns are defense-in-depth gaps and one `npm audit` finding, none with a known exploit path against the current deployment.

| Severity | Count | Headline |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 5 | CSP off, file-upload mimetype-only, full-dataset response, hardcoded admin bootstrap, `uuid` CVE via exceljs |
| Low | 3 | Lucene partial escape, PII in debug logs, no CSRF token (mitigated) |
| Informational | 3 | Client-supplied MS Graph token, no branch protection / CI gates, stale memory note (corrected this session) |

**Top three to act on this quarter:**

1. **DRB-SEC-001 — Re-enable CSP** in helmet, after auditing inline styles. Highest leverage for XSS containment.
2. **DRB-SEC-002 — Tighten file uploads** in `orgflow.js` and `support.js`: explicit SVG rejection + magic-byte check. Cheap, defense-in-depth against a serving-path footgun.
3. **DRB-SEC-005 — Resolve `uuid <14.0.0` advisory** via `exceljs` upgrade or pin. Moderate-severity CVE, currently unexploited but clears the audit board.

**Already fixed during this audit:**

| ID | Fix |
|---|---|
| DRB-SEC-F01 | URL-scheme validation before `window.open` in [UniversalSearch.jsx](client/src/components/UniversalSearch/UniversalSearch.jsx) |
| DRB-SEC-F02 | `encodeURIComponent` on candidate ID in [OrgChart.jsx:32](client/src/modules/org-flow/components/OrgChart.jsx:32) |
| DRB-SEC-F03 | `noopener,noreferrer` on all three `window.open` callsites |
| DRB-SEC-F04 | Stale "MCP unauthed" memory note replaced with verified current state; embedded plaintext API key removed |
| **DRB-SEC-002** | **File-upload tightening — SVG denylist + 9-format magic-byte check applied to [orgflow.js](server/routes/orgflow.js) and [support.js](server/routes/support.js) via new shared utility [imageUpload.js](server/lib/imageUpload.js). All 14 detection cases pass; integration tests confirm SVG and spoofed-mimetype rejection.** |
| **DRB-SEC-004** | **Bootstrap admin list moved to `BOOTSTRAP_ADMIN_EMAILS` env var ([roles.js](server/lib/roles.js)). Hardcoded fallback removed after Railway env confirmed live. Documented in [.env.example](.env.example).** |
| **DRB-SEC-001 (Phase 1+2)** | **CSP infrastructure landed in [index.js](server/index.js): `CSP_MODE` env var with `off`/`report-only`/`enforce` modes; `/api/csp-report` endpoint logs structured violation reports. Default `off` preserves current behavior. Phase 3 (Railway env flip + 5–7 day observation) and Phase 4 (enforce) still pending.** |
| **DRB-SEC-008** | **Bearer-only / no-cookie auth design documented as Rule 7 in [server/CLAUDE.md](server/CLAUDE.md). Future devs are now warned that introducing cookie-based sessions or `credentials: 'include'` requires adding CSRF protection.** |
| **DRB-SEC-006** | **Lucene email escape replaced with strict validate-don't-mangle approach in [bullhorn.js:802-820](server/lib/bullhorn.js:802). Emails not matching `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/` are now dropped entirely instead of having quote chars stripped (which could silently change the addressee).** |

---

## Methodology (cycle 1)

- Three parallel `Explore` agents inventoried server-side code, client-side code, and config/secrets/git history.
- Spot-checked the highest-impact findings by reading the cited files directly.
- Filled Phase B gaps the explorations skipped: [server/lib/orgflowSync.js](server/lib/orgflowSync.js), [server/routes/support.js](server/routes/support.js), [server/routes/performance.js](server/routes/performance.js), [server/routes/goals.js](server/routes/goals.js), [server/routes/search.js](server/routes/search.js).
- Ran `npm audit --omit=dev --audit-level=low` against `server/` and `client/` lockfiles (raw output in Appendix A).
- Cross-checked memory notes: the long-standing "MCP server has no auth" claim is **stale** — MCP is now Bearer-authed at [server/lib/bullhorn.js:52-54](server/lib/bullhorn.js:52). Memory updated.

**Phase C live infrastructure checks** (production header inspection, MCP open-auth probe, Supabase RLS verification) require hitting production endpoints or running SQL against Supabase. These were not run during this audit; the exact one-liners are listed in *Recommended user-run checks* below.

---

## Threat model (cycle 1)

### 1. Actors

| Actor | Capability |
|---|---|
| Anonymous internet user | Can hit `/api/health`. All other routes return 401. |
| Authenticated basic-role employee | 200 req/min (30 writes/min). Read all reqs/candidates. Write to local overrides + notes. Cannot reach `/api/admin/*`, `/api/operations/*`, executive reports. |
| Authenticated manager-role employee | Above + `/api/admin/users` (list/role-update gated to admin), executive reports, manager-only dashboards. |
| Authenticated admin-role employee | Above + role mutation, placement-checklist Bullhorn writeback, reconciliation queue. |
| Departed-but-not-deprovisioned employee | Until Microsoft revokes the token (default 1h), retains the role they had. |
| Phished employee's MS account | Same as legitimate session for the token's lifetime. |
| Compromised npm dependency | Code execution on server start (current `npm audit` lists `uuid <14.0.0` via `exceljs` — moderate). |
| Railway insider | Can read all env vars (BULLHORN_MCP_API_KEY, SUPABASE_SERVICE_KEY, etc.). |
| Supabase insider | Can read/modify the entire app DB. |
| MCP server compromise | Can poison every `query_entity` response — data integrity attack on dashboards. |

### 2. Trust boundaries

```
[Browser] ──TLS, MS-issued Bearer──▶ [API server]
[Browser] ──TLS, OIDC──▶ [Microsoft Entra]                 (login)
[API server] ──TLS, Bearer (BULLHORN_MCP_API_KEY)──▶ [Bullhorn MCP]
[Bullhorn MCP] ──TLS, Bullhorn auth──▶ [Bullhorn REST]      (out of scope)
[API server] ──TLS, service-role key──▶ [Supabase]
[API server] ──TLS, public──▶ [Microsoft JWKS]              (token verify)
[API server] ──TLS, USER's Bearer──▶ [Microsoft Graph]      (search.js — see DRB-SEC-009)
```

The interesting boundary is the last one: the client passes its own Graph token through the API server to Microsoft Graph. The server never holds a Graph credential.

### 3. Attack paths (ranked by combined likelihood × impact)

1. **Phished MS account → full session.** Mitigated by Microsoft conditional access, MFA, and the 1h default token lifetime. The app itself adds no additional second factor. *Highest likelihood; high impact.*
2. **XSS via highlighted search result.** Currently mitigated by [renderHighlightedHtml()](client/src/components/UniversalSearch/UniversalSearch.jsx:16) which escapes everything and only un-escapes server-controlled `<em>`. If the escaper is broken in a future change, payloads could steal the MS token from React state. **CSP-off (DRB-SEC-001) means there's no second line of defense.**
3. **SVG-XSS via support/org-flow logo upload.** If uploaded SVG containing `<script>` is ever served via `<object>`, `<iframe>`, or a raw URL navigation, scripts run on the app origin. Currently uploaded blobs go to Supabase Storage; serving path needs to be confirmed. (DRB-SEC-002)
4. **Dependency compromise.** `uuid` CVE in transitive of `exceljs` is moderate; broader npm supply-chain risk is industry-wide. (DRB-SEC-005)
5. **Excel formula injection on export.** Already mitigated by [sanitizeRow()](server/lib/excelSafe.js:15) on every export route — no action needed.
6. **Role escalation by lower-privilege user.** Attempted at the API layer is blocked: `requireAdmin` / `requireManager` middleware enforces role checks server-side via Supabase. The hardcoded bootstrap admins (DRB-SEC-004) bypass DB lookups *only when* Supabase is unreachable.
7. **Departed employee with cached token.** Realistic for ≤ 1h after offboarding. No app-side mitigation; this is a Microsoft Entra concern.
8. **Tab-takeover via reverse-tabnabbing.** Closed by DRB-SEC-F01–F03 this session.

### 4. Blast radius per component

| If compromised | Blast radius | Recovery |
|---|---|---|
| `BULLHORN_MCP_API_KEY` leak | Full Bullhorn read/write via MCP — all candidates, jobs, notes, placements. | Rotate in both Railway services (MCP + API). |
| `SUPABASE_SERVICE_KEY` leak | Full read/write on overrides, notes, roles, announcements, support tickets, goals. Includes the ability to self-grant `admin` role. | Rotate in Supabase dashboard; redeploy API server. |
| Single user's MS token | All data that user can see, for token lifetime. No write to systems they wouldn't otherwise have access to. | Microsoft Entra revocation; nothing app-side. |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` exposure | Not a credential — these are public-by-design for SPA OIDC flows. Documented misframing. | None needed. |
| MCP server itself compromised | Data integrity: every dashboard reads from poisoned MCP. No data loss in our DB but all decisions made off it would be wrong. | Out-of-band Bullhorn audit; restore MCP. |
| Supabase compromised | All app-owned tables (overrides, notes, roles, support tickets, announcements, goals, placement checklist) at risk. Bullhorn data unaffected (system of record is upstream). | Restore from PITR; rotate keys; force role re-check from a known-good admin list. |

### 5. Detective control gaps

- **No failed-auth alerting.** `[AUTH] Token validation failed:` only goes to `console.error` ([server/middleware/auth.js:53](server/middleware/auth.js:53)) — Railway log retention only, no aggregation.
- **No anomaly detection on writes.** A user changing 100 reqs in one minute is rate-limited (good), but not surfaced to an operator.
- **No audit log of role changes.** `/api/admin/users/:id/role` updates a Supabase row; no immutable audit trail of who promoted whom and when.
- **No Bullhorn write-back log.** If the MCP wrapper or `bullhorn-update` route fires unexpectedly, there's no append-only record to reconstruct.
- **No Supabase database-level audit trail enabled** (assumed; user should verify).
- **No structured error tracking** (Sentry, Honeybadger, etc.). All errors are `console.error`, lost to Railway log rotation.
- **No alerting on rate-limit hits.** Sustained 429s could indicate a credential-stuffing or scraping attempt.

---

## Findings (cycle 1)

> Each finding lists ID, severity, location with a quotable code reference, impact, and recommendation. Recommendations describe direction, not patches — the user can decide whether to schedule a fix.

### Medium

#### DRB-SEC-001 — Content Security Policy disabled

**Location:** [server/index.js:43](server/index.js:43)
```js
app.use(helmet({ contentSecurityPolicy: false }));
```
The accompanying comment reads `"CSP disabled to avoid breaking inline styles/scripts"`.

**Impact.** Without CSP, the only line of defense against XSS is the application's own escaping (e.g., [renderHighlightedHtml()](client/src/components/UniversalSearch/UniversalSearch.jsx:16)). A future regression in any escape path becomes immediately exploitable; with CSP set to even `script-src 'self'`, the regression is contained.

**Recommendation.** Re-enable CSP. The right scope:
1. Audit the build output for inline `<script>` and `<style>`. Vite typically inlines a small bootstrap; allowlist its hash or move to `'self'` with bundled assets.
2. Add `connect-src 'self' https://*.microsoftonline.com https://graph.microsoft.com` for MSAL + Graph.
3. Allow `https://fonts.googleapis.com https://fonts.gstatic.com` for the existing Google Fonts preconnect ([client/index.html](client/index.html)).
4. Roll out behind a `CSP_REPORT_ONLY` flag for one cycle, watch the report endpoint, then enforce.

**Effort.** ~1 day, including report-only observation period.

---

#### DRB-SEC-002 — File-upload validation is mimetype-only

**Locations:**
- [server/routes/orgflow.js:9-16](server/routes/orgflow.js:9) (logo uploads)
- [server/routes/support.js:9-16](server/routes/support.js:9) (support-ticket screenshot uploads)

```js
fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) return cb(null, true);
  cb(new Error('Only image files are allowed'));
}
```

**Impact.** `file.mimetype` is taken from the multipart `Content-Type` header — fully client-controllable. An attacker can upload arbitrary bytes labeled as `image/svg+xml` (or any other `image/*`). SVG specifically can carry `<script>` tags — if any code path serves the upload back via a URL the browser navigates to (rather than via `<img>`, where script blocks are inert), the script executes on the app origin and can read MSAL tokens from `sessionStorage`.

The screenshot URL is then surfaced to a Teams adaptive-card `Action.OpenUrl` ([server/routes/support.js:127](server/routes/support.js:127)) — which Teams will open in the user's browser when clicked. So an attacker uploading a malicious SVG, then submitting a ticket, can phish a manager.

**Recommendation.** Two-layer fix:
1. **Reject SVG explicitly.** Add a mimetype denylist: `if (file.mimetype === 'image/svg+xml') return cb(new Error('SVG not allowed'));`
2. **Magic-byte allowlist.** After multer reads the buffer, check first 12 bytes against PNG (`89 50 4E 47`), JPEG (`FF D8 FF`), GIF (`47 49 46 38`), WEBP (`52 49 46 46 ?? ?? ?? ?? 57 45 42 50`). Reject anything else. Standard libraries: `file-type` npm package.

**Effort.** ~30 min per route + a test for each case.

---

#### DRB-SEC-003 — Server returns full datasets to all authenticated users

**Locations (representative):**
- [server/routes/jobs.js](server/routes/jobs.js) — `/api/req-board/jobs` returns all open jobs regardless of caller
- [server/routes/orgflow.js](server/routes/orgflow.js) — `/api/org-flow/clients` returns all clients (filterable by query param, but enforcement is param-only)
- [server/routes/reporting.js](server/routes/reporting.js) — recruiter dashboards include all peers' data

**Impact.** A basic-role employee can see every recruiter's submission counts, every client's KPIs, every candidate's pay rate — anything the UI is then expected to hide via role-aware components. Anyone who opens devtools, calls the API directly, or uses an Excel-export endpoint sees the full dataset. This is information disclosure within the org, not external — but it's a meaningful gap between the UI's role model and the API's.

**Recommendation.** Rather than a blanket refactor, scope this per route:
1. Identify which routes carry data the org has decided is recruiter-private vs. peer-visible (most are peer-visible by current norm; some — e.g. comp data on candidates — may not be).
2. For each role-private route, add a server-side filter keyed off `req.user.id` resolved to the Bullhorn `CorporateUser`.
3. For Excel exports specifically, gate `/api/jobs/export` and `/api/reporting/*-export` to manager+.

**Effort.** Per-route, 1–2 hours each. Requires a spec from leadership on what's actually private.

---

#### DRB-SEC-004 — Hardcoded admin bootstrap

**Location:** [server/lib/roles.js:13-16](server/lib/roles.js:13)
```js
const BOOTSTRAP_ADMINS = new Set([
  'james@aptcompanies.io',
  'matt@aptcompanies.io',
]);
```

**Impact.** Two emails permanently resolve to `admin` if Supabase is reachable but the row is missing, or if Supabase is unreachable entirely. Intentional for disaster recovery. The downside: those two emails cannot be deprovisioned via the normal role flow, and a code change is required to rotate them.

**Recommendation.** Move to an env var: `BOOTSTRAP_ADMIN_EMAILS=james@…,matt@…` parsed in `roles.js`. This keeps DR coverage but lets the list change without a deploy and removes the names from git. Severity is on the boundary between Medium and Low — calling it Medium because the names are now in source.

**Effort.** ~15 min.

---

#### DRB-SEC-005 — `uuid <14.0.0` moderate CVE via `exceljs`

**Source:** `npm audit --omit=dev` in both `server/` and `client/`.
```
uuid  <14.0.0
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided
fix available via `npm audit fix --force`
Will install exceljs@3.4.0, which is a breaking change
node_modules/uuid
  exceljs  >=3.5.0
  Depends on vulnerable versions of uuid
  node_modules/exceljs
2 moderate severity vulnerabilities
```

**Impact.** The vulnerable `uuid.v3/v5/v6` paths are not invoked by the app's `exceljs` usage, which means no current exploit chain. But the advisory is real, and `npm audit` will keep flagging it on every CI run.

**Recommendation.** Wait for `exceljs` ≥ 5 (when released) or evaluate alternatives (`xlsx-populate`, `node-xlsx`). Pinning `uuid` via `overrides` in `package.json` is a stopgap that works but reads as suspicious to future readers.

**Effort.** 1–2 hours to evaluate; deploy depends on test coverage of export routes.

---

### Low

#### DRB-SEC-006 — Lucene partial escape in email WHERE clause

**Location:** [server/lib/bullhorn.js:805-806](server/lib/bullhorn.js:805)
```js
function sanitizeEmailForWhere(email) {
  return String(email || '').replace(/['"`\\]/g, '').trim();
}
```

The accompanying comment notes "emails never legally contain a quote anyway, so this is safe rejection rather than escaping." That covers quote-injection but not Lucene operators (`AND`, `OR`, `NOT`, `+`, `-`, `*`, `?`).

**Impact.** Source emails come from the user's own Microsoft Graph search results — a trusted-ish source (the user is bringing their own Graph token). The realistic attack is: a user receives an email from `attacker+OR+1=1@evil.com`, and the dashboard fetch is built off that. In Bullhorn's dialect this likely just doesn't match anything; a worst case is that the WHERE clause shape is altered. Not exploitable for data exfil, only for query manipulation that the user could already do via the Bullhorn UI.

**Recommendation.** Use a stricter pattern: require the email match `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/` before concat. Reject anything else. Don't try to escape Lucene operators by hand.

**Effort.** 15 min.

---

#### DRB-SEC-007 — PII in MCP debug logs

**Locations:**
- [server/lib/bullhorn.js:891](server/lib/bullhorn.js:891) — `console.log('[createAppointment] payload:', JSON.stringify(fields));`
- [server/routes/search.js:374](server/routes/search.js) — search query terms logged with user attribution
- Various routes log full Bullhorn responses including candidate names/IDs in error paths

**Impact.** Railway log retention is short (~7 days default), but logs are visible to anyone with the Railway project access. Search queries can include partial candidate names; appointment payloads include candidate and client contact IDs.

**Recommendation.**
1. Wrap PII-likely log statements in `if (process.env.LOG_PII === 'true')` — opt-in for debugging, off by default.
2. For unrecoverable error paths, log only the error message + a request ID; the request ID can be correlated to a separate, short-lived debug store if needed.

**Effort.** Small (~1 hour).

---

#### DRB-SEC-008 — No CSRF token (mitigated)

**Status.** The app authenticates via `Authorization: Bearer` header, not cookies. CORS is allowlisted ([server/index.js:94-108](server/index.js:94)). Cross-origin requests can't reach the API server in browsers. So CSRF is mitigated by design — but there's no second layer.

**Impact.** Low. A future change that introduced cookie-based session would suddenly become CSRF-exposed without any explicit signal that the design now requires CSRF protection.

**Recommendation.** Document the no-cookie / Bearer-only design in [server/CLAUDE.md](server/CLAUDE.md) so it doesn't drift. No code change needed today.

**Effort.** 5 min, docs only.

---

### Informational

#### DRB-SEC-009 — Microsoft Graph token is client-supplied

**Location:** [server/routes/search.js:170](server/routes/search.js:170)
```js
headers: { Authorization: `Bearer ${accessToken}`, ... }
```

The Universal Search route accepts `req.body.accessToken` (a Microsoft Graph token the SPA acquired client-side via MSAL) and forwards it to `https://graph.microsoft.com/v1.0/search/query`.

**Impact.** This is *architecturally fine*: Microsoft Graph still validates the token, so the server can't grant access the caller doesn't already have. The server is acting as a CORS-compatible proxy, nothing more. **But** the API server logs become a cross-tenant data flow if the token validation is ever skipped, and this is a pattern that's easy to misuse in future routes.

**Recommendation.** Document the contract in a route-level comment: "this server never holds a Graph credential; it forwards the user's token. Do not log it; do not cache it; do not extend this pattern to routes that should run with server identity." If the user-bearer pattern grows beyond one route, switch to the on-behalf-of (OBO) flow with a server-side Graph credential.

**Effort.** Comment-only.

---

#### DRB-SEC-010 — No GitHub branch protection / CI security gates

No `.github/workflows/`, no required reviews, no automated `npm audit` in CI, no Dependabot.

**Recommendation.** For a two-developer team, this is a defensible posture today. As soon as a third committer joins or a security-sensitive change is in flight, add: required PR review on `main`, an `npm audit` job, and Dependabot on weekly cadence.

---

#### DRB-SEC-011 — Stale memory note (corrected this session)

The previous `project_mcp_security.md` claimed MCP had no auth and the URL was committed to git. Verified false on 2026-04-29: MCP is Bearer-authed at [server/lib/bullhorn.js:52-54](server/lib/bullhorn.js:52); `git log --all --full-history -S 'BULLHORN_MCP_URL'` returns nothing. The memory file also contained a generated key value in plaintext — removed during this audit.

> **Cycle 2 note (2026-05-22):** the `git log` claim above was wrong (or relied on different search syntax). `git log --all -S 'BULLHORN_MCP_URL' --oneline` does return commits including the initial commit. See cycle 2 DRB-SEC-013.

---

## Verified-safe (cycle 1)

These controls were checked and pass. Listed so future audits don't redo the same investigation.

| Control | Where | Notes |
|---|---|---|
| Microsoft Entra JWT verification | [server/middleware/auth.js:27-64](server/middleware/auth.js:27) | RS256 via `jwks-rsa`, issuer + audience checked, dev-bypass blocked in prod |
| Two-layer rate limiting | [server/index.js:59-90](server/index.js:59) | IP flood (1000/min, before auth) + per-user (200/min general, 30/min writes) |
| CORS allowlist | [server/index.js:94-108](server/index.js:94) | No wildcard; explicit origin list with trailing-slash normalization |
| MCP Bearer auth | [server/lib/bullhorn.js:52-54](server/lib/bullhorn.js:52) | `Authorization: Bearer ${BULLHORN_MCP_API_KEY}` on every call; warns if missing |
| MCP tool whitelist | [server/lib/bullhorn.js:15-25](server/lib/bullhorn.js:15) | Only 9 tool names allowed through `callTool()` |
| MCP circuit breaker | [server/lib/mcpBreaker.js](server/lib/mcpBreaker.js) | Opens after 5 consecutive failures; prevents cascading timeouts |
| Excel formula-injection protection | [server/lib/excelSafe.js:15-29](server/lib/excelSafe.js:15) | Prefixes `=`, `+`, `@` with apostrophe on every export route |
| HTML-escape in search highlight | [client/src/components/UniversalSearch/UniversalSearch.jsx:16-24](client/src/components/UniversalSearch/UniversalSearch.jsx:16) | Escapes everything, then un-escapes only server-controlled `<em>` tags |
| Field-level whitelist on Bullhorn writeback | [server/routes/jobs.js:543-548](server/routes/jobs.js:543) | Prevents mass-assignment via `bullhorn-update` |
| Field-level whitelist on opportunity update | [server/routes/jobs.js:281-310](server/routes/jobs.js:281) | Same pattern; only `status`, `expectedCloseDate` |
| Performance dashboard cross-user authz | [server/routes/performance.js:51-59](server/routes/performance.js:51) | Caller's role checked (not target's) before granting access to `?email=` impersonation |
| Admin route role gates | [server/middleware/adminAuth.js](server/middleware/adminAuth.js) | `requireAdmin` / `requireManager` resolve role via Supabase, applied at route-level |
| OrgFlow sync re-entrancy guard | [server/lib/orgflowSync.js:19-29](server/lib/orgflowSync.js:19) | `isRunning` flag prevents overlapping cron runs |
| Sourcemaps off in production | [client/vite.config.js:8](client/vite.config.js:8) | `sourcemap: false`; verified no `*.map` in `client/dist/` |
| MSAL token in sessionStorage | [client/src/lib/authConfig.js:17-19](client/src/lib/authConfig.js:17) | Cleared on tab close; appropriate for shared workstations |
| Dev auth bypass production-safe | [client/src/App.jsx:28](client/src/App.jsx:28) | Guarded by `import.meta.env.DEV`; Vite strips at build time |
| No real secrets in git | n/a | `git log --all -S` over MCP URL, Supabase service key, Bullhorn key — clean. `.gitignore` covers `.env`, `*.log`, `*.pem`, `*.key`, `dist/` |
| `.env.example` placeholder-only | [.env.example](.env.example) | No real values |
| `noopener,noreferrer` on `window.open` | All three callsites | Applied this session |
| URL-scheme validation on `window.open` | [client/src/components/UniversalSearch/UniversalSearch.jsx](client/src/components/UniversalSearch/UniversalSearch.jsx) | Applied this session |

---

## Recommended user-run checks (cycle 1)

These require live access I don't have from this session. One-line commands; paste output into the report or spawn a follow-up task.

1. **Verify MCP rejects unauthenticated requests.**
   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -X POST <MCP_URL> \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```
   Expect 401 or 403. Anything 2xx means MCP is open.

2. **Verify production response headers.**
   ```sh
   curl -I https://<your-api-domain>/api/health
   ```
   Look for `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`. CSP should be absent (per DRB-SEC-001) — confirms the finding.

3. **Verify Supabase RLS on user-data tables.** Run in Supabase SQL editor:
   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity
   FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
   WHERE nspname = 'public' AND relkind = 'r'
   ORDER BY relname;
   ```
   Expect `relrowsecurity = true` on `user_profiles`, `notes`, `overrides`, `support_tickets`, `goals`, `announcements`. The API server uses the service role key (which bypasses RLS), so RLS only matters as defense-in-depth if the anon key is ever accidentally used.

4. **Verify Microsoft Entra token lifetime is appropriate.** Check the app registration in Azure Portal: ID Token lifetime should be ≤ 1h, Refresh Token rotation should be enabled.

---

## Appendix A — `npm audit` raw output (cycle 1)

### `server/`

```
# npm audit report

uuid  <14.0.0
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided - https://github.com/advisories/GHSA-w5hq-g745-h8pq
fix available via `npm audit fix --force`
Will install exceljs@3.4.0, which is a breaking change
node_modules/uuid
  exceljs  >=3.5.0
  Depends on vulnerable versions of uuid
  node_modules/exceljs

2 moderate severity vulnerabilities
```

### `client/`

```
# npm audit report

uuid  <14.0.0
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided - https://github.com/advisories/GHSA-w5hq-g745-h8pq
fix available via `npm audit fix --force`
Will install exceljs@3.4.0, which is a breaking change
node_modules/uuid
  exceljs  >=3.5.0
  Depends on vulnerable versions of uuid
  node_modules/exceljs

2 moderate severity vulnerabilities
```

Both packages share the finding because both depend on `exceljs` directly.

---

## Appendix B — Files reviewed (cycle 1)

### Server
`server/index.js`, `server/middleware/auth.js`, `server/middleware/adminAuth.js`, `server/lib/bullhorn.js`, `server/lib/db.js`, `server/lib/excelSafe.js`, `server/lib/mcpBreaker.js`, `server/lib/orgflowSync.js`, `server/lib/roles.js`, `server/routes/admin.js`, `server/routes/clientHealth.js`, `server/routes/dashboard.js`, `server/routes/goals.js`, `server/routes/jobs.js`, `server/routes/operations.js`, `server/routes/orgflow.js`, `server/routes/performance.js`, `server/routes/placements.js`, `server/routes/reporting.js`, `server/routes/search.js`, `server/routes/stats.js`, `server/routes/support.js`, `server/routes/users.js`, `server/package.json`.

### Client
`client/src/App.jsx`, `client/src/components/UniversalSearch/UniversalSearch.jsx`, `client/src/components/LoginPage.jsx`, `client/src/lib/api.js`, `client/src/lib/authConfig.js`, `client/src/lib/UserRoleContext.jsx`, `client/src/lib/searchHelpers.js`, `client/src/modules/req-board/ReqBoard.jsx`, `client/src/modules/org-flow/OrgFlowModule.jsx`, `client/src/modules/org-flow/OrgFlowRedirect.jsx`, `client/src/modules/org-flow/components/OrgChart.jsx`, `client/src/modules/reporting/RecruiterDashboard.jsx`, `client/index.html`, `client/vite.config.js`, `client/package.json`, `client/.env`, `client/.gitignore`.

### Repo
`CLAUDE.md`, `client/CLAUDE.md`, `server/CLAUDE.md`, `TECHNICAL_SPECIFICATIONS.md`, `APT_Req_Board_Field_Key.md`, `.gitignore`, `.env.example`, `.claude/settings.local.json`, `.claude/launch.json`.

### Not reviewed (and why)
- `node_modules/` — out of scope; covered by `npm audit`.
- Bullhorn MCP server source — separate Railway project, separate repo. Audit stops at the auth boundary.
- Production Railway / Supabase configurations — require live access; user-run checks listed above.
- `.docx` field-key documents — binary; manual inspection by user recommended if those are sent externally.

---

## Appendix C — Severity rationale (cycle 1)

This audit uses a four-axis judgement (likelihood, impact, blast radius, ease of fix), not numeric CVSS. The shape is:

- **Critical:** known exploit chain, internet-reachable, high impact. None found.
- **High:** known exploit chain, requires authenticated user OR limited blast radius. None found.
- **Medium:** defense-in-depth gap with no specific exploit chain today, OR medium-effort fix that meaningfully reduces a future-regression class. DRB-SEC-001 to -005.
- **Low:** documented quirk that could surprise a future reader; cheap to address. DRB-SEC-006 to -008.
- **Informational:** worth recording, no action needed today. DRB-SEC-009 to -011.

If you want CVSS-3.1 vector strings on the Mediums for compliance reporting, that's a half-hour add — say the word.

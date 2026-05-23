# Client — React Frontend (Vite SPA)

The React frontend for the Digital Req Board. Vite-built SPA, deployed as the `frontend` Railway service. All data comes from the api-server — the client never calls the Bullhorn MCP server directly.

---

## Auth & app shell

- **Auth modes**: Microsoft Entra SSO via MSAL (internal staff) + external email/password JWT in `localStorage` (vendors). Both pass `Authorization: Bearer <JWT>` to the API.
- **Permission gating**: `hasAccess(module, level)` from `UserRoleContext` (`src/lib/UserRoleContext.jsx`). Sidebar links and route guards hide modules the user lacks access to. Module names live server-side in `lib/modules.js`.
- **Sandbox banner**: `App.jsx` renders an orange "🟡 SANDBOX" strip when `VITE_ENV === 'sandbox'`. Hidden in prod.
- **Universal search**: Cmd+K (Mac) / Ctrl+K (Windows) opens a global search modal across jobs, candidates, clients. Component: `components/UniversalSearch/`.

---

## Modules (`src/modules/<feature>/`)

Each module is a self-contained area with its own components, styles, and (where needed) local libs.

| Module | Folder | Purpose |
|--------|--------|---------|
| Req Board | `modules/req-board/` | Main board — table with inline editing, filters, stats strip, JobDetail slide-out, status badges, ConflictDialog. |
| India Req Board | `modules/india-req-board/` | Thin wrapper that mounts `ReqBoardModule` with `apiFilter={{ apt_india: true }}` and `permissionKey="india_req_board"`. Same UI, filtered to India-flagged jobs. |
| Reporting | `modules/reporting/` | Recruiter Dashboard, Sales Dashboard, Executive Dashboard, Individual Performance — KPI cards + charts. |
| Performance | `modules/performance/` | Individual "My Dashboard" — personal metrics. |
| Pipeline | `modules/pipeline/` | Opportunity pipeline + Convert-to-Job modal. |
| Org Flow | `modules/org-flow/` | Org chart / workflow visualization. |
| Client Health | `modules/client-health/` | Client relationship health gauges. |
| Goal Tracking | `modules/goal-tracking/` | Goals + pacing. |
| Operations | `modules/operations/` | Operations module. |
| Project Management | `modules/project-management/` | Project management module. |
| Support | `modules/support/` | Support ticket UI. |
| Admin | `modules/admin/` | User roles, module permissions, ad-hoc SharePoint export trigger. |

---

## Shared components (`src/components/`)

| File | Purpose |
|------|---------|
| `AppShell.jsx` | Top-level layout (header, sidebar, content area). |
| `Sidebar.jsx` + `sidebar.css` | Navigation with module links (permission-gated). |
| `LoginPage.jsx` | MSAL flow + external email/password form. |
| `HomePage.jsx` | Landing page after login. |
| `ChangelogModal.jsx` | Reads `CHANGELOG` from `src/lib/version.js` and shows release notes. |
| `ComingSoon.jsx` | Placeholder for modules not yet built. |
| `ModuleSplash.jsx` | Loading splash when entering a module. |
| `UniversalSearch/` | Cmd+K global search. |

---

## Libs (`src/lib/`)

| File | Purpose |
|------|---------|
| `api.js` | Fetch wrapper for all api-server calls. Centralizes auth-header injection, error handling, and toasts. |
| `UserRoleContext.jsx` | React context for current user, role, and module permissions. Exposes `hasAccess(module, level)`. |
| `authConfig.js` | MSAL (Azure AD) configuration. |
| `toast.js` | Toast notifications. |
| `version.js` | `APP_VERSION` constant (currently `3.29.17`) + `CHANGELOG` array. **Bump on every prod deploy** and add a changelog entry. |

Also: `src/hooks/` holds shared React hooks used across modules.

---

## Req Board UI essentials

### Layout
- **Header**: APT logo, board title ("Req Board" or "India Req Board"), last-refresh label, manual Refresh + Export Excel buttons, pause indicator while editing.
- **Stats strip**: clickable counters — Open Reqs, Active Contractors, Offers Out, Covered, Opportunity Pipeline (hidden on India board), On The Board.
- **Filter bar**: multi-select Status / Type / Owner (AM) / TR / Client, single-select Remote / Called Shots / Red Boxes (alerts with count badge). Filtering is client-side.
- **Main table**: 17+ columns, mix of read-only (Bullhorn data) and inline-editable (Supabase overrides + Bullhorn write-back fields).
- **JobDetail slide-out**: opens on row click. Shows compensation, counts, Open/Closed toggle, submissions list, notes thread, Offer Out tab.

### Status badge colors (authoritative — `modules/req-board/StatusBadge.jsx`)
| Status | Hex | Label |
|--------|-----|-------|
| Accepting Candidates | `#16a34a` (green) | AC |
| Covered | `#2563eb` (blue) | CV |
| Offer Out | `#ea580c` (orange) | OO |
| Placed | `#9333ea` (purple) | PL |
| Filled | `#0d9488` (teal) | FL |
| Lost | `#dc2626` (red) | LO |
| Wash | `#6b7280` (gray) | WA |
| Archive | `#374151` bg / `#9ca3af` text | AR |

### Refresh cadence
Three timers, all in `modules/req-board/ReqBoardModule.jsx`:
- **`REFRESH_INTERVAL = 20s`** — silent background refetch.
- **`REFRESH_TICK_MS = 5s`** — updates the "updated Xs ago" relative-time label.
- **SSE event stream** — `/api/req-board/jobs/events`. Override + note events merge into the board in-place (no full refetch).

All three pause when the detail panel is open OR any cell is being edited, to avoid clobbering in-flight saves. The Visibility API stops all three when the tab is hidden and resumes on focus. The manual Refresh button always works, even when paused.

---

## Inline editing patterns

The Req Board does optimistic, version-aware editing. Get this right or saves can silently drop.

1. **Optimistic UI** — edits appear immediately, then revert if the save fails.
2. **Serialize per-job, parallelize across jobs** — two edits to the same job run sequentially; edits to different jobs run in parallel.
3. **Version-aware merging** — every override carries a `version`. If the local version > server version, local edits are preserved until the server's view catches up.
4. **Optimistic locking on save** — `PATCH /api/req-board/jobs/:id/overrides` sends `If-Match: <version>`. A 409 `OVERRIDE_CONFLICT` triggers `ConflictDialog`:
   - Shows the server's current value vs. the user's pending value.
   - **Reload & Retry** refetches, bumps version, replays the save.
   - **Dismiss** drops the edit.
5. **Edit-aware pause** — while a cell is dirty (typing in a textarea, dropdown open, save in flight), the 20s poll + SSE handlers skip applying server data to that row. Resumes when the edit drains.

---

## Conventions

- **Use `lib/api.js`** for every API call. Do not call `fetch()` directly from components — `api.js` handles auth headers, 401 redirects, and error toasts.
- **Permission-gate every new module/page**: wrap with `hasAccess('<module>')` check; add the module to `lib/modules.js` on the server side.
- **Status colors**: source of truth is `StatusBadge.jsx`. Don't redefine the palette elsewhere; import or reference.
- **Timestamps**: Bullhorn timestamps come in as Unix ms. Format with `toLocaleDateString('en-US', { timeZone: 'America/Chicago' })` for display.
- **No Bullhorn calls from the client.** Ever. All Bullhorn access goes through the api-server.
- **App version**: bump `APP_VERSION` in `lib/version.js` on every prod deploy and add a changelog entry — the in-app modal reads from this file.

# Apt Command — Frontend

React 18 + Vite SPA, deployed as the `frontend` Railway service. All data comes from the api-server — the client never talks to the Bullhorn MCP server directly.

For project-wide context (architecture, environments, deployment workflow, who uses this), see the [root README](../README.md).
For working-engineer detail (modules, components, refresh behavior, optimistic editing, status colors), see [`CLAUDE.md`](CLAUDE.md) in this directory.

---

## Local dev

```bash
npm install
npm run dev        # vite, port 5173
npm run build      # production build into dist/
npm run lint       # eslint .
npm run preview    # serve the production build locally
```

The frontend reads `VITE_API_BASE_URL` to find the api-server. Set it to `http://localhost:3001` for local dev and to the api-server Railway URL in deployed environments.

---

## Env vars

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE_URL` | api-server URL. |
| `VITE_AZURE_TENANT_ID` | Microsoft Entra tenant for SSO. |
| `VITE_AZURE_CLIENT_ID` | Microsoft Entra app registration ID. |
| `VITE_DEV_BYPASS_AUTH` | `true` in local dev to skip MSAL. The api-server still requires a real Bearer token, so pure-API tests won't work with this alone. |
| `VITE_ENV` | Set to `sandbox` on the sandbox Railway service to render the orange "SANDBOX" banner. Leave unset in prod. |

See the root [`.env.example`](../.env.example) for the authoritative client-side block.

---

## Structure

```
src/
├── App.jsx              Routing + sandbox banner + auth gating
├── main.jsx             MSAL provider + React root
├── components/          Shared UI: AppShell, Sidebar, LoginPage,
│                        UniversalSearch (Cmd+K), ChangelogModal, ...
├── modules/             Feature modules — each self-contained:
│   ├── req-board/       Main board (ReqBoardModule, JobDetail,
│   │                    StatusBadge, FilterBar, ConflictDialog, ...)
│   ├── india-req-board/ Wrapper that mounts ReqBoardModule with
│   │                    apiFilter={{ apt_india: true }}
│   ├── reporting/       Recruiter / Sales / Executive dashboards
│   ├── performance/     Individual "My Dashboard"
│   ├── pipeline/        Opportunities + Convert-to-Job
│   ├── admin/           User roles, permissions, ad-hoc export
│   ├── org-flow/
│   ├── client-health/
│   ├── goal-tracking/
│   ├── operations/
│   ├── project-management/
│   └── support/
├── hooks/               Shared React hooks
└── lib/
    ├── api.js           Fetch wrapper — auth headers, 401 handling, toasts
    ├── UserRoleContext  Current user + role + module permissions
    ├── authConfig.js    MSAL configuration
    ├── toast.js         Toast notifications
    └── version.js       APP_VERSION + CHANGELOG (in-app modal reads this)
```

---

## Conventions

- **Use `lib/api.js` for every API call.** It centralizes the `Authorization: Bearer` header, 401 redirect, and error toasting.
- **Permission-gate every page.** Use `hasAccess('<module>', '<level>')` from `UserRoleContext` and add the module to `server/lib/modules.js`.
- **No direct Bullhorn calls from the client.** Ever. Everything goes through the api-server.
- **App version**: bump `APP_VERSION` in `lib/version.js` on every prod deploy and add a changelog entry. The in-app Changelog modal reads from this constant.
- **Status colors**: source of truth is `modules/req-board/StatusBadge.jsx`. Don't redefine the palette anywhere else.

For inline editing patterns, optimistic locking, and conflict resolution flow, see [`CLAUDE.md`](CLAUDE.md).

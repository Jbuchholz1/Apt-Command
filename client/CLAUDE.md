# Client — React Frontend (Vite SPA)

This is the React frontend for the Digital Req Board. It is a Vite-based SPA deployed as its own Railway service. All data comes from the API server — the client never calls the Bullhorn MCP server directly.

---

## Frontend UI Requirements

### Layout
- **Header:** "APT Req Board" branding, last-refreshed timestamp, manual refresh button
- **Filter bar:** Filter by Status, Employment Type, Owner/Recruiter, Remote (Yes/No/Hybrid)
- **Stats strip:** Count of open reqs | Active contractors | Offers out | Covered
- **Main table:** Sortable columns, color-coded status badges
- **Auto-refresh:** Every 5 minutes

### Req Board Table Columns (in order)
1. Priority (A/B/C badge from `type` field)
2. Job Title (`title`)
3. Client (`clientCorporation.name`)
4. Status (color-coded badge)
5. Type (`employmentType`)
6. Owner (`owner.firstName + lastName`)
7. # Open (`numOpenings`)
8. # Filled (`customText2`)
9. Remote (`customText1`)
10. City/State (`address.city`, `address.state`)
11. Date Added (`dateAdded` → formatted)
12. Start Date (`startDate` → formatted)

### Status Color Coding
| Status | Color |
|--------|-------|
| Accepting Candidates | Green |
| Covered | Blue |
| Offer Out | Orange |
| Placed | Purple |
| Filled | Teal |
| Lost | Red |
| Wash | Gray |
| Archive | Dark Gray |

### Row Click → Detail Panel
Clicking a row should expand or slide open a detail panel showing:
- Full job details
- Submissions count (call `get_submissions(jobOrderId)`)
- Notes/activity (if available)

### Design Direction
- Clean, data-dense, professional — this is an internal ops tool
- Dark sidebar or header with a light table body works well
- Monospace or tabular number font for rates/counts
- NOT a consumer app — prioritize information density over whitespace
- APT company colors: navy and gold (if brand colors are needed)

---

## Module Structure

The frontend is organized into feature modules under `src/modules/`. Each module is a self-contained area of the app with its own components, styles, and (where needed) local libs.

| Module | Folder | Purpose |
|--------|--------|---------|
| Req Board | `modules/req-board/` | The main requisition board — table with inline editing, filters, stats strip, job detail panel, status badges, splash screen |
| Reporting | `modules/reporting/` | Recruiter Dashboard and Sales Dashboard with KPI cards and charts |
| Performance | `modules/performance/` | Individual "My Dashboard" — personal performance metrics |
| Pipeline | `modules/pipeline/` | Opportunity/sales pipeline view |
| Org Flow | `modules/org-flow/` | Org chart or workflow visualization |
| Client Health | `modules/client-health/` | Client relationship health gauges |
| Admin | `modules/admin/` | Admin panel — user roles, settings, system management |

---

## Shared Components and Libs

### Components (`src/components/`)

| File | Purpose |
|------|---------|
| `AppShell.jsx` | Top-level layout wrapper (header, sidebar, content area) |
| `Sidebar.jsx` + `sidebar.css` | Navigation sidebar with module links |
| `LoginPage.jsx` | Authentication / login screen |
| `HomePage.jsx` | Landing page after login |
| `ChangelogModal.jsx` | Release notes / changelog popup |
| `ComingSoon.jsx` | Placeholder for modules not yet built |
| `ModuleSplash.jsx` | Loading splash screen when entering a module |

### Libs (`src/lib/`)

| File | Purpose |
|------|---------|
| `api.js` | Fetch wrapper for all API server calls |
| `UserRoleContext.jsx` | React context provider for current user's role and permissions |
| `authConfig.js` | Authentication configuration (MSAL / Azure AD) |
| `toast.js` | Toast notification utility |
| `version.js` | App version tracking for changelog display |

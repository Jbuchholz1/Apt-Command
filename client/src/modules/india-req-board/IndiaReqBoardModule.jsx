import ReqBoardModule from '../req-board/ReqBoardModule';

// India Req Board — same component, same UI, same edit affordances as the
// regular Req Board. Differences are entirely configured via props:
//
//   - title          → tab heading
//   - apiFilter      → server-side filter (only jobs whose apt_india override is true)
//   - permissionKey  → which module key gates access to the tab
//
// Edits made here (TR, notes, status, overrides…) hit the same Supabase row
// and the same Bullhorn write path as the regular Req Board. The two boards
// stay 1:1 by construction because they share the same code.
// Hoisted to module scope so the prop keeps a stable identity across renders.
// ReqBoardModule's data-fetch effect depends on apiFilter; a fresh object
// literal each render would thrash the poll/ticker/SSE lifecycle.
const INDIA_API_FILTER = { apt_india: true };

export default function IndiaReqBoardModule() {
  return (
    <ReqBoardModule
      title="India Req Board"
      apiFilter={INDIA_API_FILTER}
      permissionKey="india_req_board"
      hideOpportunities
      indiaMode
    />
  );
}

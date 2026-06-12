// Circuit breaker for Bullhorn MCP calls.
//
// Why: when the MCP server is down or slow, every inbound request waits
// the full 30-second fetch timeout before failing. With 30 concurrent
// users on the board, that turns a backend blip into a multi-minute
// office-wide stall. The breaker fails fast once failures pile up and
// gives the remote side time to recover.
//
// Semantics:
//   - closed   : calls pass through normally. Consecutive failures count up.
//   - open     : calls are rejected immediately for OPEN_MS.
//   - half-open: exactly one call is permitted as a probe. Success closes
//                the breaker; failure re-opens it for another OPEN_MS.
//
// The thresholds below are intentionally conservative — they should not
// trip under normal, healthy operation. Tune via env if needed.

const FAILURE_THRESHOLD = parseInt(process.env.MCP_BREAKER_FAILURES || '5', 10);
const OPEN_MS = parseInt(process.env.MCP_BREAKER_OPEN_MS || '10000', 10);

const state = {
  status: 'closed',
  consecutiveFailures: 0,
  openedAt: 0,
};
let halfOpenInFlight = 0;

class CircuitOpenError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CircuitOpenError';
    this.code = 'MCP_CIRCUIT_OPEN';
    // 503 Service Unavailable — the breaker is shedding load while Bullhorn
    // recovers; this is a transient upstream outage, not a server bug (500).
    this.statusCode = 503;
  }
}

function beforeCall() {
  if (state.status === 'open') {
    if (Date.now() - state.openedAt >= OPEN_MS) {
      state.status = 'half-open';
      halfOpenInFlight = 0;
      console.warn('[MCP breaker] transitioning to half-open — probing MCP availability');
    } else {
      throw new CircuitOpenError('Bullhorn MCP is temporarily unavailable — try again shortly');
    }
  }
  if (state.status === 'half-open') {
    if (halfOpenInFlight >= 1) {
      throw new CircuitOpenError('Bullhorn MCP is temporarily unavailable — probe in progress');
    }
    halfOpenInFlight += 1;
  }
}

function recordSuccess() {
  state.consecutiveFailures = 0;
  if (state.status === 'half-open') {
    halfOpenInFlight = Math.max(0, halfOpenInFlight - 1);
    state.status = 'closed';
    console.log('[MCP breaker] probe succeeded — circuit closed');
  }
}

function recordFailure() {
  state.consecutiveFailures += 1;
  if (state.status === 'half-open') {
    halfOpenInFlight = Math.max(0, halfOpenInFlight - 1);
    state.status = 'open';
    state.openedAt = Date.now();
    console.warn('[MCP breaker] probe failed — circuit re-opened');
    return;
  }
  if (state.status === 'closed' && state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.status = 'open';
    state.openedAt = Date.now();
    console.warn(
      `[MCP breaker] opened after ${state.consecutiveFailures} consecutive failures — failing fast for ${OPEN_MS}ms`,
    );
  }
}

function getStatus() {
  return { status: state.status, consecutiveFailures: state.consecutiveFailures, openedAt: state.openedAt };
}

module.exports = { beforeCall, recordSuccess, recordFailure, getStatus, CircuitOpenError };

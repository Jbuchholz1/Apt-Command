// Real-time push for the Req Board.
//
// One Supabase Realtime subscription per server instance, fanning out to
// every connected SSE client. Clients connect to /api/req-board/jobs/events;
// they receive INSERT/UPDATE events on `job_overrides` (notes, deadline,
// follow-up, called shot, etc.) and INSERTs on `job_notes` so peer edits
// land in everyone's UI within ~500ms instead of waiting on a poll.
//
// Bullhorn-only fields (status, owner, salaries, AM/TR via Bullhorn) still
// flow through the existing 20s poll because Bullhorn doesn't push to us.
//
// Multi-instance note: if Railway runs more than one instance, each gets
// its own Supabase subscription and its own connected-client list. Both
// instances see the same DB events; each fans out to its own connected
// browsers. No coordination needed.

const { supabase } = require('./db');

const clients = new Set();
let channelInitialized = false;

function addClient(client) {
  clients.add(client);
}

function removeClient(client) {
  clients.delete(client);
}

function broadcast(event) {
  if (clients.size === 0) return;
  const payload = JSON.stringify(event);
  for (const client of clients) {
    try {
      client.send(payload);
    } catch (err) {
      // The client's req.on('close') handler will clean it up — don't log
      // a stack trace here, it's noisy when many clients drop simultaneously.
    }
  }
}

function getClientCount() {
  return clients.size;
}

function initRealtimeChannel() {
  if (channelInitialized) return null;
  if (!supabase) {
    console.warn('[realtime] Supabase not configured — Req Board push disabled');
    return null;
  }
  channelInitialized = true;

  const channel = supabase
    .channel('apt-req-board')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'job_overrides' },
      (payload) => {
        // payload.new is populated for INSERT/UPDATE; payload.old for DELETE.
        const row = (payload.new && Object.keys(payload.new).length > 0)
          ? payload.new
          : payload.old;
        if (!row || row.job_id === undefined) return;
        broadcast({
          type: 'override',
          eventType: payload.eventType, // 'INSERT' | 'UPDATE' | 'DELETE'
          row,
        });
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'job_notes' },
      (payload) => {
        if (!payload.new || payload.new.job_id === undefined) return;
        broadcast({
          type: 'note',
          eventType: 'INSERT',
          row: payload.new,
        });
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] subscribed to job_overrides + job_notes');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[realtime] channel error:', err && err.message);
      } else if (status === 'TIMED_OUT') {
        console.warn('[realtime] subscription timed out');
      } else if (status === 'CLOSED') {
        console.warn('[realtime] subscription closed');
      }
    });

  return channel;
}

module.exports = {
  addClient,
  removeClient,
  broadcast,
  getClientCount,
  initRealtimeChannel,
};

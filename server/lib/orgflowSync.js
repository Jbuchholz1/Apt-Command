// Pulls active Bullhorn ClientCorporations into the Org Flow `clients` table.
// Runs on a 30-minute cron (server/index.js) and on demand via
// POST /api/org-flow/sync-bullhorn-clients.
//
// Three classification paths per Bullhorn corp:
//   1. Already linked (bullhorn_client_id matches) — update name if it drifted.
//   2. Same name, no link yet — backfill bullhorn_client_id (the "linked" count).
//      Only sets created_by if currently NULL, to preserve manual edits.
//   3. New corp — insert a fresh card.
//
// Bullhorn MCP is poll-only, so the watermark in `sync_state` lets us fetch
// only what changed since the last successful run after the initial backfill.

const db = require('./db');
const { getActiveClientCorporations } = require('./bullhorn');

const SYNC_KEY = 'orgflow_bullhorn_clients';

let isRunning = false;

function normalizeName(name) {
  return (name || '').toLowerCase().trim();
}

async function syncBullhornClients() {
  if (isRunning) {
    return { skipped: 'already-running' };
  }
  isRunning = true;

  const startedAt = new Date().toISOString();
  try {
    const state = await db.getSyncState(SYNC_KEY);
    const lastSuccessMs = state?.last_success_at
      ? new Date(state.last_success_at).getTime()
      : 0;

    const bhResult = await getActiveClientCorporations(lastSuccessMs);
    const bhCorps = bhResult?.data || [];
    console.log('[orgflowSync] fetched', bhCorps.length, 'corps; sample keys:',
      bhCorps[0] ? Object.keys(bhCorps[0]).join(',') : '(empty)',
      'raw response keys:', bhResult ? Object.keys(bhResult).join(',') : '(null)',
      'message:', bhResult?.message ? String(bhResult.message).slice(0, 600) : '(none)');

    // If MCP couldn't parse Bullhorn's response as JSON it falls back to
    // { message: "<raw text>" } — almost always an error from Bullhorn (bad
    // field, malformed where, etc.). Surface it as last_error instead of
    // silently writing 0/0/0 to sync_state.
    if (bhResult?.message && !Array.isArray(bhResult?.data)) {
      throw new Error(`Bullhorn returned non-JSON response: ${String(bhResult.message).slice(0, 400)}`);
    }

    if (bhCorps.length === 0) {
      await db.upsertSyncState(SYNC_KEY, {
        last_run_at: startedAt,
        last_success_at: startedAt,
        last_error: null,
        metadata: { inserted: 0, linked: 0, updated: 0, skipped: 0, fetched: 0 },
      });
      return { inserted: 0, linked: 0, updated: 0, skipped: 0, fetched: 0 };
    }

    const [existing, users] = await Promise.all([
      db.getAllClients(),
      db.getActiveUsers(),
    ]);

    const byBhId = new Map();
    const byName = new Map();
    for (const c of existing) {
      if (c.bullhorn_client_id != null) byBhId.set(Number(c.bullhorn_client_id), c);
      byName.set(normalizeName(c.name), c);
    }

    const emailToUserId = new Map();
    for (const u of users) {
      if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
    }

    const toInsert = [];
    const toUpdate = [];
    let skipped = 0;

    for (const corp of bhCorps) {
      const bhId = corp.id;
      const bhName = (corp.name || '').trim();
      if (!bhId || !bhName) {
        skipped++;
        continue;
      }

      // ClientCorporation.owners is a TO_MANY collection. Take the first owner's
      // email (or fall back to corp.owner if Bullhorn ever returns it singular).
      const ownerEmail = (corp.owners?.data?.[0]?.email
        || corp.owners?.[0]?.email
        || corp.owner?.email
        || '').toLowerCase();
      const mappedUserId = ownerEmail ? emailToUserId.get(ownerEmail) || null : null;

      const linked = byBhId.get(Number(bhId));
      if (linked) {
        if (linked.name !== bhName) {
          toUpdate.push({ id: linked.id, name: bhName });
        } else {
          skipped++;
        }
        continue;
      }

      const nameMatch = byName.get(normalizeName(bhName));
      if (nameMatch && nameMatch.bullhorn_client_id == null) {
        const update = { id: nameMatch.id, bullhorn_client_id: bhId, _wasUnlinked: true };
        if (!nameMatch.created_by && mappedUserId) update.created_by = mappedUserId;
        toUpdate.push(update);
        continue;
      }

      if (nameMatch && nameMatch.bullhorn_client_id != null) {
        // Same name but already linked to a different Bullhorn corp — skip
        // rather than create a duplicate or hijack the existing link.
        skipped++;
        continue;
      }

      toInsert.push({
        name: bhName,
        bullhorn_client_id: bhId,
        created_by: mappedUserId,
      });
    }

    const result = await db.bulkSyncBullhornClients(toInsert, toUpdate);
    const finishedAt = new Date().toISOString();

    const metadata = {
      inserted: result.inserted,
      linked: result.linked,
      updated: result.updated,
      skipped,
      fetched: bhCorps.length,
    };

    await db.upsertSyncState(SYNC_KEY, {
      last_run_at: startedAt,
      last_success_at: finishedAt,
      last_error: null,
      metadata,
    });

    return metadata;
  } catch (err) {
    console.error('[orgflowSync] sync failed:', err.message);
    await db.upsertSyncState(SYNC_KEY, {
      last_run_at: startedAt,
      last_error: err.message,
    }).catch(() => {});
    throw err;
  } finally {
    isRunning = false;
  }
}

module.exports = { syncBullhornClients };

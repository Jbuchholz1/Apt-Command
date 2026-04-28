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
const { getActiveClientCorporations, getClientContactsForCorps } = require('./bullhorn');

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
      // Even with no client changes, run the contact sync — newly-linked
      // clients from a prior run may still need their contacts pulled in.
      const contactResult = await syncBullhornContacts();
      const metadata = {
        inserted: 0, linked: 0, updated: 0, skipped: 0, fetched: 0,
        ...contactResult,
      };
      await db.upsertSyncState(SYNC_KEY, {
        last_run_at: startedAt,
        last_success_at: startedAt,
        last_error: null,
        metadata,
      });
      return metadata;
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

    // Pull contacts for every linked client (this run's freshly-linked rows
    // included). Running it after the client upsert means new/linked corps
    // are visible to the contact sync via getAllClientsLinkedToBullhorn().
    const contactResult = await syncBullhornContacts();
    const finishedAt = new Date().toISOString();

    const metadata = {
      inserted: result.inserted,
      linked: result.linked,
      updated: result.updated,
      skipped,
      fetched: bhCorps.length,
      ...contactResult,
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

// Pulls every active Bullhorn ClientContact for the linked Org Flow clients
// and inserts new ones as employees rows. Skip dedupe is two-tiered:
//   1. bullhorn_contact_id already present (per-tenant Bullhorn id)
//   2. (client_id, lower(email)) already present — catches manually-typed
//      contacts so the sync links them by id rather than duplicating.
// Manager hierarchy is left blank (reports_to_id = null) — APT's tenant
// doesn't expose reportsTo to this MCP key, and the user wants new cards
// to land "disconnected" so they can be wired up via OrgChart drag/drop.
async function syncBullhornContacts() {
  const linked = await db.getAllClientsLinkedToBullhorn();
  if (linked.length === 0) {
    return { contactsFetched: 0, contactsInserted: 0, contactsSkipped: 0 };
  }

  // Use String() on both sides of the lookup. Supabase returns bigint
  // columns as strings (to preserve precision); Bullhorn returns ids as
  // numbers in JSON. Map uses strict equality, so mixing types misses.
  const corpToClient = new Map();
  for (const c of linked) corpToClient.set(String(c.bullhorn_client_id), c.id);

  const existing = await db.getEmployeesForClientIds(linked.map(c => c.id));
  const existingByBhId = new Set();
  const existingByClientEmail = new Set();
  for (const e of existing) {
    if (e.bullhorn_contact_id != null) existingByBhId.add(String(e.bullhorn_contact_id));
    if (e.email) existingByClientEmail.add(`${e.client_id}::${e.email.toLowerCase().trim()}`);
  }

  const corpIds = [...corpToClient.keys()];
  const CHUNK = 20;
  const toInsert = [];
  let fetched = 0;
  let skipped = 0;

  let loggedSample = false;
  for (let i = 0; i < corpIds.length; i += CHUNK) {
    const chunk = corpIds.slice(i, i + CHUNK);
    const result = await getClientContactsForCorps(chunk);

    if (result?.message && !Array.isArray(result?.data)) {
      throw new Error(`Bullhorn returned non-JSON for contacts: ${String(result.message).slice(0, 400)}`);
    }
    const contacts = result?.data || [];
    fetched += contacts.length;
    if (contacts.length === 500) {
      console.warn('[orgflowSync] contact chunk hit count=500 — possible truncation', { chunkSize: chunk.length });
    }
    if (!loggedSample && contacts[0]) {
      loggedSample = true;
      console.log('[orgflowSync] sample contact shape:',
        JSON.stringify(contacts[0]).slice(0, 400),
        '| corpToClient sample keys:',
        [...corpToClient.keys()].slice(0, 5).join(','));
    }

    for (const c of contacts) {
      const bhId = c.id;
      // ClientContact.clientCorporation can come back as a nested object
      // ({id, name}), as a bare numeric id, or as a string id depending on
      // the Bullhorn response shape. Handle all three.
      const cc = c.clientCorporation;
      const corpId = (cc && typeof cc === 'object') ? (cc.id ?? cc) : cc;
      const orgFlowClientId = corpId != null ? corpToClient.get(String(corpId)) : null;
      if (!bhId || !orgFlowClientId) { skipped++; continue; }
      if (existingByBhId.has(String(bhId))) { skipped++; continue; }

      const email = (c.email || '').toLowerCase().trim();
      if (email && existingByClientEmail.has(`${orgFlowClientId}::${email}`)) {
        skipped++;
        continue;
      }

      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim()
        || c.email
        || `Contact ${bhId}`;

      toInsert.push({
        client_id: orgFlowClientId,
        name: fullName,
        email: c.email || null,
        bullhorn_contact_id: bhId,
      });
      // Update dedupe sets so a duplicate within this same run can't slip in
      // (the same contact can ride along multiple chunks if a client got moved).
      existingByBhId.add(String(bhId));
      if (email) existingByClientEmail.add(`${orgFlowClientId}::${email}`);
    }
  }

  if (toInsert.length > 0) {
    await db.bulkInsertEmployees(toInsert);
  }

  console.log('[orgflowSync] contacts:', { fetched, inserted: toInsert.length, skipped });
  return { contactsFetched: fetched, contactsInserted: toInsert.length, contactsSkipped: skipped };
}

module.exports = { syncBullhornClients, syncBullhornContacts };

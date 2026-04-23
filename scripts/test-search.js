// Test harness for POST /api/search.
//
// HOW TO GET THE ACCESS TOKEN:
//   1. Open the Digital Req Board in your browser and sign in.
//   2. DevTools (F12) → Application → Session Storage → select the app origin.
//   3. Find an MSAL entry whose key contains "accessToken" AND the search
//      scopes (Files.Read.All, Mail.Read, etc.) — NOT the one for User.Read
//      or Calendars.Read alone. Copy its `secret` value.
//   4. Paste below into ACCESS_TOKEN.
//
// Also paste an ID token so the /api/search route's requireAuth middleware
// accepts the request. Same Session Storage, find an MSAL entry with
// "idToken" in the key. (In local dev without AZURE_TENANT_ID configured,
// requireAuth is a no-op, so ID_TOKEN can be left empty.)
//
// Run with:
//   node scripts/test-search.js

const ACCESS_TOKEN = 'PASTE_GRAPH_ACCESS_TOKEN_HERE';
const ID_TOKEN = 'PASTE_ID_TOKEN_HERE'; // leave '' if backend auth is skipped in dev
const QUERY = 'test';
const PORT = 3001;

async function run() {
  const headers = { 'Content-Type': 'application/json' };
  if (ID_TOKEN) headers['Authorization'] = `Bearer ${ID_TOKEN}`;

  console.log(`\n--- First request (cache miss) ---`);
  await hit(headers);

  console.log(`\n--- Second request (cache hit — should be faster) ---`);
  await hit(headers);

  console.log(`\n--- Validation: query "a" (should 400) ---`);
  await hit(headers, { query: 'a' });

  console.log(`\n--- Validation: no accessToken (should 400) ---`);
  await hit(headers, { accessToken: '' });
}

async function hit(headers, overrides = {}) {
  const body = {
    query: QUERY,
    accessToken: ACCESS_TOKEN,
    ...overrides,
  };

  try {
    const res = await fetch(`http://localhost:${PORT}/api/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log(`status: ${res.status}`);
      console.log(text);
      return;
    }

    const data = await res.json();
    console.log(`status: ${res.status}`);
    console.log(`total: ${data.totalCount}  duration: ${data.durationMs}ms  errors: ${JSON.stringify(data.errors)}`);
    for (const [type, items] of Object.entries(data.results)) {
      if (!items.length) continue;
      console.log(`  ${type.toUpperCase()} (${items.length}):`);
      items.slice(0, 3).forEach(i => {
        const title = (i.title || '').slice(0, 70);
        const subtitle = (i.subtitle || '').slice(0, 50);
        console.log(`    - ${title}  |  ${subtitle}`);
      });
    }
  } catch (err) {
    console.error('request failed:', err.message);
  }
}

run();

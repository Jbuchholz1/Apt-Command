import { useEffect, useState } from 'react';
import { getUsers, getRecruiters, getAccountManagers } from './api';

// Module-scoped cache so multiple components mounting at once share a single
// fetch. The user lists rarely change during a session; a page refresh /
// re-login on the next visit naturally re-fetches.
const cache = {
  users: null,
  recruiters: null,
  accountManagers: null,
};
let inFlight = null;
const subscribers = new Set();

function notify() {
  for (const cb of subscribers) cb();
}

async function loadAll() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [usersRes, recruitersRes, accountManagersRes] = await Promise.all([
        getUsers().catch(() => ({ data: [] })),
        getRecruiters().catch(() => ({ data: [] })),
        getAccountManagers().catch(() => ({ data: [] })),
      ]);
      cache.users = usersRes?.data || [];
      cache.recruiters = recruitersRes?.data || [];
      cache.accountManagers = accountManagersRes?.data || [];
      notify();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useUserLookups() {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force(n => n + 1);
    subscribers.add(cb);
    if (cache.users === null) loadAll();
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return {
    users: cache.users || [],
    recruiters: cache.recruiters || [],
    accountManagers: cache.accountManagers || [],
    ready: cache.users !== null,
  };
}

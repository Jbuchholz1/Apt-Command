import { useEffect, useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { getSearchAccessToken } from '../lib/graphClient';
import { searchUniversal } from '../lib/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

const EMPTY_RESULTS = {
  person: [],
  job: [],
  candidate: [],
  file: [],
  email: [],
  event: [],
};

export function useSearch(query) {
  const { instance, accounts } = useMsal();
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [errors, setErrors] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    const trimmed = (query || '').trim();
    if (trimmed.length < MIN_QUERY) {
      if (abortRef.current) abortRef.current.abort();
      setResults(EMPTY_RESULTS);
      setIsLoading(false);
      setError(null);
      setTotalCount(0);
      setDurationMs(0);
      setErrors([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const account = accounts[0];
        if (!account) throw new Error('Not signed in');
        const accessToken = await getSearchAccessToken(instance, account);
        if (controller.signal.aborted) return;
        const data = await searchUniversal({ query: trimmed, accessToken, signal: controller.signal });
        if (controller.signal.aborted) return;
        setResults(data.results || EMPTY_RESULTS);
        setTotalCount(data.totalCount || 0);
        setDurationMs(data.durationMs || 0);
        setErrors(data.errors || []);
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setError(err?.message || 'Search failed');
        setResults(EMPTY_RESULTS);
        setTotalCount(0);
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, instance, accounts]);

  return { results, isLoading, error, totalCount, durationMs, errors };
}

import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Real-time polling hook for dashboard updates
 * @param {Function} fetchFn - Async function that returns data
 * @param {number} intervalMs - Poll interval in milliseconds (default 4000)
 * @returns {Object} { data, loading, error, lastUpdated, refresh }
 */
export function useRealTimePolling(fetchFn, intervalMs = 4000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      if (isMountedRef.current) {
        setData(result);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err?.message || 'Failed to fetch data');
        console.error('[useRealTimePolling]', err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn]);

  // Initial fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up polling interval
  useEffect(() => {
    timerRef.current = setInterval(fetchData, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData, intervalMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

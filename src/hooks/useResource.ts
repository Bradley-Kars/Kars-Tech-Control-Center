import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared data-fetching hook.
 *
 * This replaces the fetch/loading/error/setInterval block that was duplicated
 * across ~10 page components. The contract every page actually relied on:
 *
 *  - one initial load gate that stays true until *every* loader has settled
 *  - per-resource failure isolation ("partial success is better than nothing")
 *    but without nulling out data that was previously fetched successfully
 *  - a refresh interval that is torn down on unmount / dep change
 *  - a manual refresh handle
 *  - a lastUpdated timestamp for staleness display
 */

export type ResourceLoaders = Record<string, () => Promise<unknown>>;

export type ResourceData<T extends ResourceLoaders> = {
  [K in keyof T]: Awaited<ReturnType<T[K]>> | null;
};

/** Internal alias so the state setter casts stay readable. */
export type ErrorMap<T extends ResourceLoaders> = Partial<Record<keyof T, string>>;

export interface ResourceState<T extends ResourceLoaders> {
  data: ResourceData<T>;
  /** True until every loader has settled at least once. */
  loading: boolean;
  /** True while a background (non-initial) refresh is in flight. */
  refreshing: boolean;
  errors: ErrorMap<T>;
  lastUpdated: number | null;
  refresh: () => void;
}

export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useResource<T extends ResourceLoaders>(
  loaders: T,
  deps: React.DependencyList,
  intervalMs = 0,
): ResourceState<T> {
  const keys = Object.keys(loaders) as (keyof T)[];
  const [data, setData] = useState<ResourceData<T>>({} as ResourceData<T>);
  const [errors, setErrors] = useState<ErrorMap<T>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Keep the latest loaders without making them part of the effect deps —
  // callers pass inline closures, which would otherwise re-run every render.
  const loadersRef = useRef(loaders);
  loadersRef.current = loaders;

  // Whether an initial (all-at-once) publish has already happened. Manual
  // refreshes reuse the same flag so a refresh can never re-open the gate.
  const publishedRef = useRef(false);
  const mountedRef = useRef(true);

  const run = useCallback(async (isInitial: boolean) => {
    const current = loadersRef.current;
    if (!isInitial) setRefreshing(true);

    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await current[key]();
          return { key, ok: true as const, value };
        } catch (err) {
          return { key, ok: false as const, message: errorMessage(err) };
        }
      }),
    );

    if (!mountedRef.current) return;

    if (isInitial) {
      // First load: publish everything in one commit so pages don't flash
      // half-populated state, then release the gate.
      const nextData: Record<string, unknown> = {};
      const nextErrors: Record<string, string> = {};
      for (const entry of entries) {
        // Failed resources are published as null so the declared
        // `T[K] | null` type is actually true — consumers can rely on
        // `data.x === null` rather than having to handle undefined too.
        if (entry.ok) nextData[entry.key as string] = entry.value;
        else {
          nextData[entry.key as string] = null;
          nextErrors[entry.key as string] = entry.message;
        }
      }
      setData(nextData as ResourceData<T>);
      setErrors(nextErrors as ErrorMap<T>);
      setLastUpdated(Date.now());
      setLoading(false);
      publishedRef.current = true;
    } else {
      // Background refresh: only touch what actually changed, and never
      // discard good data because one endpoint hiccuped.
      setData((prev) => {
        const next: Record<string, unknown> = { ...(prev as Record<string, unknown>) };
        let changed = false;
        for (const entry of entries) {
          if (entry.ok) {
            next[entry.key as string] = entry.value;
            changed = true;
          }
        }
        return changed ? (next as ResourceData<T>) : prev;
      });
      setErrors((prev) => {
        // A loader that succeeds this round has its error cleared; one that
        // fails keeps (or gains) an error. Identical results return `prev`
        // so we don't churn identity on every interval tick.
        const next: Record<string, string> = {};
        for (const entry of entries) {
          if (!entry.ok) next[entry.key as string] = entry.message;
        }
        const prevRec = prev as Record<string, string | undefined>;
        const a = Object.keys(prevRec);
        const b = Object.keys(next);
        const same = a.length === b.length && a.every((k) => prevRec[k] === next[k]);
        return same ? prev : (next as ErrorMap<T>);
        });
        if (entries.some((e) => e.ok)) setLastUpdated(Date.now());
      }

    setRefreshing(false);
  }, [keys.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    publishedRef.current = false;
    setLoading(true);
    setData({} as ResourceData<T>);
    setErrors({});

    void run(true);

    if (intervalMs > 0) {
      const id = setInterval(() => void run(false), intervalMs);
      return () => {
        clearInterval(id);
        mountedRef.current = false;
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, [run, intervalMs, ...deps]);

  const refresh = useCallback(() => {
    void run(!publishedRef.current);
  }, [run]);

  return { data, loading, refreshing, errors, lastUpdated, refresh };
}

export default useResource;

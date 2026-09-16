import { getDataVersion } from "@/data";

/**
 * Memoisation for the stat helpers.
 *
 * Several of them walk all fifteen seasons on every call — `getManagerStats`
 * alone did three full passes before H2 — and nothing cached any of it, so
 * navigating Managers → a manager → back recomputed the league from scratch
 * each time.
 *
 * Two things make this safe rather than a stale-data generator:
 *
 *   1. **Versioned.** `seasons` is a synchronous view that fills in as chunks
 *      load (A2a), so a value derived from it is only valid for the data that
 *      existed when it was computed. Every key carries the data version, so a
 *      result computed while only one season was loaded can never be served
 *      after the rest arrive — it simply misses.
 *   2. **Bounded, per function.** Each wrapped function gets its own LRU with
 *      its own limit, because the right bound depends entirely on what is
 *      being stored. `getManagerStats` returns roughly 300 KB per manager per
 *      mode, so it holds a dozen; `getAllTimeH2HRecord` returns a handful of
 *      numbers but is called for all 272 pairings at once, so it needs to hold
 *      more than that or it thrashes and caches nothing. Measured: with a
 *      shared 24-entry cache, H2H went 6ms cold to 5ms warm — no benefit at
 *      all, because every entry was evicted before it could be reused.
 *
 * The cached functions must be pure with respect to `seasons`. They are: they
 * read it and return new objects. `getCumulativeStandings` used to sort it in
 * place, which H6 fixed — that bug would have been considerably worse with a
 * cache in front of it.
 */

const stores: Map<string, unknown>[] = [];

/** Drop everything. Exported for tests; production relies on the version key. */
export const clearStatCache = (): void => stores.forEach((s) => s.clear());

/** Total entries held across every cache. Exported for tests. */
export const statCacheSize = (): number =>
  stores.reduce((total, s) => total + s.size, 0);

/**
 * Wrap a pure function of `seasons` so repeated calls with the same arguments
 * are served from memory until the underlying data changes.
 *
 * `name` disambiguates functions whose arguments would otherwise collide.
 * `maxEntries` bounds this function's own cache — size it to what the callers
 * actually ask for in one pass, or the cache evicts faster than it is read.
 */
export const memoiseOverSeasons = <Args extends readonly unknown[], Result>(
  name: string,
  fn: (...args: Args) => Result,
  maxEntries = 24
): ((...args: Args) => Result) => {
  const store = new Map<string, unknown>();
  stores.push(store);

  return (...args: Args): Result => {
    const key = `${name}|${getDataVersion()}|${JSON.stringify(args)}`;

    if (store.has(key)) {
      // Refresh recency: delete and re-insert moves it to the end of the Map's
      // insertion order, which is what makes the eviction below an LRU.
      const hit = store.get(key) as Result;
      store.delete(key);
      store.set(key, hit);
      return hit;
    }

    const result = fn(...args);
    store.set(key, result);

    while (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }

    return result;
  };
};

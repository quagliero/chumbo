import {
  getPrecomputedStats,
  loadPrecomputedStats,
  type PrecomputedStat,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";
import { DataLoadFailedError, getPrecomputedFailure } from "@/data/loadFailure";

/**
 * The build-time stat answers, suspending until they are in (A4).
 *
 * Same shape as the season hooks in `useSeasonData`: throw the in-flight
 * promise and let the `<Suspense>` boundary in `App.tsx` show its spinner.
 *
 * Deliberately does NOT fall back to computing the stats live. The fallback
 * would be a silent ~550 kB download of every matchup and transaction, which is
 * the exact cost this file exists to avoid — so a missing file should be a
 * visible error, not a slow page nobody investigates. The file is committed, so
 * in practice it is there; if it is not, run `yarn build-aggregates`.
 */
export const usePrecomputedStats = (): PrecomputedStats => {
  const loaded = getPrecomputedStats();
  if (!loaded) {
    const failed = getPrecomputedFailure();
    if (failed) throw new DataLoadFailedError(failed);
    throw loadPrecomputedStats();
  }
  return loaded;
};

/** One stat by id, or undefined if it is not in the file. */
export const usePrecomputedStat = (id: string): PrecomputedStat | undefined =>
  usePrecomputedStats().stats.find((stat) => stat.id === id);

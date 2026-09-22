import type { StatDefinition, StatEntry } from "./types";
import {
  forgetPrecomputedFailure,
  recordPrecomputedFailure,
} from "@/data/loadFailure";

/**
 * The build-time answers (A4).
 *
 * Every stat is a question about all of history, so answering one in the
 * browser means first downloading all of history — 305 kB gzip of matchups and
 * 243 kB of transactions — to produce a few kB of answer. `yarn
 * build-aggregates` runs the same registry at build time and writes the answers
 * here, so a page can render from a 19 kB file instead of the whole archive.
 *
 * This type is the contract between the generator and the client: the script
 * imports it too, so the two cannot drift.
 */

/** Bump when the shape changes, so a stale cached file is detectable. */
export const PRECOMPUTED_VERSION = 1;

export interface PrecomputedStat
  extends Pick<
    StatDefinition,
    "id" | "label" | "description" | "scope" | "format" | "direction"
  > {
  /** Seasons this stat cannot see at all (`requiresBench`). */
  excluded: number[];
  /** Seasons it includes, but whose bench scores are incomplete. */
  caveat: number[];
  /**
   * How many entries the stat has in full, before the cap. Kept so a page can
   * say "top 25 of 2,460" rather than implying the list is complete.
   */
  total: number;
  entries: StatEntry[];
}

export interface PrecomputedStats {
  version: number;
  generatedAt: string;
  years: number[];
  /** How many entries per stat were kept. */
  limit: number;
  stats: PrecomputedStat[];
}

export const PRECOMPUTED_URL = "/data/all-time.json";

/**
 * Each record's top three in every season, for the record pages.
 *
 * Its own file because `all-time.json` keeps only each list's top 25 — a
 * season's best entries are mostly not in it — and because the home page and
 * every matchup page fetch that one, and have no use for this. Only lists
 * whose entries belong to a season are here; a career total or a manager's
 * all-time run has no "best of 2017".
 */
export const SEASON_TOPS_URL = "/data/records-by-season.json";
export const SEASON_TOP = 3;

export interface SeasonTops {
  version: number;
  /** The season still being played, whose lists are "so far"; absent in the off-season. */
  live?: number;
  /** stat id -> season -> its best entries that season, best first. */
  stats: Record<string, Record<string, StatEntry[]>>;
}

let cache: PrecomputedStats | null = null;
let inFlight: Promise<PrecomputedStats> | null = null;

/** Parsed and version-checked, or a rejected promise. Deduped and cached. */
export const loadPrecomputedStats = (): Promise<PrecomputedStats> => {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = fetch(PRECOMPUTED_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`${PRECOMPUTED_URL} responded ${response.status}`);
      }
      return response.json();
    })
    .then((data: PrecomputedStats) => {
      if (data?.version !== PRECOMPUTED_VERSION) {
        // A cached copy from an older deploy. Better to say so than to render
        // fields that may have moved.
        throw new Error(
          `${PRECOMPUTED_URL} is version ${data?.version}, expected ${PRECOMPUTED_VERSION}`
        );
      }
      cache = data;
      forgetPrecomputedFailure();
      return data;
    })
    // Remembered, so the one hook that suspends on this file can show the
    // failure instead of retrying on every render — see `DataLoadFailedError`
    // in `@/data`. Its own record, not the season loader's: the narrative
    // notes read this file without suspending, and a garnish that failed must
    // not turn a later, perfectly downloadable season read into an error.
    .catch(recordPrecomputedFailure)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/** Synchronous accessor for anything that has already suspended on the load. */
export const getPrecomputedStats = (): PrecomputedStats | null => cache;

/** Test seam: forget the cached file. */
export const resetPrecomputedStats = () => {
  cache = null;
  inFlight = null;
};

import type { StatDefinition, StatEntry } from "./types";

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
  /** Seasons this stat cannot see at all (`requiresLineups`). */
  excluded: number[];
  /** Seasons it includes, but whose per-player data is reconstructed. */
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
      return data;
    })
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

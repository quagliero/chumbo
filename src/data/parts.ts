/**
 * Which load unit each file of a season belongs to (A2b).
 *
 * Read by two things that have to agree: `src/data/index.ts`, which loads a
 * season a part at a time, and `vite.config.ts`, which puts each part of each
 * season in a chunk of its own — `core-2014`, `draft-2014`, and so on. If
 * they disagreed, loading 2014's core would fetch whatever chunk Rollup had
 * put rosters.json in, and the network tab would stop meaning anything.
 *
 * The split is by who reads what. `core` is what a standings table needs,
 * which is what the landing page is; the draft is only read by the draft
 * board, the player pages and a handful of stats, and is ~40 kB gzipped
 * across the fifteen seasons that the landing page therefore never fetches.
 * Matchups and transactions are per-week files, kept as their own parts
 * since A2a.
 *
 * No imports, so the Vite config can load it before anything else exists.
 */
export const SEASON_FILE_PARTS = {
  league: "core",
  rosters: "core",
  users: "core",
  winners_bracket: "core",
  losers_bracket: "core",
  schedule: "core",
  draft: "draft",
  picks: "draft",
  matchups: "matchups",
  transactions: "transactions",
} as const;

export type SeasonFile = keyof typeof SEASON_FILE_PARTS;

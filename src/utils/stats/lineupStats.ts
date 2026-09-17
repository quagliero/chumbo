import type { StatDefinition } from "./types";

/**
 * Lineup records — what getOptimalLineup can already tell us (C2).
 *
 * Follow the pattern in `matchupStats.ts`: each stat is a `defineStat` call
 * that filters and maps `context.games` — the flattened team-week list — and
 * never walks the seasons itself.
 */

// Registered stats go here. The module is imported for its side effects in
// index.ts, so a stat exists as soon as it is defined.
export const lineupStats: StatDefinition[] = [];

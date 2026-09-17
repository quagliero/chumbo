import { hasApproximateLineups } from "@/domain/dataQuality";
import { memoiseOverSeasons } from "@/utils/cache";
import { getStatContext } from "./traverse";
import type { StatDefinition, StatEntry } from "./types";

/**
 * The stat registry (C1).
 *
 * Adding a statistic should be one file and one line here — not a change to
 * the records page, the Explorer, the narrative engine, the share cards and
 * the build-time precompute, each wired by hand. Everything that wants to
 * present a statistic reads it from here instead.
 */

const definitions = new Map<string, StatDefinition>();

/** Register a stat. Ids are unique; a clash is a mistake, so it throws. */
export const defineStat = (definition: StatDefinition): StatDefinition => {
  if (definitions.has(definition.id)) {
    throw new Error(`Duplicate stat id: ${definition.id}`);
  }
  definitions.set(definition.id, definition);
  return definition;
};

/** Every registered stat, in registration order. */
export const allStats = (): StatDefinition[] => [...definitions.values()];

export const getStat = (id: string): StatDefinition | undefined =>
  definitions.get(id);

/**
 * Run a stat and return its entries, ranked.
 *
 * Two things happen here rather than in each stat, so that neither can be
 * forgotten twenty times over:
 *
 *   1. Seasons with reconstructed lineups are filtered out for any stat that
 *      declares `requiresLineups`. 2019's team scores are correct but its
 *      per-player breakdown is inferred, and an inferred score must not win
 *      "worst start/sit in Chumbo history".
 *   2. Sorting by the stat's own `direction`, so a stat's `compute` returns
 *      entries and does not also have to remember which end is interesting.
 */
const runStat = (id: string, limit?: number): StatEntry[] => {
  const definition = definitions.get(id);
  if (!definition) return [];

  const context = getStatContext();
  const games = definition.requiresLineups
    ? context.games.filter((game) => !game.lineupsApproximate)
    : context.games;

  const entries = definition.compute({ ...context, games });
  const ranked = [...entries].sort((a, b) =>
    definition.direction === "high" ? b.value - a.value : a.value - b.value
  );

  return limit ? ranked.slice(0, limit) : ranked;
};

/** Memoised: the records pages ask for the same stats on every render. */
export const computeStat = memoiseOverSeasons("computeStat", runStat, 64);

/** The seasons a `requiresLineups` stat cannot see, for showing as a caveat. */
export const excludedSeasons = (definition: StatDefinition): number[] =>
  definition.requiresLineups
    ? getStatContext()
        .years.filter(hasApproximateLineups)
        .sort((a, b) => a - b)
    : [];

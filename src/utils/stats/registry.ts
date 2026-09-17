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
  if (definition.requiresLineups && definition.allowsApproximateLineups) {
    throw new Error(
      `${definition.id}: requiresLineups and allowsApproximateLineups are opposites`
    );
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
  // Filter BOTH lists. `teamWeeks` is a superset of `games`, so filtering only
  // one lets the excluded seasons back in through the other — which is exactly
  // what happened when teamWeeks was introduced, and what the C2 test caught.
  const keep = (game: { lineupsApproximate: boolean }) =>
    !definition.requiresLineups || !game.lineupsApproximate;

  const computed = definition.compute({
    ...context,
    games: context.games.filter(keep),
    teamWeeks: context.teamWeeks.filter(keep),
  });

  // A stat that tolerates a reconstruction still has to say which of its
  // entries rest on one. Doing it here rather than in each stat means an entry
  // cannot be presented as a flat fact just because its stat forgot to mark it.
  const entries = definition.allowsApproximateLineups
    ? computed.map((entry) =>
        entry.year !== undefined && hasApproximateLineups(entry.year)
          ? { ...entry, approximate: true }
          : entry
      )
    : computed;

  const ranked = [...entries].sort((a, b) =>
    definition.direction === "high" ? b.value - a.value : a.value - b.value
  );

  return limit ? ranked.slice(0, limit) : ranked;
};

/** Memoised: the records pages ask for the same stats on every render. */
export const computeStat = memoiseOverSeasons("computeStat", runStat, 64);

const approximateSeasons = (): number[] =>
  getStatContext()
    .years.filter(hasApproximateLineups)
    .sort((a, b) => a - b);

/** The seasons a `requiresLineups` stat cannot see, for showing as a caveat. */
export const excludedSeasons = (definition: StatDefinition): number[] =>
  definition.requiresLineups ? approximateSeasons() : [];

/**
 * The seasons a stat includes but whose per-player data is reconstructed, for
 * showing as a caveat. The counterpart to `excludedSeasons`: one names what is
 * missing, the other what is present but inferred.
 */
export const caveatSeasons = (definition: StatDefinition): number[] =>
  definition.allowsApproximateLineups ? approximateSeasons() : [];

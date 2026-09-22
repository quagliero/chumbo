import { hasIncompleteBench } from "@/domain/dataQuality";
import { memoiseOverSeasons } from "@/utils/cache";
import { getStatContext, getTimelineVersion } from "./traverse";
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
  if (definition.requiresBench && definition.allowsIncompleteBench) {
    throw new Error(
      `${definition.id}: requiresBench and allowsIncompleteBench are opposites`
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
 *   1. Seasons with an incomplete bench are filtered out for any stat that
 *      declares `requiresBench`. 2019's scores and starters are correct but 65
 *      of its bench players have no score, and a missing score must not win
 *      "worst start/sit in Chumbo history".
 *   2. Sorting by the stat's own `direction`, so a stat's `compute` returns
 *      entries and does not also have to remember which end is interesting.
 *
 * The third argument is the timeline version, and it is there for the cache
 * key alone: `memoiseOverSeasons` keys on the season data's version, which
 * does not move when the weekly timelines are provided or withdrawn.
 */
const runStat = (id: string, limit?: number, _timelines?: number): StatEntry[] => {
  const definition = definitions.get(id);
  if (!definition) return [];

  const context = getStatContext();
  // Filter BOTH lists. `teamWeeks` is a superset of `games`, so filtering only
  // one lets the excluded seasons back in through the other — which is exactly
  // what happened when teamWeeks was introduced, and what the C2 test caught.
  const keep = (game: { benchIncomplete: boolean }) =>
    !definition.requiresBench || !game.benchIncomplete;

  // A stat about the play-by-play cannot be answered from season data alone,
  // and an empty list is indistinguishable from "the league has no comebacks".
  // Say what is missing instead — see `provideTimelines` in `./traverse`.
  if (definition.requiresTimelines && context.flows.length === 0) {
    throw new Error(
      `${definition.id} needs the weekly timelines: call provideTimelines() ` +
        `after loadAllWeeks() before computing it.`
    );
  }

  const computed = definition.compute({
    ...context,
    games: context.games.filter(keep),
    teamWeeks: context.teamWeeks.filter(keep),
    flows: context.flows.filter((flow) => keep(flow.game)),
  });

  // A stat that tolerates a reconstruction still has to say which of its
  // entries rest on one. Doing it here rather than in each stat means an entry
  // cannot be presented as a flat fact just because its stat forgot to mark it.
  const entries = definition.allowsIncompleteBench
    ? computed.map((entry) =>
        entry.year !== undefined && hasIncompleteBench(entry.year)
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
const memoisedStat = memoiseOverSeasons("computeStat", runStat, 64);

export const computeStat = (id: string, limit?: number): StatEntry[] =>
  memoisedStat(id, limit, getTimelineVersion());

const approximateSeasons = (): number[] =>
  getStatContext()
    .years.filter(hasIncompleteBench)
    .sort((a, b) => a - b);

/** The seasons a `requiresBench` stat cannot see, for showing as a caveat. */
export const excludedSeasons = (definition: StatDefinition): number[] =>
  definition.requiresBench ? approximateSeasons() : [];

/**
 * The seasons a stat includes but whose bench scores are incomplete, for
 * showing as a caveat. The counterpart to `excludedSeasons`: one names what is
 * missing, the other what is present but incomplete.
 */
export const caveatSeasons = (definition: StatDefinition): number[] =>
  definition.allowsIncompleteBench ? approximateSeasons() : [];

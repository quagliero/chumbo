import { seasons } from "@/data";
import { NOT_RECORDS } from "@/utils/narrative/narrate";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { PRECOMPUTED_VERSION, SEASON_TOP, type SeasonTops } from "./precomputed";
import { allStats, computeStat } from "./registry";
import { getStatContext } from "./traverse";
import type { StatEntry } from "./types";

/**
 * Each record's best entries in every season (`records-by-season.json`).
 *
 * Shared by `build-aggregates`, which writes the file, and the test that
 * fails when it is stale — so the rule for what is in it is written once.
 *
 * A career or a manager's all-time run belongs to no one season, and the
 * rails that are not rankings have no top three, so neither is here.
 */
export const buildSeasonTops = (): SeasonTops => {
  // The newest season with a game in it, if its final has not been played.
  const newest = Math.max(...getStatContext().games.map((game) => game.year));
  const live = Number.isFinite(newest) && !isSeasonSettled(seasons[newest]) ? newest : undefined;
  const tops: SeasonTops = { version: PRECOMPUTED_VERSION, ...(live ? { live } : {}), stats: {} };
  for (const definition of allStats()) {
    if (definition.scope === "manager" || NOT_RECORDS.has(definition.id)) continue;
    const all = computeStat(definition.id);
    if (all.length === 0 || all.some((entry) => entry.year === undefined)) continue;
    const byYear: Record<string, StatEntry[]> = {};
    for (const entry of all) {
      const list = (byYear[String(entry.year)] ??= []);
      if (list.length < SEASON_TOP) list.push(entry);
    }
    tops.stats[definition.id] = byYear;
  }
  return tops;
};

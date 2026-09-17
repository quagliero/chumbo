/**
 * The dice (E5): pick a real game from anywhere in league history.
 *
 * "Real" is doing work in that sentence. Three things can go wrong, and all
 * three land the reader on a blank page, which is worse than no dice at all:
 *
 * 1. **The week was never played.** An in-progress season has matchup files
 *    for weeks that have not happened, and 2026's week 2 would show 0-0.
 *    `isWeekCompleted` is the existing gate for this.
 * 2. **The team had a bye.** From 2020 the playoff weeks carry four rosters
 *    with `matchup_id: null`, and week 18 is null for everyone. A pick has to
 *    be a *pairing*, not a team-week.
 * 3. **The season is not loaded.** A2a made `seasons[year].matchups` lazy, so
 *    reading it without awaiting the season gives an empty object.
 *
 * The scan is therefore split: `playedMatchups` is pure over one loaded
 * season (and is what the test hammers), `findRandomMatchup` handles the
 * loading.
 */

import { loadSeasons, seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup } from "@/types/matchup";
import { isWeekCompleted } from "@/utils/weekUtils";

export interface RandomMatchupTarget {
  year: number;
  week: number;
  matchupId: number;
}

/** The shape of a season this module reads. Structural, so tests can fake one. */
export interface SeasonLike {
  league?: ExtendedLeague;
  matchups?: Record<string, ExtendedMatchup[] | undefined>;
}

/** A source of randomness, so the tests can be deterministic when they want. */
export type Random = () => number;

/**
 * Every game in `season` that was actually played by two teams.
 *
 * A pairing counts when exactly two rosters share a `matchup_id` — three would
 * mean two different brackets reusing an id, and one is a bye — and when their
 * scores are not both zero, which would be an unplayed week that the league's
 * `leg` fields claimed was complete.
 */
export const playedMatchups = (
  year: number,
  season: SeasonLike | undefined
): RandomMatchupTarget[] => {
  if (!season?.matchups) return [];

  const targets: RandomMatchupTarget[] = [];

  for (const [weekKey, entries] of Object.entries(season.matchups)) {
    const week = Number(weekKey);
    if (!Number.isFinite(week) || !entries?.length) continue;
    if (!isWeekCompleted(week, season.league)) continue;

    const sides = new Map<number, ExtendedMatchup[]>();
    for (const entry of entries) {
      if (entry.matchup_id === null || entry.matchup_id === undefined) continue;
      const existing = sides.get(entry.matchup_id);
      if (existing) existing.push(entry);
      else sides.set(entry.matchup_id, [entry]);
    }

    for (const [matchupId, pair] of sides) {
      if (pair.length !== 2) continue;
      const [one, two] = pair;
      if (typeof one.points !== "number" || typeof two.points !== "number") {
        continue;
      }
      if (one.points <= 0 && two.points <= 0) continue;

      targets.push({ year, week, matchupId });
    }
  }

  return targets;
};

/** Uniform pick, or `undefined` for an empty list. */
export const pickOne = <T>(items: T[], random: Random = Math.random): T | undefined =>
  items.length ? items[Math.floor(random() * items.length) % items.length] : undefined;

/** Fisher-Yates, on a copy. */
const shuffled = <T>(items: readonly T[], random: Random): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * A random played matchup from league history, loading exactly the season it
 * lands on.
 *
 * Seasons are tried in shuffled order and the first one with any games wins,
 * rather than loading all fifteen and picking globally — that would fetch
 * ~305 kB of matchup chunks to answer a question about one game. The cost is
 * that a season with fewer played weeks is slightly over-represented, which
 * matters only for the live season and is not worth a round trip to fix.
 */
export const findRandomMatchup = async (
  random: Random = Math.random
): Promise<RandomMatchupTarget | null> => {
  for (const year of shuffled(YEARS, random)) {
    await loadSeasons([year]);
    const pick = pickOne(playedMatchups(year, seasons[year]), random);
    if (pick) return pick;
  }
  return null;
};

/** The route a target points at. */
export const matchupHref = ({ year, week, matchupId }: RandomMatchupTarget) =>
  `/seasons/${year}/matchups/${week}/${matchupId}`;

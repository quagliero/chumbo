import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";

/**
 * `matchups/<week>.json` only exists once a week has been played, so fixtures
 * still to come live exclusively in `schedule.json`. Anything that needs the
 * full regular season — the remaining strength of schedule, the playoff odds
 * simulation — has to merge the two, with the played week winning wherever
 * both exist.
 *
 * Both callers had grown their own copy of this merge (H10). They differ only
 * in the shape they need afterwards, so the merge returns pairings and the
 * caller maps them: `mergeScheduledFixtures` for the pairings alone, or
 * `mergeScheduledMatchups` when full matchup objects are wanted.
 */

type MatchupsByWeek = Record<string, ExtendedMatchup[]>;
type FixturesByWeek = Record<string, ScheduledMatchup[]>;

/**
 * Every regular season pairing we know about, week by week, whether or not it
 * has been played. Played weeks take precedence over the schedule.
 */
export const mergeScheduledFixtures = (
  matchups: MatchupsByWeek | undefined,
  schedule: FixturesByWeek | undefined
): FixturesByWeek => {
  const fixtures: FixturesByWeek = {};

  Object.entries(matchups ?? {}).forEach(([week, weekMatchups]) => {
    fixtures[week] = weekMatchups.map(({ matchup_id, roster_id }) => ({
      matchup_id,
      roster_id,
    }));
  });

  Object.entries(schedule ?? {}).forEach(([week, weekFixtures]) => {
    if (fixtures[week]) return;
    fixtures[week] = weekFixtures;
  });

  return fixtures;
};

/**
 * The same merge, but unplayed fixtures come back as zeroed `ExtendedMatchup`
 * shells so a simulation can treat every week uniformly. A shell scores zero
 * and has no lineup — callers must not read points from a week that has not
 * been played.
 */
export const mergeScheduledMatchups = (
  matchups: MatchupsByWeek | undefined,
  schedule: FixturesByWeek | undefined
): MatchupsByWeek | undefined => {
  if (!matchups || !schedule) return matchups;

  const merged = { ...matchups };
  Object.entries(schedule).forEach(([week, weekFixtures]) => {
    if (merged[week]) return;

    merged[week] = weekFixtures.map(
      (scheduled): ExtendedMatchup => ({
        ...scheduled,
        points: 0,
        starters: [],
        players: [],
        user_id: "",
        custom_points: null,
        starters_points: [],
        players_points: {},
      })
    );
  });

  return merged;
};

import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { hasIncompleteBench } from "@/domain/dataQuality";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  getPlayoffWeekStart,
  isMeaningfulPlayoffGame,
  isPlayoffWeek,
} from "@/utils/playoffUtils";
import { memoiseOverSeasons } from "@/utils/cache";
import { buildGameFlow } from "@/utils/gameFlow";
import type { ExtendedMatchup } from "@/types/matchup";
// Type-only, so the stats never pull the weeks' 229-entry lookup table into a
// page that only wants a record. The files themselves arrive through
// `provideTimelines` below.
import type { TimelineFile } from "@/data/gamedays";
import type { FlowGame, Game, StatContext } from "./types";

/**
 * Flatten every season into one list of team-weeks.
 *
 * Done once and memoised (A3), so twenty stats share one walk of fifteen
 * seasons rather than each doing their own. The memo is versioned against the
 * data loader, so this cannot serve a list built before the seasons finished
 * loading.
 */
/**
 * Build a `Game` from one team's half of a week. `opponent` is null for an
 * eliminated team in a playoff week: it still scored, but there is nobody to
 * have beaten, so margin/result carry no meaning and such entries appear only
 * in `teamWeeks`.
 */
const toGame = ({
  year,
  week,
  matchupId,
  self,
  opponent,
  ownerId,
  opponentOwnerId,
  playoff,
  approximate,
}: {
  year: number;
  week: number;
  matchupId: number;
  self: ExtendedMatchup;
  opponent: ExtendedMatchup | null;
  ownerId: string;
  opponentOwnerId: string;
  playoff: boolean;
  approximate: boolean;
}): Game => {
  const opponentPoints = opponent?.points ?? 0;
  const margin = opponent ? self.points - opponentPoints : 0;

  return {
    year,
    week,
    matchupId,
    rosterId: self.roster_id,
    ownerId,
    managerId: ownerId ? getManagerIdBySleeperOwnerId(ownerId) ?? null : null,
    points: self.points,
    opponentRosterId: opponent?.roster_id ?? -1,
    opponentOwnerId,
    opponentManagerId: opponentOwnerId
      ? getManagerIdBySleeperOwnerId(opponentOwnerId) ?? null
      : null,
    opponentPoints,
    margin,
    result: margin > 0 ? "win" : margin < 0 ? "loss" : "tie",
    isPlayoff: playoff,
    isRegularSeason: !playoff,
    starters: (self.starters ?? []).map(String),
    startersPoints: self.starters_points ?? [],
    playersPoints: self.players_points ?? {},
    players: (self.players ?? []).map(String),
    benchIncomplete: approximate,
    hasOpponent: opponent !== null,
    raw: self,
  };
};

/* ------------------------------------------------------- the week's timelines */

/** A week's scoring timeline, or null where none was built. */
export type TimelineSource = (year: number, week: number) => TimelineFile | null;

let timelines: TimelineSource | null = null;
let timelineVersion = 0;

/**
 * Hand the registry the weekly timelines (L2).
 *
 * They are not season data: each week is its own file, loaded one at a time by
 * the matchup page, and making the stats import them would put a lookup table
 * for 229 weeks in front of every page that shows a record. So whoever wants
 * the timeline records — `build-aggregates` at build time, the test setup —
 * loads them and says so here.
 *
 * Bumps a version so the memoised context below is rebuilt rather than served
 * from before the timelines arrived.
 */
export const provideTimelines = (source: TimelineSource | null): void => {
  timelines = source;
  timelineVersion += 1;
};

/** Which set of timelines is in force. Part of every cache key that uses them. */
export const getTimelineVersion = (): number => timelineVersion;

/**
 * Every game whose week has a timeline, once each: the winner's half, so
 * `flow`'s side 0 is always the team that won — or for a tie (there has been
 * one) the lower roster id's half, with no `decided` at all.
 *
 * Only games are walked, so a team with no opponent cannot appear.
 */
const buildFlows = (games: Game[]): FlowGame[] => {
  if (!timelines) return [];
  const flows: FlowGame[] = [];
  for (const game of games) {
    const tie = game.result === "tie";
    if (game.result === "loss" || (tie && game.rosterId > game.opponentRosterId)) {
      continue;
    }
    const file = timelines(game.year, game.week);
    if (!file) continue;
    const flow = buildGameFlow(file, [game.rosterId, game.opponentRosterId]);
    if (!flow) continue;
    // A win whose timelines end level would be a file missing a team or a
    // correction gone wrong: not a game to tell stories about.
    if (!tie && !flow.decided) continue;
    flows.push({ game, flow });
  }
  return flows;
};

/** `version` is the timeline version: it is the memo key, not an input. */
const buildContext = (_version: number): StatContext => {
  const games: Game[] = [];
  const teamWeeks: Game[] = [];

  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    if (!season?.matchups || !season.rosters) continue;

    const playoffWeekStart = getPlayoffWeekStart(season);
    const approximate = hasIncompleteBench(year);

    const ownerByRoster = new Map<number, string>(
      season.rosters.map((roster) => [roster.roster_id, roster.owner_id])
    );

    const byWeek = season.matchups as unknown as Record<
      string,
      ExtendedMatchup[]
    >;

    for (const [weekKey, weekMatchups] of Object.entries(byWeek)) {
      const week = Number(weekKey);
      if (!Number.isFinite(week) || !weekMatchups?.length) continue;

      // Pair the two halves of each matchup. A null matchup_id means the team
      // did not play that week (a bye, or a non-participant in a playoff week).
      const pairs = new Map<number, ExtendedMatchup[]>();
      for (const matchup of weekMatchups) {
        if (matchup.matchup_id == null) continue;
        const existing = pairs.get(matchup.matchup_id);
        if (existing) existing.push(matchup);
        else pairs.set(matchup.matchup_id, [matchup]);
      }

      // A playoff week counts only its real playoff games: the eliminations
      // and the final. Consolation games, the games for third and fifth, and
      // an eliminated team's idle week are not in league history at all —
      // nobody cares about them, and half the league has stopped setting a
      // valid lineup by then, so a record set in one would be an accident.
      const playoff = isPlayoffWeek(week, playoffWeekStart);
      const counts = (matchup: ExtendedMatchup) =>
        !playoff ||
        (matchup.matchup_id != null &&
          isMeaningfulPlayoffGame(matchup, season, week, playoffWeekStart));

      // Every scored team-week with no opponent. With the playoffs filtered
      // above this is none today, but a regular-season week with an odd team
      // out would land here rather than vanish.
      for (const matchup of weekMatchups) {
        if (matchup.matchup_id != null || !counts(matchup)) continue;
        const ownerId = ownerByRoster.get(matchup.roster_id) ?? "";
        teamWeeks.push(
          toGame({
            year,
            week,
            matchupId: -1,
            self: matchup,
            opponent: null,
            ownerId,
            opponentOwnerId: "",
            playoff: isPlayoffWeek(week, playoffWeekStart),
            approximate,
          })
        );
      }

      for (const [matchupId, pair] of pairs) {
        if (pair.length !== 2 || !pair.every(counts)) continue;

        for (const [self, opponent] of [
          [pair[0], pair[1]],
          [pair[1], pair[0]],
        ] as const) {
          const ownerId = ownerByRoster.get(self.roster_id) ?? "";
          const opponentOwnerId =
            ownerByRoster.get(opponent.roster_id) ?? "";
          const margin = self.points - opponent.points;

          const game: Game = {
            year,
            week,
            matchupId,
            rosterId: self.roster_id,
            ownerId,
            managerId: ownerId
              ? getManagerIdBySleeperOwnerId(ownerId) ?? null
              : null,
            points: self.points,
            opponentRosterId: opponent.roster_id,
            opponentOwnerId,
            opponentManagerId: opponentOwnerId
              ? getManagerIdBySleeperOwnerId(opponentOwnerId) ?? null
              : null,
            opponentPoints: opponent.points,
            margin,
            result: margin > 0 ? "win" : margin < 0 ? "loss" : "tie",
            isPlayoff: playoff,
            isRegularSeason: !playoff,
            // Pre-2016 data stores some starters as names and some ids as
            // numbers; normalise so consumers have one type to handle.
            starters: (self.starters ?? []).map(String),
            startersPoints: self.starters_points ?? [],
            playersPoints: self.players_points ?? {},
            players: (self.players ?? []).map(String),
            benchIncomplete: approximate,
            hasOpponent: true,
            raw: self,
          };
          games.push(game);
          teamWeeks.push(game);
        }
      }
    }
  }

  return {
    games,
    teamWeeks,
    years: [...YEAR_NUMBERS],
    flows: buildFlows(games),
  };
};

const memoisedContext = memoiseOverSeasons(
  "getStatContext",
  buildContext,
  // Two: the one built before the timelines were provided, and the one after.
  2
);

/** Every team-week in league history. Memoised and version-checked. */
export const getStatContext = (): StatContext => memoisedContext(timelineVersion);

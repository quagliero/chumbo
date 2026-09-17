import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { hasApproximateLineups } from "@/domain/dataQuality";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { getPlayoffWeekStart, isPlayoffWeek } from "@/utils/playoffUtils";
import { memoiseOverSeasons } from "@/utils/cache";
import type { ExtendedMatchup } from "@/types/matchup";
import type { Game, StatContext } from "./types";

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
    lineupsApproximate: approximate,
    hasOpponent: opponent !== null,
    raw: self,
  };
};

const buildContext = (): StatContext => {
  const games: Game[] = [];
  const teamWeeks: Game[] = [];

  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    if (!season?.matchups || !season.rosters) continue;

    const playoffWeekStart = getPlayoffWeekStart(season);
    const approximate = hasApproximateLineups(year);

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

      // Every scored team-week, including the ones with no opponent. Once the
      // brackets are set, eliminated teams have matchup_id null for the
      // remaining weeks: no opponent, but they still set a lineup and scored.
      for (const matchup of weekMatchups) {
        if (matchup.matchup_id != null) continue;
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
        if (pair.length !== 2) continue;

        for (const [self, opponent] of [
          [pair[0], pair[1]],
          [pair[1], pair[0]],
        ] as const) {
          const ownerId = ownerByRoster.get(self.roster_id) ?? "";
          const opponentOwnerId =
            ownerByRoster.get(opponent.roster_id) ?? "";
          const margin = self.points - opponent.points;
          const playoff = isPlayoffWeek(week, playoffWeekStart);

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
            lineupsApproximate: approximate,
            hasOpponent: true,
            raw: self,
          };
          games.push(game);
          teamWeeks.push(game);
        }
      }
    }
  }

  return { games, teamWeeks, years: [...YEAR_NUMBERS] };
};

/** Every team-week in league history. Memoised and version-checked. */
export const getStatContext = memoiseOverSeasons(
  "getStatContext",
  buildContext,
  // One entry: there are no arguments, so a second would never be reached.
  1
);

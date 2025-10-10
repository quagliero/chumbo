import { seasons } from "@/data";
import { getTeamName } from "@/utils/teamName";
import {
  calculateWinPercentageAsPercent,
  getRosterPointsFor,
  getRosterPointsAgainst,
} from "@/utils/recordUtils";

export interface TeamStats {
  owner_id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  winPerc: number;
  points_for: number;
  points_for_avg: number;
  points_against: number;
  points_against_avg: number;
  champion: string[];
  runnerUp: string[];
  scoringCrown: string[];
}

export const getCumulativeStandings = (years: number[]) => {
  const teamStats: Record<string, TeamStats> = {};
  Object.entries(seasons).forEach(([year, season]) => {
    if (!years.includes(Number(year))) return;

    const champion = season.winners_bracket.find((x) => x.p === 1)?.w;
    const runnerUp = season.winners_bracket.find((x) => x.p === 1)?.l;
    // Only calculate scoringCrown for completed seasons
    const scoringCrown =
      season.league.status === "complete"
        ? season.rosters.sort(
            (a, b) =>
              Number(`${b.settings.fpts}.${b.settings.fpts_decimal}`) -
              Number(`${a.settings.fpts}.${a.settings.fpts_decimal}`)
          )[0].roster_id
        : null;

    season.rosters.forEach((roster) => {
      const { owner_id, settings } = roster;
      const user = season.users.find((user) => user.user_id === owner_id);

      if (!user) return;

      if (!teamStats[owner_id]) {
        teamStats[owner_id] = {
          owner_id,
          team_name: getTeamName(owner_id),
          wins: settings.wins,
          losses: settings.losses,
          ties: settings.ties,
          winPerc: 0,
          points_for: getRosterPointsFor(roster),
          points_for_avg: 0,
          points_against: getRosterPointsAgainst(roster),
          points_against_avg: 0,
          champion: champion === roster.roster_id ? [year] : [],
          runnerUp: runnerUp === roster.roster_id ? [year] : [],
          scoringCrown:
            scoringCrown && scoringCrown === roster.roster_id ? [year] : [],
        };
      } else {
        teamStats[owner_id].team_name = getTeamName(owner_id);
        teamStats[owner_id].wins += settings.wins;
        teamStats[owner_id].losses += settings.losses;
        teamStats[owner_id].ties += settings.ties;
        teamStats[owner_id].points_for += getRosterPointsFor(roster);
        teamStats[owner_id].points_against += getRosterPointsAgainst(roster);
        if (
          season.winners_bracket.some(
            (x) => x.p === 1 && x.w === roster.roster_id
          )
        ) {
          teamStats[owner_id].champion.push(year);
        }
        if (
          season.winners_bracket.some(
            (x) => x.p === 1 && x.l === roster.roster_id
          )
        ) {
          teamStats[owner_id].runnerUp.push(year);
        }
        if (scoringCrown && scoringCrown === roster.roster_id) {
          teamStats[owner_id].scoringCrown.push(year);
        }
      }
    });
  });

  const sortedStats = Object.values(teamStats)
    .map((t) => ({
      ...t,
      winPerc: calculateWinPercentageAsPercent(t.wins, t.losses, t.ties),
      points_for_avg: t.points_for / (t.wins + t.losses + t.ties),
      points_against_avg: t.points_against / (t.wins + t.losses + t.ties),
    }))
    .sort((a, b) => {
      if (a.winPerc !== b.winPerc) return b.winPerc - a.winPerc;
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.points_for !== b.points_for) return b.points_for - a.points_for;
      return a.points_against - b.points_against;
    });

  return sortedStats;
};

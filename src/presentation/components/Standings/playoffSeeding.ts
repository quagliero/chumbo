import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import { League } from "@/types/league";

/**
 * Which teams made the playoffs and their seeds, read off the winners bracket
 * — the standings page shades those rows by seed. Moved out of `Standings.tsx`
 * as it was; see `standingsData.ts`.
 */

// Determine playoff teams and their seeding by analyzing bracket structure
export const getPlayoffTeams = (
  winnersBracket: BracketMatch[] | undefined,
  league: League | undefined,
  standings: ExtendedRoster[],
  hasDivisions: boolean
) => {
  if (!winnersBracket || !league?.settings?.playoff_teams) {
    return { playoffTeams: new Set<number>(), playoffTeamSeeds: {} };
  }

  const playoffTeams = new Set<number>();
  const playoffTeamSeeds: Record<number, number> = {};

  // Get all teams that appear in the winners bracket (these are the playoff teams)
  winnersBracket.forEach((match) => {
    if (match.t1) playoffTeams.add(match.t1);
    if (match.t2) playoffTeams.add(match.t2);
  });

  if (hasDivisions) {
    // For division-based leagues, analyze bracket structure to determine seeds
    // Find teams that get byes (don't appear in first round)
    const firstRoundTeams = new Set<number>();
    const byeTeams = new Set<number>();

    // Find the first round (lowest round number)
    const firstRound = Math.min(...winnersBracket.map((m) => m.r));

    winnersBracket.forEach((match) => {
      if (match.r === firstRound) {
        if (match.t1) firstRoundTeams.add(match.t1);
        if (match.t2) firstRoundTeams.add(match.t2);
      }
    });

    // Teams with byes are playoff teams that don't appear in first round
    playoffTeams.forEach((teamId) => {
      if (!firstRoundTeams.has(teamId)) {
        byeTeams.add(teamId);
      }
    });

    // Assign seeds 1-2 to bye teams (division winners, sorted by their division standings)
    const byeTeamRosters = [...standings]
      .filter((r) => byeTeams.has(r.roster_id))
      .sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      });

    let seed = 1;
    byeTeamRosters.forEach((roster) => {
      playoffTeamSeeds[roster.roster_id] = seed;
      seed++;
    });

    // Assign seeds 3-6 to remaining playoff teams (first round participants)
    const firstRoundRosters = [...standings]
      .filter((r) => firstRoundTeams.has(r.roster_id))
      .sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      });

    firstRoundRosters.forEach((roster) => {
      playoffTeamSeeds[roster.roster_id] = seed;
      seed++;
    });
  } else {
    // For non-division leagues, use simple overall standings
    const sortedStandings = [...standings].sort((a, b) => {
      const aWinPct =
        a.settings.wins /
        (a.settings.wins + a.settings.losses + a.settings.ties);
      const bWinPct =
        b.settings.wins /
        (b.settings.wins + b.settings.losses + b.settings.ties);

      if (aWinPct !== bWinPct) return bWinPct - aWinPct;

      const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
      const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
      return bPoints - aPoints;
    });

    let seed = 1;
    sortedStandings.forEach((roster) => {
      if (playoffTeams.has(roster.roster_id)) {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      }
    });
  }

  return { playoffTeams, playoffTeamSeeds };
};

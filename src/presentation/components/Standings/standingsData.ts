import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";

/**
 * The season standings table, worked out from the props with no React in
 * sight: the order of each division and the rows drawn for it. Seeding is in
 * `playoffSeeding.ts` and the award winners in `awards.ts`; `Standings.tsx`
 * wires the three together.
 *
 * Every function in these modules is the body of what used to be a closure, a
 * `useMemo` or a `useCallback` inside the component, moved as it was. What the
 * closure read from the component's scope it now takes as a parameter of the
 * same name.
 */

export type WinLossTie = { wins: number; losses: number; ties: number };

export interface TeamStandingData {
  roster: ExtendedRoster;
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPerc: number;
  divisionRecord?: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  sosRank?: number;
  playoffHighlight?: string | null;
  isChampion?: boolean;
  isRunnerUp?: boolean;
  isThirdPlace?: boolean;
  isTopScorer?: boolean;
  isBottomScorer?: boolean;
}

/** One group per division, or a single group (0) when there are none. */
export const groupStandings = (
  standings: ExtendedRoster[],
  hasDivisions: boolean
): Record<number, ExtendedRoster[]> =>
  hasDivisions
    ? standings.reduce((acc, roster) => {
        const division = roster.settings.division || 1;
        if (!acc[division]) {
          acc[division] = [];
        }
        acc[division].push(roster);
        return acc;
      }, {} as Record<number, ExtendedRoster[]>)
    : { 0: standings }; // Single group when no divisions

/**
 * Each division's teams in standings order, divisions in number order.
 *
 * NB: sorts each group's array in place, as it always has. Without divisions
 * the single group IS the `standings` array the page was given.
 */
export const sortDivisions = (
  groupedStandings: Record<number, ExtendedRoster[]>,
  hasDivisions: boolean,
  currentYear: number | undefined,
  getH2HRecord: (team1: ExtendedRoster, team2: ExtendedRoster) => WinLossTie,
  getDivisionRecord: (
    team: ExtendedRoster,
    divisionTeams: ExtendedRoster[]
  ) => WinLossTie
) =>
  Object.entries(groupedStandings)
    .map(([division, teams]) => ({
      division: parseInt(division),
      teams: teams.sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        // First tiebreaker: Win percentage
        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        // For division years, use division-specific tiebreakers
        if (hasDivisions) {
          // Second tiebreaker: H2H record
          const h2hRecord = getH2HRecord(a, b);
          const totalH2HGames =
            h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

          // Only use H2H if teams actually played each other
          if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
            return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
          }

          // Third tiebreaker: Division record
          const aDivRecord = getDivisionRecord(a, teams);
          const bDivRecord = getDivisionRecord(b, teams);
          const aDivWinPct =
            aDivRecord.wins /
            (aDivRecord.wins + aDivRecord.losses + aDivRecord.ties);
          const bDivWinPct =
            bDivRecord.wins /
            (bDivRecord.wins + bDivRecord.losses + bDivRecord.ties);

          if (aDivWinPct !== bDivWinPct) return bDivWinPct - aDivWinPct;
        } else {
          // For non-division years, only use H2H for 2012
          if (currentYear === 2012) {
            const h2hRecord = getH2HRecord(a, b);
            const totalH2HGames =
              h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

            // Only use H2H if teams actually played each other
            if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
              return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
            }
          }
        }

        // Final tiebreaker: Points
        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      }),
    }))
    .sort((a, b) => a.division - b.division);

/** One table row per team, in the order given, for one division. */
export const buildTableData = (
  teams: ExtendedRoster[],
  {
    hasDivisions,
    standings,
    getTeamName,
    strengthOfScheduleRemaining,
    isSeasonComplete,
    firstPlace,
    thirdPlace,
    topScorer,
    bottomScorer,
    getPlayoffHighlight,
    getDivisionRecord,
  }: {
    hasDivisions: boolean;
    standings: ExtendedRoster[];
    getTeamName: (ownerId: string) => string;
    strengthOfScheduleRemaining: Record<number, number>;
    isSeasonComplete: boolean;
    firstPlace: BracketMatch | undefined;
    thirdPlace: BracketMatch | undefined;
    topScorer: ExtendedRoster;
    bottomScorer: ExtendedRoster;
    getPlayoffHighlight: (rosterId: number) => string | null;
    getDivisionRecord: (
      team: ExtendedRoster,
      divisionTeams: ExtendedRoster[]
    ) => WinLossTie;
  }
): TeamStandingData[] => {
  return teams.map((roster, index) => {
    const winPerc =
      roster.settings.wins /
      (roster.settings.wins +
        roster.settings.losses +
        roster.settings.ties);
    const pointsFor =
      roster.settings.fpts + roster.settings.fpts_decimal / 100;
    const pointsAgainst =
      roster.settings.fpts_against +
      roster.settings.fpts_against_decimal / 100;

    // Calculate average points (total games played)
    const totalGames =
      roster.settings.wins + roster.settings.losses + roster.settings.ties;
    const avgPointsFor = totalGames > 0 ? pointsFor / totalGames : 0;
    const avgPointsAgainst =
      totalGames > 0 ? pointsAgainst / totalGames : 0;

    // Calculate division record if divisions exist
    const divisionRecord = hasDivisions
      ? getDivisionRecord(
          roster,
          standings.filter(
            (t) =>
              (t.settings.division || 1) === (roster.settings.division || 1)
          )
        )
      : undefined;

    const playoffHighlight = getPlayoffHighlight(roster.roster_id);
    const isChampion =
      isSeasonComplete && firstPlace?.w === roster.roster_id;
    const isRunnerUp =
      isSeasonComplete && firstPlace?.l === roster.roster_id;
    const isThirdPlace =
      isSeasonComplete && thirdPlace?.w === roster.roster_id;
    const isTopScorer =
      isSeasonComplete && roster.roster_id === topScorer.roster_id;
    const isBottomScorer =
      isSeasonComplete && roster.roster_id === bottomScorer.roster_id;

    return {
      roster,
      rank: index + 1,
      teamName: getTeamName(roster.owner_id),
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
      winPerc,
      divisionRecord,
      pointsFor,
      pointsAgainst,
      avgPointsFor,
      avgPointsAgainst,
      sosRank: strengthOfScheduleRemaining[roster.roster_id],
      playoffHighlight,
      isChampion,
      isRunnerUp,
      isThirdPlace,
      isTopScorer,
      isBottomScorer,
    };
  });
};

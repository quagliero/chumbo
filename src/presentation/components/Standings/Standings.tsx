import { useMemo, useCallback } from "react";
import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import { League, ExtendedLeague } from "@/types/league";
import { ExtendedUser } from "@/types/user";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import {
  calculateH2HRecord,
  calculateDivisionRecord,
} from "@/utils/recordUtils";
import { calculateStrengthOfSchedule } from "@/utils/strengthOfSchedule";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import {
  buildTableData,
  groupStandings,
  sortDivisions,
} from "./standingsData";
import { getPlayoffTeams } from "./playoffSeeding";
import { getBottomScorer, getScumbo, getTopScorer } from "./awards";
import DivisionTable from "./DivisionTable";
import AwardsGrid from "./AwardsGrid";

interface StandingsProps {
  standings: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  league: League | undefined;
  winnersBracket: BracketMatch[] | undefined;
  users?: ExtendedUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchups?: Record<string, any[]>; // For league record calculations
  currentYear?: number; // Current year being viewed
}

const Standings = ({
  standings,
  getTeamName,
  league,
  winnersBracket,
  users,
  matchups,
  currentYear,
}: StandingsProps) => {
  // Only show awards if season is complete
  const isSeasonComplete = league?.status === "complete";

  // Check if divisions are used
  const hasDivisions = !!(
    league?.settings?.divisions && league.settings.divisions > 0
  );

  // Get division names and avatars from metadata
  const getDivisionInfo = (divisionNumber: number) => {
    if (!hasDivisions || !league.metadata) {
      return { name: `Division ${divisionNumber}`, avatar: null };
    }

    const divisionKey =
      `division_${divisionNumber}` as keyof typeof league.metadata;
    const avatarKey =
      `division_${divisionNumber}_avatar` as keyof typeof league.metadata;

    return {
      name: league.metadata[divisionKey] || `Division ${divisionNumber}`,
      avatar: league.metadata[avatarKey] || null,
    };
  };

  // Group standings by division if divisions exist
  const groupedStandings = groupStandings(standings, hasDivisions);

  // Calculate H2H record between two teams
  const getH2HRecord = (team1: ExtendedRoster, team2: ExtendedRoster) => {
    if (!matchups) return { wins: 0, losses: 0, ties: 0 };

    const playoffWeekStart = league?.settings?.playoff_week_start || 15;
    return calculateH2HRecord(
      team1.roster_id,
      team2.roster_id,
      matchups,
      playoffWeekStart
    );
  };

  // Calculate division record for a team
  const getDivisionRecord = useCallback(
    (team: ExtendedRoster, divisionTeams: ExtendedRoster[]) => {
      if (!matchups) return { wins: 0, losses: 0, ties: 0 };

      const playoffWeekStart = league?.settings?.playoff_week_start || 15;
      return calculateDivisionRecord(
        team,
        divisionTeams,
        matchups,
        playoffWeekStart
      );
    },
    [matchups, league?.settings?.playoff_week_start]
  );

  // Sort divisions and teams within each division
  const sortedDivisions = sortDivisions(
    groupedStandings,
    hasDivisions,
    currentYear,
    getH2HRecord,
    getDivisionRecord
  );

  // Get playoff placements
  const firstPlace = winnersBracket?.find((m) => m.p === 1);
  const thirdPlace = winnersBracket?.find((m) => m.p === 3);

  const { playoffTeams, playoffTeamSeeds } = getPlayoffTeams(
    winnersBracket,
    league,
    standings,
    hasDivisions
  );

  // Calculate strength of schedule remaining for current season only.
  // The unplayed fixtures live in schedule.json, not in the matchup files, so
  // the season's schedule has to go in alongside the matchups.
  const strengthOfScheduleRemaining = useMemo(() => {
    return currentYear && currentYear >= YEARS[YEARS.length - 1]
      ? calculateStrengthOfSchedule({
          matchups: matchups || {},
          rosters: standings,
          league: league || ({} as League),
          schedule: seasons[currentYear]?.schedule,
        } as {
          matchups: Record<string, ExtendedMatchup[]>;
          rosters: ExtendedRoster[];
          league: ExtendedLeague;
          schedule?: Record<string, ScheduledMatchup[]>;
        })
      : {};
  }, [currentYear, matchups, standings, league]);

  // `calculateStrengthOfSchedule` returns {} whenever there is no remaining
  // schedule to rank — every completed season, and the live season once the
  // regular season is done. In that case the column has nothing to say, so
  // drop it rather than render a column of dashes.
  const hasStrengthOfSchedule =
    Object.keys(strengthOfScheduleRemaining).length > 0;

  // Determine if a team gets a bye (top 2 seeds in 12-team leagues, or all playoff teams in 10-team leagues)
  const getPlayoffHighlight = useCallback(
    (rosterId: number) => {
      if (!playoffTeams.has(rosterId)) return null;

      const seed = playoffTeamSeeds[rosterId];
      const numTeams = league?.settings?.num_teams || 12;

      // In 10-team leagues, all playoff teams get green (no byes)
      if (numTeams === 10) {
        return "playoff";
      }

      // In 12-team leagues, top 2 seeds get byes (green), others get yellow
      if (seed <= 2) {
        return "bye";
      } else {
        return "playoff";
      }
    },
    [playoffTeams, playoffTeamSeeds, league?.settings?.num_teams]
  );

  const topScorer = getTopScorer(standings);
  const bottomScorer = getBottomScorer(standings);

  // The Scumbo: the worst BREAKDOWN of the season — see `getScumbo` for why
  // it comes from the shared season breakdown rather than a local sum.
  const scumbo = getScumbo(currentYear, standings);

  // Create table data for each division
  const createTableData = useCallback(
    (teams: ExtendedRoster[]) =>
      buildTableData(teams, {
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
      }),
    [
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
    ]
  );
  const divisionTableData = useMemo(() => {
    return sortedDivisions.map(({ division, teams }) => ({
      division,
      teams,
      data: createTableData(teams),
    }));
  }, [sortedDivisions, createTableData]);

  return (
    <div className="container mx-auto">
      {divisionTableData.map(({ division, data }) => (
        <DivisionTable
          key={division}
          division={division}
          data={data}
          hasDivisions={hasDivisions}
          getDivisionInfo={getDivisionInfo}
          users={users}
          hasStrengthOfSchedule={hasStrengthOfSchedule}
        />
      ))}

      {/* Awards Grid */}
      {isSeasonComplete && (
        <AwardsGrid
          standings={standings}
          firstPlace={firstPlace}
          topScorer={topScorer}
          scumbo={scumbo}
          getTeamName={getTeamName}
          currentYear={currentYear}
        />
      )}
    </div>
  );
};

export default Standings;

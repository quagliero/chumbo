import { useState, useMemo } from "react";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import { calculatePlayoffOdds } from "@/utils/playoffOdds";
import ScenarioPlanner from "./ScenarioPlanner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../Table";

interface UserPick {
  week: number;
  matchupId: number;
  winner: number;
  team1Score?: number;
  team2Score?: number;
}

interface UserScenario {
  picks: UserPick[];
}

interface PlayoffOddsProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
}

type SortField = "team" | "record" | "playoffs" | number; // number represents position 1-12
type SortDirection = "asc" | "desc";

const PlayoffOdds = ({
  rosters,
  matchups,
  league,
  getTeamName,
}: PlayoffOddsProps) => {
  const [sortField, setSortField] = useState<SortField>("playoffs");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [userScenario, setUserScenario] = useState<UserScenario | undefined>(
    undefined
  );

  // Calculate playoff odds
  const playoffOddsData = useMemo(() => {
    if (!matchups || !league) return [];

    const seasonData = {
      matchups,
      rosters,
      league,
    };

    return calculatePlayoffOdds(seasonData, userScenario);
  }, [matchups, league, rosters, userScenario]);

  const compareRecords = (
    teamA: { wins: number; losses: number; ties: number },
    teamB: { wins: number; losses: number; ties: number }
  ) => {
    if (teamA.wins !== teamB.wins) {
      return teamA.wins - teamB.wins;
    }
    if (teamA.losses !== teamB.losses) {
      return teamB.losses - teamA.losses;
    }
    if (teamA.ties !== teamB.ties) {
      return teamA.ties - teamB.ties;
    }
    return 0;
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "team" ? "asc" : "desc");
    }
  };

  // Sort the data
  const sortedData = useMemo(() => {
    return [...playoffOddsData].sort((a, b) => {
      let comparison = 0;

      if (sortField === "team") {
        const teamA = rosters.find((r) => r.roster_id === a.rosterId);
        const teamB = rosters.find((r) => r.roster_id === b.rosterId);
        if (teamA && teamB) {
          comparison = getTeamName(teamA.owner_id).localeCompare(
            getTeamName(teamB.owner_id)
          );
        }
      } else if (sortField === "record") {
        comparison = compareRecords(a, b);

        if (comparison === 0) {
          comparison = a.pointsFor - b.pointsFor;
        }
      } else if (sortField === "playoffs") {
        // Primary sort: Playoff odds (descending - higher is better)
        // Using ascending comparison, will be negated for descending order
        // Use small epsilon to handle floating point precision issues
        const playoffOddsDiff = a.playoffOdds - b.playoffOdds;
        const epsilon = 0.0001; // Consider values within 0.0001% as equal
        comparison = Math.abs(playoffOddsDiff) < epsilon ? 0 : playoffOddsDiff;

        // Secondary sort: Wins (descending - more wins is better)
        // Only applies when playoff odds are effectively equal
        if (comparison === 0) {
          comparison = a.wins - b.wins;

          // Tertiary sort: Points for (descending - more points is better)
          // Only applies when playoff odds AND wins are exactly equal
          if (comparison === 0) {
            comparison = a.pointsFor - b.pointsFor;

            // Final fallback: alphabetical team name (for complete determinism)
            if (comparison === 0) {
              const teamA = rosters.find((r) => r.roster_id === a.rosterId);
              const teamB = rosters.find((r) => r.roster_id === b.rosterId);
              if (teamA && teamB) {
                comparison = getTeamName(teamA.owner_id).localeCompare(
                  getTeamName(teamB.owner_id)
                );
              }
            }
          }
        }
      } else if (typeof sortField === "number") {
        comparison = a.positionOdds[sortField] - b.positionOdds[sortField];
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [playoffOddsData, sortField, sortDirection, rosters, getTeamName]);

  // Show loading or no data states
  if (!matchups || !league) {
    return (
      <div className="text-center text-gray-500 py-8">
        Playoff odds data not available for this season
      </div>
    );
  }

  if (playoffOddsData.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No remaining regular season games to simulate
      </div>
    );
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const getPlayoffColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 font-semibold";
    if (percentage >= 60) return "text-green-500";
    if (percentage >= 40) return "text-yellow-600";
    if (percentage >= 20) return "text-orange-500";
    return "text-red-500";
  };

  // Removed position-based column coloring to avoid confusion with row coloring

  const getRowColor = (playoffOdds: number) => {
    // Solid colors based on playoff odds
    if (playoffOdds >= 50) {
      return "bg-green-100";
    } else if (playoffOdds >= 20) {
      return "bg-yellow-100";
    } else {
      return "bg-gray-100";
    }
  };

  const getRowBorder = (index: number) => {
    // Thick border above 7th team (playoff cutoff)
    if (index === 6) return "!border-t-4 !border-gray-600";
    // Thin border above 3rd team (bye week cutoff)
    if (index === 2) return "!border-t-2 !border-gray-400";
    return "";
  };

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Playoff Odds</h2>
        <p className="text-gray-600">
          Monte Carlo simulation (10,000 iterations) showing each team's
          probability of finishing in each position. Playoff odds = sum of
          positions 1-6.
        </p>
        <div className="flex flex-wrap gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-700">High Playoff Odds (≥50%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span className="text-gray-700">Medium Playoff Odds (20-49%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-gray-700">Low Playoff Odds (&lt;20%)</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell
                className="text-left sticky left-0 z-10 bg-gray-100 cursor-pointer hover:bg-gray-200 border-r border-gray-200"
                onClick={() => handleSort("team")}
              >
                Team {getSortIcon("team")}
              </TableHeaderCell>
              <TableHeaderCell
                className="text-center bg-gray-100 min-w-20 cursor-pointer hover:bg-gray-200 border-r border-gray-200"
                onClick={() => handleSort("record")}
              >
                Record {getSortIcon("record")}
              </TableHeaderCell>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((position) => (
                <TableHeaderCell
                  key={position}
                  className={`text-center min-w-16 cursor-pointer hover:bg-gray-200 ${
                    position <= 6 ? "bg-blue-50 font-semibold" : "bg-gray-50"
                  }`}
                  onClick={() => handleSort(position)}
                >
                  {position} {getSortIcon(position)}
                </TableHeaderCell>
              ))}
              <TableHeaderCell
                className="border-l border-gray-200 text-center bg-green-50 min-w-20 cursor-pointer hover:bg-green-100 font-semibold whitespace-nowrap"
                onClick={() => handleSort("playoffs")}
              >
                Playoffs {getSortIcon("playoffs")}
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((teamData, index) => {
              const team = rosters.find(
                (r) => r.roster_id === teamData.rosterId
              );
              if (!team) return null;

              return (
                <TableRow
                  key={teamData.rosterId}
                  className={`transition-colors ${getRowColor(
                    teamData.playoffOdds
                  )} ${getRowBorder(index)}`}
                >
                  <TableCell className="text-left sticky left-0 z-10 font-medium transition-colors border-r border-gray-200">
                    <div className="font-medium text-gray-900">
                      {getTeamName(team.owner_id)}
                    </div>
                    <div className="text-xs text-gray-600">
                      PF: {teamData.pointsFor.toFixed(1)} | PA:{" "}
                      {teamData.pointsAgainst.toFixed(1)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm border-r border-gray-200">
                    {teamData.wins}-{teamData.losses}
                    {teamData.ties > 0 && `-${teamData.ties}`}
                  </TableCell>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(
                    (position) => (
                      <TableCell key={position} className="text-center text-sm">
                        {teamData.positionOdds[position].toFixed(1)}%
                      </TableCell>
                    )
                  )}
                  <TableCell
                    className={`border-l border-gray-200 text-center font-semibold ${getPlayoffColor(
                      teamData.playoffOdds
                    )}`}
                  >
                    {teamData.playoffOdds.toFixed(2)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Interactive Scenario Planner */}
      <ScenarioPlanner
        rosters={rosters}
        matchups={matchups}
        league={league}
        getTeamName={getTeamName}
        onScenarioChange={setUserScenario}
      />
    </div>
  );
};

export default PlayoffOdds;

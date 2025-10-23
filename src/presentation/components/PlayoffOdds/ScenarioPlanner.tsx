import { useState, useMemo, useEffect } from "react";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { getCompletedWeek } from "@/utils/weekUtils";

interface ScenarioPlannerProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
  onScenarioChange: (scenario: UserScenario) => void;
}

interface UserPick {
  week: number;
  matchupId: number;
  winner: number; // roster_id of winner
  team1Score?: number;
  team2Score?: number;
}

interface UserScenario {
  picks: UserPick[];
}

interface TeamStats {
  rosterId: number;
  mean: number;
  stdDev: number;
}

const ScenarioPlanner = ({
  rosters,
  matchups,
  league,
  getTeamName,
  onScenarioChange,
}: ScenarioPlannerProps) => {
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [userPicks, setUserPicks] = useState<UserPick[]>([]);

  // Get remaining weeks and matchups
  const remainingWeeks = useMemo(() => {
    if (!matchups || !league) return [];

    const completedWeek = getCompletedWeek(league);
    const playoffWeekStart = getPlayoffWeekStart({ league });

    if (completedWeek === null) return [];

    return Object.keys(matchups)
      .map(Number)
      .filter((week) => week > completedWeek && week < playoffWeekStart)
      .sort((a, b) => a - b);
  }, [matchups, league]);

  // Initialize selectedWeek to the first remaining week (current game week)
  useEffect(() => {
    if (remainingWeeks.length > 0 && selectedWeek === 1) {
      setSelectedWeek(remainingWeeks[0]);
    }
  }, [remainingWeeks, selectedWeek]);

  // Get matchups for selected week
  const weekMatchups = useMemo(() => {
    if (!matchups || !selectedWeek) return [];

    const matchupsForWeek = matchups[selectedWeek.toString()];
    if (!matchupsForWeek) return [];

    // Group matchups by matchup_id
    const grouped: { [key: string]: ExtendedMatchup[] } = {};
    matchupsForWeek.forEach((matchup) => {
      const key = matchup.matchup_id?.toString() || `bye_${matchup.roster_id}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(matchup);
    });

    // Only return actual matchups (pairs of teams)
    return Object.values(grouped).filter(
      (group) => group.length === 2 && group[0].matchup_id !== null
    );
  }, [matchups, selectedWeek]);

  // Calculate team stats for score generation
  const teamStats = useMemo(() => {
    if (!matchups || !league) return [];

    const completedWeek = getCompletedWeek(league);
    const playoffWeekStart = getPlayoffWeekStart({ league });

    if (completedWeek === null) return [];

    const stats: TeamStats[] = [];

    rosters.forEach((roster) => {
      const scores: number[] = [];

      // Collect scores from completed regular season games
      Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
        const week = parseInt(weekStr);

        if (week > completedWeek || week >= playoffWeekStart) return;

        const matchup = weekMatchups.find(
          (m) => m.roster_id === roster.roster_id
        );
        if (matchup) {
          scores.push(matchup.points);
        }
      });

      const mean =
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : 0;

      const variance =
        scores.length > 1
          ? scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
            (scores.length - 1)
          : 0;

      const stdDev = Math.sqrt(variance);

      stats.push({
        rosterId: roster.roster_id,
        mean,
        stdDev,
      });
    });

    return stats;
  }, [matchups, league, rosters]);

  // Generate random score based on team stats
  const generateScore = (rosterId: number): number => {
    const stats = teamStats.find((s) => s.rosterId === rosterId);
    if (!stats) return 0;

    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return Math.max(0, stats.mean + stats.stdDev * normal);
  };

  // Handle winner selection
  const handleWinnerSelect = (
    week: number,
    matchupId: number,
    winner: number
  ) => {
    const existingPickIndex = userPicks.findIndex(
      (p) => p.week === week && p.matchupId === matchupId
    );

    const matchup = weekMatchups.find((m) => m[0].matchup_id === matchupId);
    if (!matchup) return;

    const team1 = matchup[0];
    const team2 = matchup[1];

    // Generate base scores
    const team1Score = generateScore(team1.roster_id);
    const team2Score = generateScore(team2.roster_id);

    // Ensure the winner has a higher score
    let finalTeam1Score = team1Score;
    let finalTeam2Score = team2Score;

    if (winner === team1.roster_id) {
      // Team 1 should win - ensure they have higher score
      if (team1Score <= team2Score) {
        finalTeam1Score = team2Score + Math.random() * 10 + 1; // Add 1-11 points
      }
    } else {
      // Team 2 should win - ensure they have higher score
      if (team2Score <= team1Score) {
        finalTeam2Score = team1Score + Math.random() * 10 + 1; // Add 1-11 points
      }
    }

    const newPick: UserPick = {
      week,
      matchupId,
      winner,
      team1Score: finalTeam1Score,
      team2Score: finalTeam2Score,
    };

    let newPicks: UserPick[];
    if (existingPickIndex >= 0) {
      newPicks = [...userPicks];
      newPicks[existingPickIndex] = newPick;
    } else {
      newPicks = [...userPicks, newPick];
    }

    setUserPicks(newPicks);
    onScenarioChange({ picks: newPicks });
  };

  // Handle score input
  const handleScoreChange = (
    week: number,
    matchupId: number,
    team: "team1" | "team2",
    score: number
  ) => {
    const existingPickIndex = userPicks.findIndex(
      (p) => p.week === week && p.matchupId === matchupId
    );

    if (existingPickIndex >= 0) {
      const newPicks = [...userPicks];
      if (team === "team1") {
        newPicks[existingPickIndex].team1Score = score;
      } else {
        newPicks[existingPickIndex].team2Score = score;
      }
      setUserPicks(newPicks);
      onScenarioChange({ picks: newPicks });
    }
  };

  // Set all picks for a week based on points scored
  const setWeekByPoints = (week: number) => {
    const weekMatchupsForWeek = matchups?.[week.toString()];
    if (!weekMatchupsForWeek) return;

    // Group matchups by matchup_id
    const grouped: { [key: string]: ExtendedMatchup[] } = {};
    weekMatchupsForWeek.forEach((matchup) => {
      const key = matchup.matchup_id?.toString() || `bye_${matchup.roster_id}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(matchup);
    });

    const newPicks: UserPick[] = [...userPicks];

    // Process each matchup
    Object.values(grouped).forEach((matchupPair) => {
      if (matchupPair.length !== 2) return; // Skip bye weeks

      const team1 = matchupPair[0];
      const team2 = matchupPair[1];
      const matchupId = team1.matchup_id!;

      // Remove existing pick for this matchup
      const existingIndex = newPicks.findIndex(
        (p) => p.week === week && p.matchupId === matchupId
      );
      if (existingIndex >= 0) {
        newPicks.splice(existingIndex, 1);
      }

      // Generate scores based on team stats
      const team1Score = generateScore(team1.roster_id);
      const team2Score = generateScore(team2.roster_id);

      // Determine winner based on higher average points scored this season
      const team1Stats = teamStats.find((s) => s.rosterId === team1.roster_id);
      const team2Stats = teamStats.find((s) => s.rosterId === team2.roster_id);

      if (!team1Stats || !team2Stats) return;

      // Winner is determined by season average, not random scores
      const winner =
        team1Stats.mean > team2Stats.mean ? team1.roster_id : team2.roster_id;

      // Ensure winner has higher score
      let finalTeam1Score = team1Score;
      let finalTeam2Score = team2Score;

      if (winner === team1.roster_id && team1Score <= team2Score) {
        finalTeam1Score = team2Score + Math.random() * 10 + 1;
      } else if (winner === team2.roster_id && team2Score <= team1Score) {
        finalTeam2Score = team1Score + Math.random() * 10 + 1;
      }

      newPicks.push({
        week,
        matchupId,
        winner,
        team1Score: finalTeam1Score,
        team2Score: finalTeam2Score,
      });
    });

    setUserPicks(newPicks);
    onScenarioChange({ picks: newPicks });
  };

  // Set all picks for a week randomly
  const setWeekRandomly = (week: number) => {
    const weekMatchupsForWeek = matchups?.[week.toString()];
    if (!weekMatchupsForWeek) return;

    // Group matchups by matchup_id
    const grouped: { [key: string]: ExtendedMatchup[] } = {};
    weekMatchupsForWeek.forEach((matchup) => {
      const key = matchup.matchup_id?.toString() || `bye_${matchup.roster_id}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(matchup);
    });

    const newPicks: UserPick[] = [...userPicks];

    // Process each matchup
    Object.values(grouped).forEach((matchupPair) => {
      if (matchupPair.length !== 2) return; // Skip bye weeks

      const team1 = matchupPair[0];
      const team2 = matchupPair[1];
      const matchupId = team1.matchup_id!;

      // Remove existing pick for this matchup
      const existingIndex = newPicks.findIndex(
        (p) => p.week === week && p.matchupId === matchupId
      );
      if (existingIndex >= 0) {
        newPicks.splice(existingIndex, 1);
      }

      // Generate scores based on team stats
      const team1Score = generateScore(team1.roster_id);
      const team2Score = generateScore(team2.roster_id);

      // Randomly determine winner (50/50 chance)
      const winner = Math.random() < 0.5 ? team1.roster_id : team2.roster_id;

      // Ensure winner has higher score
      let finalTeam1Score = team1Score;
      let finalTeam2Score = team2Score;

      if (winner === team1.roster_id && team1Score <= team2Score) {
        finalTeam1Score = team2Score + Math.random() * 10 + 1;
      } else if (winner === team2.roster_id && team2Score <= team1Score) {
        finalTeam2Score = team1Score + Math.random() * 10 + 1;
      }

      newPicks.push({
        week,
        matchupId,
        winner,
        team1Score: finalTeam1Score,
        team2Score: finalTeam2Score,
      });
    });

    setUserPicks(newPicks);
    onScenarioChange({ picks: newPicks });
  };

  if (remainingWeeks.length === 0) {
    return (
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <p className="text-gray-600 text-center">
          No remaining regular season games to simulate
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Interactive Scenario Planner
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Pick winners for remaining games to see how playoff odds change.
          Scores are auto-generated based on team averages, or you can customize
          them.
        </p>

        {/* Week Tabs */}
        <div className="flex gap-2 mb-4">
          {remainingWeeks.map((week) => (
            <button
              key={week}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedWeek === week
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
              onClick={() => setSelectedWeek(week)}
            >
              Week {week}
            </button>
          ))}
        </div>

        {/* Utility Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            onClick={() => setWeekByPoints(selectedWeek)}
            title="Set all picks for this week based on projected points scored"
          >
            Set by Points
          </button>
          <button
            className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            onClick={() => setWeekRandomly(selectedWeek)}
            title="Set all picks for this week randomly"
          >
            Set Random
          </button>
          <button
            className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
            onClick={() => {
              // Clear picks for selected week only
              const newPicks = userPicks.filter((p) => p.week !== selectedWeek);
              setUserPicks(newPicks);
              onScenarioChange({ picks: newPicks });
            }}
            title="Clear all picks for this week"
          >
            Clear Week
          </button>
        </div>
      </div>

      {/* Matchups for selected week */}
      <div className="space-y-4">
        {weekMatchups.map((matchup) => {
          const team1 = matchup[0];
          const team2 = matchup[1];
          const matchupId = team1.matchup_id!;

          const userPick = userPicks.find(
            (p) => p.week === selectedWeek && p.matchupId === matchupId
          );

          return (
            <div
              key={matchupId}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">
                  {getTeamName(
                    rosters.find((r) => r.roster_id === team1.roster_id)
                      ?.owner_id || ""
                  )}{" "}
                  vs{" "}
                  {getTeamName(
                    rosters.find((r) => r.roster_id === team2.roster_id)
                      ?.owner_id || ""
                  )}
                </h4>
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      userPick?.winner === team1.roster_id
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                    onClick={() =>
                      handleWinnerSelect(
                        selectedWeek,
                        matchupId,
                        team1.roster_id
                      )
                    }
                  >
                    {getTeamName(
                      rosters.find((r) => r.roster_id === team1.roster_id)
                        ?.owner_id || ""
                    )}
                  </button>
                  <button
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      userPick?.winner === team2.roster_id
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                    onClick={() =>
                      handleWinnerSelect(
                        selectedWeek,
                        matchupId,
                        team2.roster_id
                      )
                    }
                  >
                    {getTeamName(
                      rosters.find((r) => r.roster_id === team2.roster_id)
                        ?.owner_id || ""
                    )}
                  </button>
                </div>
              </div>

              {/* Score inputs */}
              {userPick && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 w-32 truncate">
                      {getTeamName(
                        rosters.find((r) => r.roster_id === team1.roster_id)
                          ?.owner_id || ""
                      )}
                    </span>
                    <input
                      type="number"
                      value={userPick.team1Score?.toFixed(1) || ""}
                      onChange={(e) =>
                        handleScoreChange(
                          selectedWeek,
                          matchupId,
                          "team1",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                      step="0.1"
                    />
                  </div>
                  <span className="text-gray-400">-</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={userPick.team2Score?.toFixed(1) || ""}
                      onChange={(e) =>
                        handleScoreChange(
                          selectedWeek,
                          matchupId,
                          "team2",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                      step="0.1"
                    />
                    <span className="text-gray-600">
                      {getTeamName(
                        rosters.find((r) => r.roster_id === team2.roster_id)
                          ?.owner_id || ""
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clear all button */}
      {userPicks.length > 0 && (
        <div className="mt-4 text-center">
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            onClick={() => {
              setUserPicks([]);
              onScenarioChange({ picks: [] });
            }}
          >
            Clear All Picks
          </button>
        </div>
      )}
    </div>
  );
};

export default ScenarioPlanner;

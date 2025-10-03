import { useState, useMemo } from "react";
import { useFormatter } from "use-intl";
import { seasons } from "../../data";
import { YEARS } from "../../domain/constants";
import managers from "../../data/managers.json";
import { ExtendedMatchup } from "../../types/matchup";
import { ExtendedRoster } from "../../types/roster";
import DraftBoard from "../components/DraftBoard/DraftBoard";

const History = () => {
  const [selectedYear, setSelectedYear] = useState<number>(
    YEARS[YEARS.length - 1]
  );
  const [activeTab, setActiveTab] = useState<
    "standings" | "matchups" | "playoffs" | "draft"
  >("standings");
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const { number } = useFormatter();

  const seasonData = useMemo(() => {
    return seasons[selectedYear as keyof typeof seasons];
  }, [selectedYear]);

  // Get team name by owner ID
  const getTeamName = (ownerId: string) => {
    const user = seasonData?.users?.find((u) => u.user_id === ownerId);
    const manager = managers.find((m) => m.sleeper?.id === ownerId);
    return (
      user?.metadata?.team_name ||
      manager?.teamName ||
      user?.display_name ||
      "Unknown"
    );
  };

  // Get sorted standings
  const standings = useMemo(() => {
    if (!seasonData?.rosters) return [];
    return [...seasonData.rosters].sort((a, b) => {
      const aWinPerc =
        a.settings.wins /
        (a.settings.wins + a.settings.losses + a.settings.ties);
      const bWinPerc =
        b.settings.wins /
        (b.settings.wins + b.settings.losses + b.settings.ties);
      if (aWinPerc !== bWinPerc) return bWinPerc - aWinPerc;
      const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
      const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
      return bPoints - aPoints;
    });
  }, [seasonData]);

  // Get playoff seeds
  const getPlayoffSeed = (rosterId: number) => {
    if (!seasonData?.rosters || !seasonData?.league) return null;
    const playoffTeams = seasonData.league.settings?.playoff_teams || 6;
    const seedIndex = standings.findIndex((r) => r.roster_id === rosterId);
    return seedIndex < playoffTeams ? seedIndex + 1 : null;
  };

  // Get available weeks for the selected year
  const availableWeeks = useMemo(() => {
    if (!seasonData?.matchups) return [];
    return Object.keys(seasonData.matchups)
      .map(Number)
      .sort((a, b) => a - b);
  }, [seasonData]);

  // Get matchups for selected week
  const weekMatchups = useMemo(() => {
    if (!seasonData?.matchups || !selectedWeek) return [];
    const matchups =
      seasonData.matchups[
        selectedWeek.toString() as keyof typeof seasonData.matchups
      ];
    if (!matchups) return [];

    // Group matchups by matchup_id
    const grouped: { [key: number]: ExtendedMatchup[] } = {};
    matchups.forEach((m: ExtendedMatchup) => {
      if (!grouped[m.matchup_id]) {
        grouped[m.matchup_id] = [];
      }
      grouped[m.matchup_id].push(m);
    });

    return Object.values(grouped);
  }, [seasonData, selectedWeek]);

  return (
    <div className="space-y-6">
      {/* Year Selector */}
      <div className="container mx-auto space-y-2">
        <h1 className="text-2xl font-bold mr-4">League History</h1>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((year) => (
            <button
              key={year}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedYear === year
                  ? "bg-blue-800 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
              onClick={() => setSelectedYear(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="container mx-auto">
          <nav className="flex gap-8">
            {["standings", "matchups", "playoffs", "draft"].map((tab) => (
              <button
                key={tab}
                className={`py-2 px-1 font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-blue-800 text-blue-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveTab(tab as typeof activeTab)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {/* Standings Tab */}
        {activeTab === "standings" && (
          <div className="overflow-x-auto container mx-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Rank</th>
                  <th className="text-left p-3">Team</th>
                  <th className="text-center p-3">W</th>
                  <th className="text-center p-3">L</th>
                  <th className="text-center p-3">T</th>
                  <th className="text-center p-3">Win %</th>
                  <th className="text-right p-3">Points For</th>
                  <th className="text-right p-3">Points Against</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {standings.map((roster: ExtendedRoster, index: number) => {
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

                  // Only show awards if season is complete
                  const isSeasonComplete =
                    seasonData?.league?.status === "complete";

                  // Get playoff placements
                  const firstPlace = seasonData?.winners_bracket?.find(
                    (m) => m.p === 1
                  );
                  const thirdPlace = seasonData?.winners_bracket?.find(
                    (m) => m.p === 3
                  );
                  const isChampion =
                    isSeasonComplete && firstPlace?.w === roster.roster_id;
                  const isRunnerUp =
                    isSeasonComplete && firstPlace?.l === roster.roster_id;
                  const isThirdPlace =
                    isSeasonComplete && thirdPlace?.w === roster.roster_id;

                  // Get top scorer
                  const topScorer = standings.reduce((max, r) => {
                    const rPoints =
                      r.settings.fpts + r.settings.fpts_decimal / 100;
                    const maxPoints =
                      max.settings.fpts + max.settings.fpts_decimal / 100;
                    return rPoints > maxPoints ? r : max;
                  });
                  const isTopScorer =
                    isSeasonComplete &&
                    roster.roster_id === topScorer.roster_id;

                  // Get bottom scorer
                  const bottomScorer = standings.reduce((min, r) => {
                    const rPoints =
                      r.settings.fpts + r.settings.fpts_decimal / 100;
                    const minPoints =
                      min.settings.fpts + min.settings.fpts_decimal / 100;
                    return rPoints < minPoints ? r : min;
                  });
                  const isBottomScorer =
                    isSeasonComplete &&
                    roster.roster_id === bottomScorer.roster_id;

                  return (
                    <tr key={roster.roster_id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium">
                        {index + 1}
                        {isChampion && " 🥇"}
                        {isRunnerUp && " 🥈"}
                        {isThirdPlace && " 🥉"}
                        {isTopScorer && " 🎯"}
                        {isBottomScorer && " 💩"}
                      </td>
                      <td className="p-3">{getTeamName(roster.owner_id)}</td>
                      <td className="text-center p-3">
                        {roster.settings.wins}
                      </td>
                      <td className="text-center p-3">
                        {roster.settings.losses}
                      </td>
                      <td className="text-center p-3">
                        {roster.settings.ties}
                      </td>
                      <td className="text-center p-3">
                        {number(winPerc, { maximumFractionDigits: 3 })}
                      </td>
                      <td className="text-right p-3">
                        {number(pointsFor, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-right p-3">
                        {number(pointsAgainst, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Matchups Tab */}
        {activeTab === "matchups" && (
          <div className="space-y-4 container mx-auto">
            {/* Week Selector */}
            <div className="flex flex-wrap gap-2">
              {availableWeeks.map((week) => (
                <button
                  key={week}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    selectedWeek === week
                      ? "bg-blue-800 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                  onClick={() => setSelectedWeek(week)}
                >
                  Week {week}
                </button>
              ))}
            </div>

            {/* Matchups Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekMatchups.map((matchup, index) => {
                const [team1, team2] = matchup;
                if (!team1 || !team2) return null;

                const team1Name = getTeamName(
                  seasonData.rosters.find(
                    (r) => r.roster_id === team1.roster_id
                  )?.owner_id || ""
                );
                const team2Name = getTeamName(
                  seasonData.rosters.find(
                    (r) => r.roster_id === team2.roster_id
                  )?.owner_id || ""
                );

                const winner =
                  team1.points > team2.points
                    ? team1.roster_id
                    : team2.points > team1.points
                    ? team2.roster_id
                    : null;

                return (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-white shadow-sm"
                  >
                    <div className="space-y-2">
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team1.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <span className="font-medium">{team1Name}</span>
                        <span className="text-lg font-bold">
                          {number(team1.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team2.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <span className="font-medium">{team2Name}</span>
                        <span className="text-lg font-bold">
                          {number(team2.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Playoffs Tab */}
        {activeTab === "playoffs" && (
          <div className="space-y-8 container mx-auto overflow-x-auto">
            {seasonData?.winners_bracket &&
            seasonData.winners_bracket.length > 0 ? (
              <>
                {/* Playoff Bracket */}
                <div>
                  <h2 className="text-xl font-bold mb-6">Playoff Bracket</h2>
                  <div className="flex gap-8 pb-4">
                    {Array.from(
                      new Set(seasonData.winners_bracket.map((m) => m.r))
                    )
                      .sort((a, b) => a - b)
                      .filter((round) => {
                        // Only include rounds that have matches (excluding championship/3rd place)
                        const roundMatches = seasonData.winners_bracket.filter(
                          (m) => m.r === round && !m.p
                        );
                        return roundMatches.length > 0;
                      })
                      .map((round) => {
                        const roundMatches = seasonData.winners_bracket
                          .filter((m) => m.r === round && !m.p)
                          .sort((a, b) => a.m - b.m);

                        // Calculate playoff week (last regular season week + round)
                        const playoffWeekStart =
                          seasonData.league?.settings?.playoff_week_start || 15;
                        const weekNumber = playoffWeekStart - 1 + round;

                        // Find teams with byes (only for round 1)
                        const byeTeams: number[] = [];
                        if (round === 1) {
                          // Get all teams in round 1
                          const round1Teams = new Set<number>();
                          roundMatches.forEach((m) => {
                            round1Teams.add(m.t1);
                            round1Teams.add(m.t2);
                          });

                          // Get teams in round 2 that aren't in round 1
                          const round2Matches =
                            seasonData.winners_bracket.filter(
                              (m) => m.r === 2 && !m.p
                            );
                          round2Matches.forEach((m) => {
                            if (!round1Teams.has(m.t1)) byeTeams.push(m.t1);
                            if (!round1Teams.has(m.t2)) byeTeams.push(m.t2);
                          });
                        }

                        return (
                          <div
                            key={round}
                            className="flex flex-col justify-around min-w-[220px]"
                          >
                            <div className="text-center font-semibold text-sm text-gray-600 mb-4">
                              Round {round}
                            </div>
                            <div className="flex flex-col gap-8">
                              {/* Bye matchups (only for round 1) */}
                              {byeTeams.map((teamId) => {
                                const teamName = getTeamName(
                                  seasonData.rosters.find(
                                    (r) => r.roster_id === teamId
                                  )?.owner_id || ""
                                );
                                const teamSeed = getPlayoffSeed(teamId);

                                return (
                                  <div
                                    key={`bye-${teamId}`}
                                    className="border rounded bg-white shadow-sm"
                                  >
                                    <div className="px-3 py-2 border-b text-sm bg-blue-50 font-semibold">
                                      <span>
                                        {teamSeed && (
                                          <span className="text-gray-500 mr-1">
                                            {teamSeed}.
                                          </span>
                                        )}
                                        {teamName}
                                      </span>
                                    </div>
                                    <div className="px-3 py-2 text-sm text-gray-500 italic">
                                      Bye
                                    </div>
                                  </div>
                                );
                              })}
                              {roundMatches.map((match) => {
                                const team1Name = getTeamName(
                                  seasonData.rosters.find(
                                    (r) => r.roster_id === match.t1
                                  )?.owner_id || ""
                                );
                                const team2Name = getTeamName(
                                  seasonData.rosters.find(
                                    (r) => r.roster_id === match.t2
                                  )?.owner_id || ""
                                );
                                const team1Seed = getPlayoffSeed(match.t1);
                                const team2Seed = getPlayoffSeed(match.t2);

                                // Get scores from matchup data
                                const weekMatchups =
                                  seasonData.matchups?.[
                                    weekNumber.toString() as keyof typeof seasonData.matchups
                                  ];
                                const team1Matchup = weekMatchups?.find(
                                  (m: ExtendedMatchup) =>
                                    m.roster_id === match.t1
                                );
                                const team2Matchup = weekMatchups?.find(
                                  (m: ExtendedMatchup) =>
                                    m.roster_id === match.t2
                                );
                                const team1Score = team1Matchup?.points;
                                const team2Score = team2Matchup?.points;

                                return (
                                  <div
                                    key={match.m}
                                    className="border rounded bg-white shadow-sm"
                                  >
                                    <div
                                      className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                                        match.w === match.t1
                                          ? "bg-green-50 font-semibold"
                                          : "bg-white"
                                      }`}
                                    >
                                      <span>
                                        {team1Seed && (
                                          <span className="text-gray-500 mr-1">
                                            {team1Seed}.
                                          </span>
                                        )}
                                        {team1Name}
                                      </span>
                                      {team1Score !== undefined && (
                                        <span className="ml-2">
                                          {number(team1Score, {
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={`px-3 py-2 text-sm flex justify-between items-center ${
                                        match.w === match.t2
                                          ? "bg-green-50 font-semibold"
                                          : "bg-white"
                                      }`}
                                    >
                                      <span>
                                        {team2Seed && (
                                          <span className="text-gray-500 mr-1">
                                            {team2Seed}.
                                          </span>
                                        )}
                                        {team2Name}
                                      </span>
                                      {team2Score !== undefined && (
                                        <span className="ml-2">
                                          {number(team2Score, {
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                    {/* Championship Game */}
                    {(() => {
                      const championship = seasonData.winners_bracket.find(
                        (m) => m.p === 1
                      );
                      if (!championship) return null;

                      const team1Name = getTeamName(
                        seasonData.rosters.find(
                          (r) => r.roster_id === championship.t1
                        )?.owner_id || ""
                      );
                      const team2Name = getTeamName(
                        seasonData.rosters.find(
                          (r) => r.roster_id === championship.t2
                        )?.owner_id || ""
                      );
                      const team1Seed = getPlayoffSeed(championship.t1);
                      const team2Seed = getPlayoffSeed(championship.t2);

                      // Get scores from matchup data
                      const playoffWeekStart =
                        seasonData.league?.settings?.playoff_week_start || 15;
                      const weekNumber = playoffWeekStart - 1 + championship.r;
                      const weekMatchups =
                        seasonData.matchups?.[
                          weekNumber.toString() as keyof typeof seasonData.matchups
                        ];
                      const team1Matchup = weekMatchups?.find(
                        (m: ExtendedMatchup) => m.roster_id === championship.t1
                      );
                      const team2Matchup = weekMatchups?.find(
                        (m: ExtendedMatchup) => m.roster_id === championship.t2
                      );
                      const team1Score = team1Matchup?.points;
                      const team2Score = team2Matchup?.points;

                      return (
                        <div className="flex flex-col justify-center min-w-[220px]">
                          <div className="text-center font-semibold text-sm text-gray-600 mb-4">
                            Championship
                          </div>
                          <div className="border rounded bg-white shadow-md">
                            <div
                              className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                                championship.w === championship.t1
                                  ? "bg-yellow-50 font-bold"
                                  : "bg-white"
                              }`}
                            >
                              <span>
                                {team1Seed && (
                                  <span className="text-gray-500 mr-1">
                                    {team1Seed}.
                                  </span>
                                )}
                                {team1Name}
                                {championship.w === championship.t1 && " 🏆"}
                              </span>
                              {team1Score !== undefined && (
                                <span className="ml-2">
                                  {number(team1Score, {
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              )}
                            </div>
                            <div
                              className={`px-3 py-2 text-sm flex justify-between items-center ${
                                championship.w === championship.t2
                                  ? "bg-yellow-50 font-bold"
                                  : "bg-white"
                              }`}
                            >
                              <span>
                                {team2Seed && (
                                  <span className="text-gray-500 mr-1">
                                    {team2Seed}.
                                  </span>
                                )}
                                {team2Name}
                                {championship.w === championship.t2 && " 🏆"}
                              </span>
                              {team2Score !== undefined && (
                                <span className="ml-2">
                                  {number(team2Score, {
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 3rd Place Game */}
                  {(() => {
                    const thirdPlace = seasonData.winners_bracket.find(
                      (m) => m.p === 3
                    );
                    if (!thirdPlace) return null;

                    const team1Name = getTeamName(
                      seasonData.rosters.find(
                        (r) => r.roster_id === thirdPlace.t1
                      )?.owner_id || ""
                    );
                    const team2Name = getTeamName(
                      seasonData.rosters.find(
                        (r) => r.roster_id === thirdPlace.t2
                      )?.owner_id || ""
                    );
                    const team1Seed = getPlayoffSeed(thirdPlace.t1);
                    const team2Seed = getPlayoffSeed(thirdPlace.t2);

                    // Get scores from matchup data
                    const playoffWeekStart =
                      seasonData.league?.settings?.playoff_week_start || 15;
                    const weekNumber = playoffWeekStart - 1 + thirdPlace.r;
                    const weekMatchups =
                      seasonData.matchups?.[
                        weekNumber.toString() as keyof typeof seasonData.matchups
                      ];
                    const team1Matchup = weekMatchups?.find(
                      (m: ExtendedMatchup) => m.roster_id === thirdPlace.t1
                    );
                    const team2Matchup = weekMatchups?.find(
                      (m: ExtendedMatchup) => m.roster_id === thirdPlace.t2
                    );
                    const team1Score = team1Matchup?.points;
                    const team2Score = team2Matchup?.points;

                    return (
                      <div className="mt-8">
                        <div className="text-center font-semibold text-sm text-gray-600 mb-4">
                          3rd Place
                        </div>
                        <div className="border rounded bg-white shadow-sm max-w-[220px] mx-auto">
                          <div
                            className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                              thirdPlace.w === thirdPlace.t1
                                ? "bg-orange-50 font-semibold"
                                : "bg-white"
                            }`}
                          >
                            <span>
                              {team1Seed && (
                                <span className="text-gray-500 mr-1">
                                  {team1Seed}.
                                </span>
                              )}
                              {team1Name}
                              {thirdPlace.w === thirdPlace.t1 && " 🥉"}
                            </span>
                            {team1Score !== undefined && (
                              <span className="ml-2">
                                {number(team1Score, {
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>
                          <div
                            className={`px-3 py-2 text-sm flex justify-between items-center ${
                              thirdPlace.w === thirdPlace.t2
                                ? "bg-orange-50 font-semibold"
                                : "bg-white"
                            }`}
                          >
                            <span>
                              {team2Seed && (
                                <span className="text-gray-500 mr-1">
                                  {team2Seed}.
                                </span>
                              )}
                              {team2Name}
                              {thirdPlace.w === thirdPlace.t2 && " 🥉"}
                            </span>
                            {team2Score !== undefined && (
                              <span className="ml-2">
                                {number(team2Score, {
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Playoff data not available for this season
              </div>
            )}
          </div>
        )}

        {/* Draft Tab */}
        {activeTab === "draft" && (
          <div>
            {seasonData?.picks &&
            seasonData.picks.length > 0 &&
            seasonData?.draft ? (
              <DraftBoard
                draft={seasonData.draft}
                picks={seasonData.picks}
                rosters={seasonData.rosters}
                getTeamName={getTeamName}
              />
            ) : (
              <div className="text-center text-gray-500 py-8">
                Draft data not available for this season
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;

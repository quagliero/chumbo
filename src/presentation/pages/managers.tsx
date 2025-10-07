import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFormatter } from "use-intl";
import { getManagerStats, DataMode } from "../../utils/managerStats";
import managers from "../../data/managers.json";

type SortOption =
  | "wins"
  | "winPct"
  | "leagueRecord"
  | "leagueRecordPct"
  | "pointsTotal"
  | "pointsAverage"
  | "championships";

const Managers = () => {
  const navigate = useNavigate();
  const { number } = useFormatter();
  const [sortBy, setSortBy] = useState<SortOption>("wins");
  const [dataMode, setDataMode] = useState<DataMode>("regular");

  const managerStatsList = managers
    .map((manager) => getManagerStats(manager.id, dataMode))
    .filter(Boolean)
    .sort((a, b) => {
      switch (sortBy) {
        case "wins": {
          // Sort by total wins, then win percentage
          const aWinPct =
            a!.totalWins / (a!.totalWins + a!.totalLosses + a!.totalTies);
          const bWinPct =
            b!.totalWins / (b!.totalWins + b!.totalLosses + b!.totalTies);
          if (a!.totalWins !== b!.totalWins) return b!.totalWins - a!.totalWins;
          return bWinPct - aWinPct;
        }
        case "winPct": {
          // Sort by win percentage, then total wins
          const aWinPct =
            a!.totalWins / (a!.totalWins + a!.totalLosses + a!.totalTies);
          const bWinPct =
            b!.totalWins / (b!.totalWins + b!.totalLosses + b!.totalTies);
          if (aWinPct !== bWinPct) return bWinPct - aWinPct;
          return b!.totalWins - a!.totalWins;
        }
        case "leagueRecord": {
          // Sort by league wins, then league win percentage
          const aLeagueWinPct =
            a!.leagueWins / (a!.leagueWins + a!.leagueLosses + a!.leagueTies);
          const bLeagueWinPct =
            b!.leagueWins / (b!.leagueWins + b!.leagueLosses + b!.leagueTies);
          if (a!.leagueWins !== b!.leagueWins)
            return b!.leagueWins - a!.leagueWins;
          return bLeagueWinPct - aLeagueWinPct;
        }
        case "leagueRecordPct": {
          // Sort by league win percentage, then league wins
          const aLeagueWinPct =
            a!.leagueWins / (a!.leagueWins + a!.leagueLosses + a!.leagueTies);
          const bLeagueWinPct =
            b!.leagueWins / (b!.leagueWins + b!.leagueLosses + b!.leagueTies);
          if (aLeagueWinPct !== bLeagueWinPct)
            return bLeagueWinPct - aLeagueWinPct;
          return b!.leagueWins - a!.leagueWins;
        }
        case "pointsTotal": {
          // Sort by total points
          return b!.totalPointsFor - a!.totalPointsFor;
        }
        case "pointsAverage": {
          // Sort by points per game, then total points
          const aGames = a!.totalWins + a!.totalLosses + a!.totalTies;
          const bGames = b!.totalWins + b!.totalLosses + b!.totalTies;
          const aAvg = aGames > 0 ? a!.totalPointsFor / aGames : 0;
          const bAvg = bGames > 0 ? b!.totalPointsFor / bGames : 0;
          if (aAvg !== bAvg) return bAvg - aAvg;
          return b!.totalPointsFor - a!.totalPointsFor;
        }
        case "championships": {
          // Sort by championships, then finals appearances (runner-ups), then scoring crowns
          if (a!.championships !== b!.championships)
            return b!.championships - a!.championships;
          if (a!.runnerUps !== b!.runnerUps) return b!.runnerUps - a!.runnerUps;
          return b!.scoringCrowns - a!.scoringCrowns;
        }
        default:
          return 0;
      }
    });

  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Managers</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Data Mode:</span>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="regular">Regular Season Only</option>
              <option value="playoffs">Playoffs Only</option>
              <option value="combined">Regular + Playoffs</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="wins">Win Total</option>
              <option value="winPct">Win %</option>
              <option value="leagueRecord">League Record</option>
              <option value="leagueRecordPct">League Record %</option>
              <option value="pointsTotal">Points Total</option>
              <option value="pointsAverage">Points Average</option>
              <option value="championships">Championships</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {managerStatsList.map((manager) => {
          const winPercentage =
            (manager!.totalWins /
              (manager!.totalWins +
                manager!.totalLosses +
                manager!.totalTies)) *
            100;

          const leagueWinPercentage =
            dataMode !== "playoffs"
              ? (manager!.leagueWins /
                  (manager!.leagueWins +
                    manager!.leagueLosses +
                    manager!.leagueTies)) *
                100
              : 0;

          const pointsAverage =
            manager!.totalWins + manager!.totalLosses + manager!.totalTies > 0
              ? manager!.totalPointsFor /
                (manager!.totalWins + manager!.totalLosses + manager!.totalTies)
              : 0;

          return (
            <div
              key={manager!.managerId}
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/managers/${manager!.managerId}`)}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold">{manager!.managerName}</h3>
                  <p className="text-gray-600">{manager!.teamName}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {manager!.totalWins}-{manager!.totalLosses}
                    {manager!.totalTies > 0 && `-${manager!.totalTies}`}
                  </div>
                  <div className="text-sm text-gray-500">
                    {number(winPercentage, { maximumFractionDigits: 1 })}%
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Championships:</span>
                  <span className="font-semibold">
                    {manager!.championships}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Scoring Crowns:</span>
                  <span className="font-semibold">
                    {manager!.scoringCrowns}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Points:</span>
                  <span className="font-semibold">
                    {number(manager!.totalPointsFor, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Points Avg:</span>
                  <span className="font-semibold">
                    {number(pointsAverage, {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </div>
                {dataMode !== "playoffs" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">League Record:</span>
                      <span className="font-semibold">
                        {manager!.leagueWins}-{manager!.leagueLosses}
                        {manager!.leagueTies > 0 && `-${manager!.leagueTies}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">League Win %:</span>
                      <span className="font-semibold">
                        {number(leagueWinPercentage, {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
                  <span>🏆 {manager!.championships}</span>
                  <span>🥈 {manager!.runnerUps}</span>
                  <span>👑 {manager!.scoringCrowns}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Managers;

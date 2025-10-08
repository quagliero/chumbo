import { useFormatter } from "use-intl";
import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { getManagerStats, DataMode } from "../../utils/managerStats";

const ManagerDetail = () => {
  const { managerId } = useParams<{ managerId: string }>();
  const navigate = useNavigate();
  const { number } = useFormatter();
  const [dataMode, setDataMode] = useState<DataMode>("regular");

  const managerStats = useMemo(() => {
    if (!managerId) return null;
    return getManagerStats(managerId, dataMode);
  }, [managerId, dataMode]);

  if (!managerStats) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600">
            Manager not found
          </h1>
          <button
            onClick={() => navigate("/managers")}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
      </div>
    );
  }

  const winPercentage =
    (managerStats.totalWins /
      (managerStats.totalWins +
        managerStats.totalLosses +
        managerStats.totalTies)) *
    100;
  const leagueWinPercentage =
    (managerStats.leagueWins /
      (managerStats.leagueWins +
        managerStats.leagueLosses +
        managerStats.leagueTies)) *
    100;

  return (
    <div className="container mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{managerStats.managerName}</h1>
          <p className="text-xl text-gray-600">{managerStats.teamName}</p>
          <button
            onClick={() => navigate("/managers")}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
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
        </div>
      </div>

      {/* Overall Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Overall Record
          </h3>
          <div className="text-3xl font-bold">
            {managerStats.totalWins}-{managerStats.totalLosses}
            {managerStats.totalTies > 0 && `-${managerStats.totalTies}`}
          </div>
          <div className="text-sm text-gray-500">
            {number(winPercentage, { maximumFractionDigits: 1 })}% win rate
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            League Performance
          </h3>
          <div className="text-3xl font-bold">
            {managerStats.leagueWins}-{managerStats.leagueLosses}
            {managerStats.leagueTies > 0 && `-${managerStats.leagueTies}`}
          </div>
          <div className="text-sm text-gray-500">
            {number(leagueWinPercentage, { maximumFractionDigits: 1 })}% vs
            league
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Points For
          </h3>
          <div className="text-3xl font-bold">
            {number(managerStats.totalPointsFor, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-sm text-gray-500">
            {number(
              managerStats.totalPointsFor /
                (managerStats.totalWins +
                  managerStats.totalLosses +
                  managerStats.totalTies),
              { maximumFractionDigits: 2 }
            )}{" "}
            avg per game
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Points Against
          </h3>
          <div className="text-3xl font-bold">
            {number(managerStats.totalPointsAgainst, {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="text-sm text-gray-500">
            {number(
              managerStats.totalPointsAgainst /
                (managerStats.totalWins +
                  managerStats.totalLosses +
                  managerStats.totalTies),
              { maximumFractionDigits: 2 }
            )}{" "}
            avg per game
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Achievements</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">🏆</div>
            <div className="text-lg font-semibold">
              {managerStats.championships}
            </div>
            <div className="text-sm text-gray-500">Championships</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-400">🥈</div>
            <div className="text-lg font-semibold">
              {managerStats.runnerUps}
            </div>
            <div className="text-sm text-gray-500">Runner-ups</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">🏈</div>
            <div className="text-lg font-semibold">{managerStats.playoffs}</div>
            <div className="text-sm text-gray-500">Playoffs</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">👑</div>
            <div className="text-lg font-semibold">
              {managerStats.scoringCrowns}
            </div>
            <div className="text-sm text-gray-500">Scoring Crowns</div>
          </div>
        </div>
      </div>

      {/* Season Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Season Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Year</th>
                <th className="text-left py-2">Record</th>
                <th className="text-left py-2">League Record</th>
                <th className="text-left py-2">Points</th>
                <th className="text-left py-2">Standing</th>
                <th className="text-left py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {managerStats.seasonStats.map((season) => (
                <tr key={season.year} className="border-b">
                  <td className="py-2 font-medium">{season.year}</td>
                  <td className="py-2">
                    {season.wins}-{season.losses}
                    {season.ties > 0 && `-${season.ties}`}
                  </td>
                  <td className="py-2">
                    {season.leagueWins}-{season.leagueLosses}
                    {season.leagueTies > 0 && `-${season.leagueTies}`}
                  </td>
                  <td className="py-2">
                    {number(season.pointsFor, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        season.finalStanding === 1
                          ? "bg-yellow-100 text-yellow-800"
                          : season.finalStanding <= 3
                          ? "bg-green-100 text-green-800"
                          : season.finalStanding <= 6
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {season.finalStanding}
                    </span>
                  </td>
                  <td className="py-2 space-x-2">
                    {season.madePlayoffs && (
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                        🏈 Playoffs
                      </span>
                    )}
                    {season.championshipResult && (
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          season.championshipResult === "champion"
                            ? "bg-yellow-100 text-yellow-800"
                            : season.championshipResult === "runner-up"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {season.championshipResult === "champion"
                          ? "🏆 Champion"
                          : season.championshipResult === "runner-up"
                          ? "🥈 Runner-up"
                          : ""}
                      </span>
                    )}
                    {season.scoringCrown && (
                      <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                        👑 Scoring Crown
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* H2H Records */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Manager</th>
                <th className="text-left py-2">Record</th>
                <th className="text-left py-2">Avg Points For</th>
                <th className="text-left py-2">Avg Points Against</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(managerStats.h2hRecords)
                .sort((a, b) => b.wins - a.wins)
                .map((record) => (
                  <tr key={record.managerId} className="border-b">
                    <td className="py-2 font-medium">{record.managerName}</td>
                    <td className="py-2">
                      {record.wins}-{record.losses}
                      {record.ties > 0 && `-${record.ties}`}
                    </td>
                    <td className="py-2">
                      {number(record.avgPointsFor, {
                        maximumFractionDigits: 1,
                      })}
                    </td>
                    <td className="py-2">
                      {number(record.avgPointsAgainst, {
                        maximumFractionDigits: 1,
                      })}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Best Seasons */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Best Seasons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Most Wins</h3>
            <div className="text-2xl font-bold">
              {managerStats.bestWinsSeason.wins} wins
            </div>
            <div className="text-gray-600">
              {managerStats.bestWinsSeason.year}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Most Points</h3>
            <div className="text-2xl font-bold">
              {number(managerStats.bestPointsSeason.points, {
                maximumFractionDigits: 0,
              })}{" "}
              points
            </div>
            <div className="text-gray-600">
              {managerStats.bestPointsSeason.year}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerDetail;

import { useFormatter } from "use-intl";

export interface ManagerStats {
  managerName: string;
  teamName: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;
  totalPointsFor: number;
  totalPointsAgainst: number;
  seasonStats: Array<{
    year: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    finalStanding: number;
    playoffResult?: string;
    scoringCrown?: boolean;
  }>;
  championships: number;
  runnerUps: number;
  scoringCrowns: number;
  playoffs: number;
  bestWinsSeason: {
    year: number;
    wins: number;
  };
  bestPointsSeason: {
    year: number;
    points: number;
  };
}

interface ManagerStatsCardProps {
  managerStats: ManagerStats;
}

const ManagerStatsCard = ({ managerStats }: ManagerStatsCardProps) => {
  const { number } = useFormatter();

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
    <>
      {/* Overall Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
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

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            League Performance
          </h3>
          <div className="text-3xl font-bold">
            {managerStats.leagueWins}-{managerStats.leagueLosses}
            {managerStats.leagueTies > 0 && `-${managerStats.leagueTies}`}
          </div>
          <div className="text-sm text-gray-500">
            {number(leagueWinPercentage, { maximumFractionDigits: 1 })}% league
            win rate
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Points For
          </h3>
          <div className="text-3xl font-bold">
            {number(managerStats.totalPointsFor, {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="text-sm text-gray-500">
            {number(
              managerStats.totalPointsFor / managerStats.seasonStats.length,
              {
                maximumFractionDigits: 0,
              }
            )}{" "}
            avg per season
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
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
              managerStats.totalPointsAgainst / managerStats.seasonStats.length,
              {
                maximumFractionDigits: 0,
              }
            )}{" "}
            avg per season
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Championships
          </h3>
          <div className="text-3xl font-bold">{managerStats.championships}</div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Finals</h3>
          <div className="text-3xl font-bold">
            {managerStats.runnerUps + managerStats.championships}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Scoring Crowns
          </h3>
          <div className="text-3xl font-bold">{managerStats.scoringCrowns}</div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Playoffs</h3>
          <div className="text-3xl font-bold">{managerStats.playoffs}</div>
        </div>
      </div>

      {/* Best Seasons */}
      <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
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
    </>
  );
};

export default ManagerStatsCard;

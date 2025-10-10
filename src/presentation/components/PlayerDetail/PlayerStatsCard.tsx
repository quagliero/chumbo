import { useFormatter } from "use-intl";

export interface PlayerStats {
  seasonsPlayed: number;
  totalGames: number;
  totalStarts: number;
  totalBench: number;
  totalPoints: number;
  averagePoints: number;
  highestScore: number;
  highestScoreGame: {
    year: number;
    week: number;
    opponent: string;
    points: number;
    wasStarted: boolean;
    matchupId: number;
    ownerId: string;
    teamName: string;
    isByeWeek?: boolean;
  } | null;
  ownerStats: Array<{
    ownerId: string;
    teamName: string;
    gamesPlayed: number;
    totalPoints: number;
    averagePoints: number;
    starts: number;
    bench: number;
  }>;
  performances: Array<{
    year: number;
    week: number;
    opponent: string;
    points: number;
    wasStarted: boolean;
    matchupId: number;
    ownerId: string;
    teamName: string;
    isByeWeek?: boolean;
  }>;
  achievements: {
    playoffGames: number;
    finalsAppearances: number;
    finalsWins: number;
  };
}

interface PlayerStatsCardProps {
  playerStats: PlayerStats;
}

const PlayerStatsCard = ({ playerStats }: PlayerStatsCardProps) => {
  const { number } = useFormatter();

  // Calculate ownership stats
  const ownershipStats = {
    mostGames: playerStats.ownerStats.reduce(
      (max, owner) => (owner.gamesPlayed > max.gamesPlayed ? owner : max),
      playerStats.ownerStats[0] || { gamesPlayed: 0, teamName: "N/A" }
    ),
    mostPoints: playerStats.ownerStats.reduce(
      (max, owner) => (owner.totalPoints > max.totalPoints ? owner : max),
      playerStats.ownerStats[0] || { totalPoints: 0, teamName: "N/A" }
    ),
    bestAverage: playerStats.ownerStats.reduce(
      (max, owner) => (owner.averagePoints > max.averagePoints ? owner : max),
      playerStats.ownerStats[0] || { averagePoints: 0, teamName: "N/A" }
    ),
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <h2 className="text-xl font-bold text-gray-900 px-6 py-4 border-b border-gray-200">
        Player Statistics
      </h2>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-6 py-6">
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Seasons Played
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.seasonsPlayed}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Games
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalGames}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Starts</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalStarts}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Bench</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalBench}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.totalPoints, { maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Average Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.averagePoints, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Highest Score
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.highestScore, { maximumFractionDigits: 2 })}
          </p>
          {playerStats.highestScoreGame && (
            <div className="mt-1">
              <p className="text-sm text-gray-600">
                vs {playerStats.highestScoreGame.opponent} (
                {playerStats.highestScoreGame.year}, Week{" "}
                {playerStats.highestScoreGame.week})
              </p>
              {!playerStats.highestScoreGame.wasStarted && (
                <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                  On the Bench!
                </span>
              )}
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Start Rate</h3>
          <p className="text-3xl font-bold text-gray-900">
            {(() => {
              const totalActiveGames =
                playerStats.totalStarts + playerStats.totalBench;
              return totalActiveGames > 0
                ? `${Math.round(
                    (playerStats.totalStarts / totalActiveGames) * 100
                  )}%`
                : "0%";
            })()}
          </p>
        </div>
      </div>

      {/* Achievement Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-6">
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Playoff Games</h3>
          <p className="text-2xl font-bold text-yellow-600">
            {playerStats.achievements.playoffGames}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">
            Finals Appearances
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {playerStats.achievements.finalsAppearances}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Championships</h3>
          <p className="text-2xl font-bold text-green-600">
            {playerStats.achievements.finalsWins}
          </p>
        </div>
      </div>

      {/* Ownership Stats */}
      {playerStats.ownerStats.length > 1 && (
        <div className="px-6 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Ownership Highlights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Most Games</h3>
              <p className="text-lg font-bold text-gray-900">
                {ownershipStats.mostGames.gamesPlayed}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.mostGames.teamName})
                </span>
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Most Points</h3>
              <p className="text-lg font-bold text-gray-900">
                {number(ownershipStats.mostPoints.totalPoints, {
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.mostPoints.teamName})
                </span>
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Best Average
              </h3>
              <p className="text-lg font-bold text-gray-900">
                {number(ownershipStats.bestAverage.averagePoints, {
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.bestAverage.teamName})
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerStatsCard;

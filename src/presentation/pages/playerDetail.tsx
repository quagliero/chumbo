import { useParams, useNavigate } from "react-router-dom";
import { getPlayerImageUrl } from "@/utils/playerImage";
import {
  usePlayerData,
  useDraftPicks,
  usePlayerStats,
} from "@/hooks/playerDetail";
import {
  OwnershipTable,
  PlayerStatsCard,
  DraftStatsCard,
  PerformanceTable,
} from "@/presentation/components/PlayerDetail";

const PlayerDetail = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  // Use custom hooks for data
  const { player, allNicknames } = usePlayerData(playerId);
  const { draftPicks, mostDraftedBy, draftRoundStats } =
    useDraftPicks(playerId);
  const playerStats = usePlayerStats(playerId);

  // Early return if no player data
  if (!player || !playerStats) {
    return (
      <div className="min-h-screen py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Player Not Found
            </h1>
            <p className="text-gray-600 mt-2">
              The requested player could not be found.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const playerImageUrl = getPlayerImageUrl(playerId || "");

  return (
    <div className="container mx-auto space-y-6">
      {/* Back Button */}
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Back
        </button>
      </div>

      {/* Player Header */}
      <div className="bg-white mb-8">
        <div className="">
          <div className="flex items-center">
            {playerImageUrl ? (
              <img
                src={playerImageUrl}
                alt={
                  player.full_name || `${player.first_name} ${player.last_name}`
                }
                className="h-24 w-24 rounded-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "/images/logo.png";
                }}
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500">
                {player.full_name?.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="ml-6">
              <h1 className="text-3xl font-bold text-gray-900">
                {player.full_name || `${player.first_name} ${player.last_name}`}
              </h1>
              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                <span className="font-medium">{player.position}</span>
                {player.team && <span>{player.team}</span>}
                {player.number != null && <span>#{player.number}</span>}
              </div>
              {allNicknames.length > 0 && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    {allNicknames.map((nickname, index) => (
                      <div key={index} className="relative group">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 cursor-help">
                          {nickname.nickname}
                        </span>
                        {/* Custom Tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          {nickname.managerName} in {nickname.year}
                          {/* Tooltip arrow */}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player Statistics */}
      <PlayerStatsCard playerStats={playerStats} />

      {/* Ownership Table */}
      {playerStats.ownerStats.length > 1 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <h2 className="text-xl font-bold text-gray-900 px-6 py-4 border-b border-gray-200">
            Ownership Breakdown
          </h2>
          <OwnershipTable data={playerStats.ownerStats} />
        </div>
      )}

      {/* Draft Breakdown */}
      <DraftStatsCard
        draftPicks={draftPicks}
        mostDraftedBy={mostDraftedBy}
        draftRoundStats={draftRoundStats}
      />

      {/* Performances Table */}
      <div className="mt-8">
        <PerformanceTable performances={playerStats.performances} />
      </div>
    </div>
  );
};

export default PlayerDetail;

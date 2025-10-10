import { useState } from "react";
import { Link } from "react-router-dom";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { MostDraftedPlayer } from "@/utils/managerStats";

interface MostDraftedPlayersProps {
  mostDraftedPlayers: MostDraftedPlayer[];
}

const MostDraftedPlayers = ({
  mostDraftedPlayers,
}: MostDraftedPlayersProps) => {
  const [displayCount, setDisplayCount] = useState<number>(12);

  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 px-6">
        Most Drafted Players
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6">
        {mostDraftedPlayers.slice(0, displayCount).map((player, index) => (
          <Link
            key={index}
            to={`/players/${player.playerId}`}
            className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-all overflow-hidden cursor-pointer group block"
          >
            {/* Player Info */}
            <div className="flex items-center mb-3">
              {(() => {
                const imageUrl = getPlayerImageUrl(player.playerId);
                return imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`${player.playerName} photo`}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500 mr-3">
                    {(player.playerName || "?").charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              <div>
                <div className="font-medium text-gray-900 text-sm">
                  {player.playerName}
                </div>
                <div className="text-xs text-gray-500">
                  {player.timesDrafted} times drafted
                </div>
              </div>
            </div>

            {/* Stats Details */}
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Years:</span>
                <span className="font-medium text-right">
                  {player.years.join(", ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Highest Pick:</span>
                <span className="font-medium text-right">
                  {player.bestPick.year} {player.bestPick.round}.
                  {player.bestPick.pick}
                </span>
              </div>
            </div>

            {/* Hover Effect */}
            <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view player →
            </div>
          </Link>
        ))}
      </div>

      {/* Show More Button */}
      {mostDraftedPlayers.length > displayCount && (
        <div className="text-center mt-6 px-6">
          <button
            onClick={() => setDisplayCount((prev) => prev + 12)}
            className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
          >
            Show More
          </button>
        </div>
      )}
    </div>
  );
};

export default MostDraftedPlayers;

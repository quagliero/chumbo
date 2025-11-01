import { Link } from "react-router-dom";
import { getPlayerImageUrl } from "@/utils/playerImage";

export interface PlayerSearchResult {
  player_id: string;
  full_name: string;
  position: string;
  fantasy_positions: string[];
  team: string | null | undefined;
  number: number | undefined;
}

interface PlayerResultsProps {
  searchResults: PlayerSearchResult[];
  searchTerm: string;
}

const PlayerResults = ({ searchResults, searchTerm }: PlayerResultsProps) => {
  const renderPlayerCard = (player: PlayerSearchResult) => {
    const playerImageUrl = getPlayerImageUrl(player.player_id, player.position);

    return (
      <Link
        key={player.player_id}
        to={`/players/${player.player_id}`}
        className="block"
      >
        <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 p-4 cursor-pointer group overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {playerImageUrl ? (
                <img
                  src={playerImageUrl}
                  alt={`${player.full_name} photo`}
                  className={`w-12 h-12 rounded-full object-cover ${
                    player.position === "DEF" ? "" : "rounded-full"
                  }`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-500">
                  {player.full_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                {player.full_name}
              </div>
              <div className="text-sm text-gray-600">
                {player.fantasy_positions?.join(", ")}
                {player.team && (
                  <span className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">
                    {player.team}
                  </span>
                )}
                {player.number && (
                  <span className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">
                    #{player.number}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* Search Results */}
      {searchTerm.trim() && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            {searchResults.length === 0
              ? "No players found matching your search."
              : `Found ${searchResults.length} player${
                  searchResults.length === 1 ? "" : "s"
                }`}
          </p>
        </div>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {searchResults.map(renderPlayerCard)}
        </div>
      )}
    </>
  );
};

export default PlayerResults;

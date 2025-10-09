import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { players, seasons } from "../../data";
import { getPlayerImageUrl } from "../../utils/playerImage";

interface PlayerSearchResult {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null | undefined;
  number: number | undefined;
}

const Players = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const searchLower = searchTerm.toLowerCase();
    const results: PlayerSearchResult[] = [];

    // Search through regular players from players.json
    Object.entries(players).forEach(([playerId, player]) => {
      const fullName =
        player.full_name ||
        `${player.first_name || ""} ${player.last_name || ""}`.trim();

      const nameMatch = fullName.toLowerCase().includes(searchLower);
      const positionMatch = (player.position || "UNK")
        .toLowerCase()
        .includes(searchLower);
      const teamMatch = player.team?.toLowerCase().includes(searchLower);
      const numberMatch = player.number?.toString().includes(searchTerm);

      if (nameMatch || positionMatch || teamMatch || numberMatch) {
        results.push({
          player_id: playerId,
          full_name: fullName,
          position: player.position || "UNK",
          team: player.team,
          number: player.number,
        });
      }
    });

    // Search through string-named players from matchup data
    const stringNamedPlayers = new Set<string>();

    // Collect all string-named players from all seasons
    Object.entries(seasons).forEach(([, seasonData]) => {
      Object.entries(seasonData.matchups || {}).forEach(([, weekMatchups]) => {
        weekMatchups.forEach((matchup) => {
          // Check players array for string names (those with spaces)
          matchup.players.forEach((playerId) => {
            if (typeof playerId === "string" && playerId.includes(" ")) {
              stringNamedPlayers.add(playerId);
            }
          });
        });
      });
    });

    // Add string-named players that match the search
    stringNamedPlayers.forEach((playerName) => {
      const nameMatch = playerName.toLowerCase().includes(searchLower);

      if (nameMatch) {
        // Get position from matchup data if available
        let position = "UNK";
        for (const [, seasonData] of Object.entries(seasons)) {
          Object.entries(seasonData.matchups || {}).forEach(
            ([, weekMatchups]) => {
              weekMatchups.forEach((matchup) => {
                if (
                  matchup.unmatched_players &&
                  matchup.unmatched_players[playerName]
                ) {
                  position = matchup.unmatched_players[playerName];
                }
              });
            }
          );
        }

        results.push({
          player_id: playerName,
          full_name: playerName,
          position: position,
          team: null,
          number: undefined,
        });
      }
    });

    // Sort and limit results
    return results
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, 100);
  }, [searchTerm]);

  const renderPlayerCard = (player: PlayerSearchResult) => {
    const playerImageUrl = getPlayerImageUrl(player.player_id, player.position);

    return (
      <Link
        key={player.player_id}
        to={`/players/${player.player_id}`}
        className="block"
      >
        <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 p-4 cursor-pointer group">
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
                {player.position}
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
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Players</h1>
        <p className="text-gray-600">
          Search for players who have played in The Chumbo
        </p>
      </div>

      {/* Search Box */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, position, team, or jersey number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>

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

      {/* Empty State */}
      {!searchTerm.trim() && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Search for Players
          </h3>
          <p className="text-gray-600">
            Enter a player name, position, team, or jersey number to find
            players who have played in The Chumbo.
          </p>
        </div>
      )}
    </div>
  );
};

export default Players;

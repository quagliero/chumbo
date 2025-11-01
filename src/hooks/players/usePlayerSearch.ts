import { useMemo } from "react";
import { players, seasons } from "@/data";
import { Player } from "@/types/player";
import { PlayerSearchResult } from "@/presentation/components/Players";

export const usePlayerSearch = (searchTerm: string) => {
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const searchLower = searchTerm.toLowerCase();
    const results: PlayerSearchResult[] = [];

    // Search through regular players from all players.json files (root + year-specific)
    const allPlayers = new Map<string, Player>();

    // Add root players.json
    Object.entries(players).forEach(([playerId, player]) => {
      allPlayers.set(playerId, player);
    });

    // Add year-specific players.json files
    Object.entries(seasons).forEach(([, seasonData]) => {
      if (seasonData.players) {
        Object.entries(seasonData.players).forEach(([playerId, player]) => {
          // Only add if not already present (year-specific takes precedence)
          if (!allPlayers.has(playerId)) {
            allPlayers.set(playerId, player);
          }
        });
      }
    });

    // Search through all collected players
    allPlayers.forEach((player, playerId) => {
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
          fantasy_positions: player.fantasy_positions || [],
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
          fantasy_positions: [position],
        });
      }
    });

    // Sort and limit results
    return results
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, 100);
  }, [searchTerm]);

  return searchResults;
};

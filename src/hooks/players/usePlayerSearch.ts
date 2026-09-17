import { useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { players } from "@/data";
import { legacyPlayers } from "@/data/legacyPlayers";
import { PlayerSearchResult } from "@/presentation/components/Players";

/** The most results a page of cards is worth rendering. */
const LIMIT = 100;

/**
 * Everything matching `term`, from the two corpora that exist.
 *
 * Both are eager: the base dictionary (A5) and the committed legacy-name table
 * (`@/data/legacyPlayers`). Nothing here reads `seasons`, deliberately — it used
 * to sweep every season's matchups for the legacy names, and after A2a made
 * matchups lazy that sweep saw only the seasons the visitor had already opened.
 * The same query then answered differently depending on where they had been,
 * and the page's fix for that was to download the whole archive.
 *
 * Exported as a plain function because it is one: the hook below is a debounce
 * and a memo around it, and a test can ask it a question without a renderer.
 */
export const searchPlayers = (term: string): PlayerSearchResult[] => {
  if (!term.trim()) return [];

  const searchLower = term.toLowerCase();
  const results: PlayerSearchResult[] = [];

  // The base dictionary is the union of every snapshot we have ever held, so it
  // is already the full search corpus. Search has no season context, so results
  // carry each player's most recent team.
  Object.entries(players).forEach(([playerId, player]) => {
    const fullName =
      player.full_name ||
      `${player.first_name || ""} ${player.last_name || ""}`.trim();

    const nameMatch = fullName.toLowerCase().includes(searchLower);
    const positionMatch = (player.position || "UNK")
      .toLowerCase()
      .includes(searchLower);
    const teamMatch = player.team?.toLowerCase().includes(searchLower);
    const numberMatch = player.number?.toString().includes(term);

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

  // The pre-Sleeper seasons stored some players as a literal name rather than an
  // id, so they are not in the dictionary at all. Matched on name only, as
  // before: a name is all the archive recorded, and their position comes from
  // `unmatched_players` rather than from a scouting record of their own.
  Object.entries(legacyPlayers).forEach(([playerName, position]) => {
    if (!playerName.toLowerCase().includes(searchLower)) return;

    results.push({
      player_id: playerName,
      full_name: playerName,
      position,
      team: null,
      number: undefined,
      fantasy_positions: [position],
    });
  });

  return results
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .slice(0, LIMIT);
};

export const usePlayerSearch = (searchTerm: string) => {
  // Filtering the dictionary is cheap; re-rendering the result list for a
  // broad prefix like "a" is not. Debounce so a fast typist pays once.
  const debouncedTerm = useDebouncedValue(searchTerm);

  return useMemo(() => searchPlayers(debouncedTerm), [debouncedTerm]);
};

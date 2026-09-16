import { getPlayer } from "@/data";

/**
 * The display name for a player id, as the manager stats lists want it.
 *
 * Defences are stored as first name + last name ("New England" + "Patriots");
 * everyone else has a `full_name`. `fallback` is used when the id is not in the
 * dictionary at all, or the entry has no usable name — the two call sites want
 * different fallbacks, so it is a parameter.
 *
 * `year` picks up that season's team/position overlay where one exists.
 */
export const resolvePlayerName = (
  playerId: string,
  year: number | undefined,
  fallback: string
): string => {
  const player = getPlayer(playerId, year);
  if (!player) return fallback;

  if (player.position === "DEF") {
    return `${player.first_name} ${player.last_name}`;
  }

  return (
    player.full_name ||
    (player.first_name && player.last_name
      ? `${player.first_name} ${player.last_name}`
      : fallback)
  );
};

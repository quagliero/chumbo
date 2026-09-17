import { getPlayer } from "@/data";
import { YEARS } from "@/domain/constants";

/**
 * The site's one link affordance. Everything that navigates uses this so a link
 * looks the same in a table cell, a stat card and a trade card. Do not fork it.
 */
export const LINK_CLASS = "text-blue-600 hover:text-blue-800 hover:underline";

/**
 * `/players/:playerId` renders "Player Not Found" exactly when `getPlayer`
 * comes back empty. That covers the empty roster slot ("0") and any id the
 * dictionary has never heard of; the legacy string-named players of 2012–2015
 * ("Michael Turner", "Tony Gonzalez") do resolve, because `getPlayer`
 * synthesises a record for them and the old matchups key their points by the
 * same string. Call this before rendering a player link — a name with no page
 * behind it should stay plain text.
 */
export const hasPlayerPage = (
  playerId: string | number | null | undefined
): boolean => {
  if (playerId === null || playerId === undefined) return false;
  const id = playerId.toString().trim();
  if (id === "" || id === "0") return false;
  return Boolean(getPlayer(id));
};

/**
 * `/seasons/:year` only has something to show for a season the app knows about.
 * Trades can name a future draft pick ("a 2027 2nd"), so check before linking.
 */
export const hasSeasonPage = (year: number | string): boolean =>
  YEARS.includes(Number(year) as (typeof YEARS)[number]);

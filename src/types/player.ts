/**
 * The eight fields the app actually reads.
 *
 * Sleeper's `/players/nfl` dump carries ~52 fields per player; the other 44 were
 * costing 17.3 MB of bundle and were never referenced. `scripts/build-players.js`
 * trims them. Keeping this interface exact (rather than the old open-ended
 * `[key: string]: any`) is what makes the compiler point at anything that quietly
 * depends on a field that no longer ships.
 */
export interface Player {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  team?: string | null;
  position?: string;
  fantasy_positions?: string[];
  number?: number;
}

/**
 * A season's corrections to the base dictionary: `t` is the team and `p` the
 * position *as at that season*, present only where they differed from base.
 *
 * Sleeper only ever reports current state, so without this a player traded in
 * 2026 would appear on his 2026 team in every season back to 2012.
 */
export interface PlayerOverlayEntry {
  t?: string | null;
  p?: string;
}

export type PlayerOverlay = Record<string, PlayerOverlayEntry>;

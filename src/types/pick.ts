export interface Pick {
  round: number;
  pick_no: number;
  picked_by: string;
  draft_slot: number;
  player_id: string;
  roster_id: number;
  position?: string;
}

/**
 * A1e: `metadata`, `draft_id`, `is_keeper` and `reactions` were removed from the
 * committed data. The metadata block duplicated the player dictionary — 71% of
 * picks.json — and was never displayed, because `getPlayer()` resolves for all
 * 2,640 picks. The other three were read by nothing. See scripts/trim-picks.js.
 *
 * Nothing extends Pick any more; the alias is kept so existing imports of
 * ExtendedPick keep working.
 */
export type ExtendedPick = Pick;

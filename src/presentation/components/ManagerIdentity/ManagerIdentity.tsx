import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";

/**
 * A manager's avatar and name, in a table cell.
 *
 * On a phone the name is the manager's HANDLE (`thd`, `hadkiss`), not the team
 * name. That is not a truncation — it is the identifier the league already uses
 * for each other, and it is what the Managers page leads with.
 *
 * The reason is width. On a 375px screen the standings table has a 343px
 * container; pinning Rank and Team cost 222px of it, leaving 121px to read the
 * numbers you scrolled sideways for. Team names run to 25 characters ("King of
 * Wishful Tinkering"), so they also wrapped to three lines and made row heights
 * vary between 57 and 85px.
 *
 * Handles are at most 7 characters and unique, so the pinned region drops to
 * roughly 150px and every row is one line. Truncating the team name instead
 * would fit, but yields "King of Wi…", "Wolverhamp…", "Zaragoza's…" — less
 * recognisable than the handle and uglier.
 *
 * The full team name is still there from `sm:` upwards.
 */
export const ManagerIdentity = ({
  ownerId,
  managerId,
  teamName,
  avatarUrl,
  showAvatar = true,
}: {
  ownerId?: string;
  /** When the caller already knows the internal id and has no Sleeper owner id. */
  managerId?: string;
  teamName: string;
  avatarUrl?: string | null;
  /**
   * Tables that never showed an avatar keep not showing one — adding them is a
   * separate change (F1a), not a side effect of fixing name overflow.
   */
  showAvatar?: boolean;
}) => {
  const handle =
    managerId ?? (ownerId ? getManagerIdBySleeperOwnerId(ownerId) : undefined);

  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      {!showAvatar ? null : avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-sunk flex items-center justify-center text-xs font-medium text-ink-muted shrink-0"
        >
          {teamName.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Phone: the handle. Never wraps, so rows keep a single height. */}
      <span className="sm:hidden whitespace-nowrap">{handle ?? teamName}</span>
      {/* From sm up there is room for the full team name. */}
      <span className="hidden sm:inline">{teamName}</span>
    </div>
  );
};

export default ManagerIdentity;

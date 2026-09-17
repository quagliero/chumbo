import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import type { ExtendedUser } from "@/types/user";

/**
 * A manager's avatar as a data URI, for a share card.
 *
 * Embedded rather than referenced: G1 proved that an SVG rendered through an
 * `<img>` makes no network request at all, and paints a broken-image
 * placeholder across the card instead of leaving a hole. Returns null on any
 * failure, because a missing face must never be the reason a card is not
 * shared.
 */
export const avatarDataUri = async (
  embedImage: (url: string) => Promise<string | null>,
  users: ExtendedUser[] | undefined,
  ownerId: string | undefined
): Promise<string | null> => {
  if (!ownerId) return null;
  const user = getUserByOwnerId(ownerId, users);
  const url = user ? getUserAvatarUrl(user) : null;
  return url ? embedImage(url) : null;
};

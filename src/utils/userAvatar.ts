import { ExtendedUser } from "@/types/user";

/**
 * Generates the avatar URL for a user
 * @param user The user object from season data
 * @returns The avatar URL or null if no avatar available
 */
export const getUserAvatarUrl = (user?: ExtendedUser): string | null => {
  if (!user) return null;

  // The pre-Sleeper seasons carry a picture in metadata rather than an avatar
  // hash. Those used to be absolute fantasy.nfl.com URLs; NFL.com's fantasy
  // platform is gone, so 2012-2018 now point at `/avatars/nfl/...` — the same
  // images, recovered from a browser cache and served from `public/`. Both
  // shapes are accepted because a Sleeper season could still supply an absolute
  // one, and a manager whose logo could not be recovered carries "" so that the
  // caller takes its monogram branch instead of painting a broken image.
  const metadataAvatar = user.metadata?.avatar;
  if (
    metadataAvatar &&
    (metadataAvatar.startsWith("http") || metadataAvatar.startsWith("/"))
  ) {
    return metadataAvatar;
  }

  // Otherwise, construct URL from avatar hash using Sleeper's avatar API
  if (user.avatar) {
    return `https://sleepercdn.com/avatars/${user.avatar}`;
  }

  return null;
};

/**
 * Gets a user by owner ID from a users array
 * @param ownerId The Sleeper owner ID
 * @param users Array of users from season data
 * @returns The user object or undefined
 */
export const getUserByOwnerId = (
  ownerId: string,
  users?: ExtendedUser[]
): ExtendedUser | undefined => {
  if (!users) return undefined;
  return users.find((u) => u.user_id === ownerId);
};

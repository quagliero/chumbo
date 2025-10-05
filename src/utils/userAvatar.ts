import { ExtendedUser } from "../types/user";

/**
 * Generates the avatar URL for a user
 * @param user The user object from season data
 * @returns The avatar URL or null if no avatar available
 */
export const getUserAvatarUrl = (user?: ExtendedUser): string | null => {
  if (!user) return null;

  // First check if there's a full URL in metadata
  if (user.metadata?.avatar && user.metadata.avatar.startsWith("http")) {
    return user.metadata.avatar;
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

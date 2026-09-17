import managers from "@/data/managers.json";
import { getUserAvatarUrl } from "@/utils/userAvatar";
import type { ExtendedUser } from "@/types/user";

/**
 * Each manager's avatar, resolved across every season (F1a).
 *
 * `userAvatar.ts` has existed the whole time and every matchup card uses it;
 * the one page that is literally about the people did not. The reason it was
 * awkward is that an avatar is a property of a Sleeper *user in a season*, not
 * of a manager — `seasons[year].users` — and the Managers page has no season.
 *
 * So: newest season wins. A manager's current picture is the one they would
 * recognise as theirs, and it is also the only one the departed managers have a
 * choice about — five of them last played between 2012 and 2018, and their
 * entry there is an NFL.com URL carried through the Sleeper import rather than
 * a Sleeper avatar hash. `getUserAvatarUrl` already handles both.
 *
 * Returns `null` rather than omitting a manager, so a card can tell "no picture
 * on file" from "manager not found" and fall back to a monogram either way.
 */
export const resolveManagerAvatars = (
  years: readonly number[],
  usersFor: (year: number) => ExtendedUser[] | undefined
): Record<string, string | null> => {
  const resolved: Record<string, string | null> = Object.fromEntries(
    managers.map((manager) => [manager.id, null])
  );

  // Newest first, and stop looking at a manager once they are found: the first
  // hit is the most recent season they had a picture in.
  const newestFirst = [...years].sort((a, b) => b - a);

  for (const year of newestFirst) {
    const users = usersFor(year);
    if (!users?.length) continue;

    for (const manager of managers) {
      if (resolved[manager.id]) continue;
      const sleeperId = manager.sleeper?.id;
      if (!sleeperId) continue;

      const url = getUserAvatarUrl(users.find((u) => u.user_id === sleeperId));
      if (url) resolved[manager.id] = url;
    }
  }

  return resolved;
};

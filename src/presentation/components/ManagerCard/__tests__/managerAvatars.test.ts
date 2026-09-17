import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import managers from "@/data/managers.json";
import type { ExtendedUser } from "@/types/user";
import { resolveManagerAvatars } from "../managerAvatars";

const user = (overrides: Partial<ExtendedUser>): ExtendedUser =>
  ({
    user_id: "x",
    display_name: "x",
    league_id: "1",
    avatar: "",
    is_bot: null,
    is_owner: false,
    settings: null,
    metadata: { avatar: "", team_name: "" },
    ...overrides,
  }) as ExtendedUser;

const thd = managers[0].sleeper.id;

describe("resolveManagerAvatars", () => {
  it("prefers the newest season a manager has a picture in", () => {
    const byYear: Record<number, ExtendedUser[]> = {
      2012: [user({ user_id: thd, avatar: "old" })],
      2013: [user({ user_id: thd, avatar: "new" })],
    };
    // Deliberately passed oldest-first: the function sorts, so a caller that
    // hands over YEARS in its natural order still gets the current picture.
    const resolved = resolveManagerAvatars([2012, 2013], (y) => byYear[y]);
    expect(resolved[managers[0].id]).toBe("https://sleepercdn.com/avatars/new");
  });

  it("falls back to an older season when the newest has no picture", () => {
    const byYear: Record<number, ExtendedUser[]> = {
      2012: [user({ user_id: thd, avatar: "old" })],
      2013: [user({ user_id: thd })],
    };
    const resolved = resolveManagerAvatars([2012, 2013], (y) => byYear[y]);
    expect(resolved[managers[0].id]).toBe("https://sleepercdn.com/avatars/old");
  });

  it("takes the full URL the pre-Sleeper seasons carry in metadata", () => {
    const url = "https://static.www.nfl.com/logos/avatar/DEF.png";
    const resolved = resolveManagerAvatars([2012], () => [
      user({ user_id: thd, metadata: { avatar: url, team_name: "" } }),
    ]);
    expect(resolved[managers[0].id]).toBe(url);
  });

  it("returns a null entry for every manager, not a missing one", () => {
    const resolved = resolveManagerAvatars([2012], () => []);
    for (const manager of managers) {
      expect(resolved).toHaveProperty(manager.id);
      expect(resolved[manager.id]).toBeNull();
    }
  });

  /**
   * The point of F1a is that the page shows faces. If a future data fetch
   * changes `users.json` in a way that breaks the join — a manager's Sleeper id
   * changing, say — the page silently degrades to monograms and nobody notices.
   * This is the thing that notices.
   */
  it("finds a picture for every manager in the real data", () => {
    const resolved = resolveManagerAvatars(
      YEAR_NUMBERS,
      (year) => seasons[year as keyof typeof seasons]?.users
    );
    const missing = managers
      .filter((manager) => !resolved[manager.id])
      .map((manager) => manager.id);
    expect(missing).toEqual([]);
  });
});

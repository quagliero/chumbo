import { describe, expect, it } from "vitest";
import { getTeamName } from "@/utils/teamName";
import type { ExtendedUser } from "@/types/user";

const user = (id: string, teamName?: string, displayName?: string) =>
  ({
    user_id: id,
    display_name: displayName,
    metadata: teamName === undefined ? {} : { team_name: teamName },
  }) as unknown as ExtendedUser;

/**
 * Eight team names in the Sleeper data carry trailing whitespace — rich's every
 * season since 2021, plus "#Narrative " and "Garbage ". The old implementation
 * tested `.trim() !== ""` and then returned the untrimmed string, so the space
 * reached every table, heading and share card that asked for a name.
 */
describe("getTeamName", () => {
  it("trims the name, at every level of the fallback", () => {
    expect(getTeamName("u1", [user("u1", "Zaragozas Zooting Zorro ")])).toBe(
      "Zaragozas Zooting Zorro"
    );
    expect(getTeamName("u1", [user("u1", "  #Narrative  ")])).toBe("#Narrative");
    expect(getTeamName("u1", [user("u1", undefined, " Norm ")])).toBe("Norm");
  });

  it("treats a whitespace-only team name as absent", () => {
    // Otherwise a page renders an invisible heading.
    expect(getTeamName("u1", [user("u1", "   ", "Fallback")])).toBe("Fallback");
  });

  it("prefers the season's name over the canonical one", () => {
    // A team name belongs to a season: rich's 2022 page should say what his
    // team was called in 2022, not what it is called now.
    expect(getTeamName("u1", [user("u1", "Zaragozas Zooting Zoro")])).toBe(
      "Zaragozas Zooting Zoro"
    );
  });

  it("says Unknown rather than guessing", () => {
    expect(getTeamName("nobody", [])).toBe("Unknown");
  });
});

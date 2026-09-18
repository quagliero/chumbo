import { describe, expect, it } from "vitest";
import { getStatContext } from "@/utils/stats";
import { handoverOwners, interimManager } from "@/utils/interimManagers";

describe("interim managers (I5)", () => {
  it("finds the three handovers", () => {
    expect([...handoverOwners()].sort()).toEqual([
      [2015, "sol"],
      [2016, "phil"],
      [2020, "sol"],
    ]);
  });

  /**
   * The rule: whoever built the team owns its record. If the site credited a
   * handover season to the stand-in — or split it — then "managed by" would
   * be annotating the wrong team, so check the owner the rule picks is the
   * one the games are credited to, and the stand-in has no games of their own.
   */
  it("agrees with who the site credits for each of those seasons", () => {
    const { games } = getStatContext();
    for (const [year, owner] of handoverOwners()) {
      const credited = new Set(
        games.filter((g) => g.year === year).map((g) => g.managerId)
      );
      expect(credited.has(owner), `${owner} in ${year}`).toBe(true);
      for (const week of [1, 8, 9, 10, 16]) {
        const stand = interimManager(year, week, owner);
        if (stand) expect(credited.has(stand), `${stand} in ${year}`).toBe(false);
      }
    }
  });

  it("names the stand-in only for their weeks", () => {
    expect(interimManager(2015, 8, "sol")).toBeUndefined();
    expect(interimManager(2015, 9, "sol")).toBe("phil");
    expect(interimManager(2016, 10, "phil")).toBe("nick");
    expect(interimManager(2020, 8, "sol")).toBe("chris");
    expect(interimManager(2020, 9, "sol")).toBeUndefined();
    // Not somebody else's team.
    expect(interimManager(2015, 9, "thd")).toBeUndefined();
  });
});

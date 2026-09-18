import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getSeasonCrowns } from "@/utils/crowns";
import { describeH2HStreak, type H2HGame } from "@/utils/h2h";
import { getManagerStats } from "@/utils/managerStats";
import {
  h2hData,
  managerCareerData,
  managerSeasonData,
} from "../cardData";

const game = (year: number, week: number, result: H2HGame["result"]): H2HGame => ({
  year,
  week,
  result,
  pointsFor: 0,
  pointsAgainst: 0,
});

describe("the H2H streak phrase", () => {
  it("names the winner of a run, most recent game first, whatever the input order", () => {
    const games = [game(2024, 3, "W"), game(2023, 5, "L"), game(2024, 9, "W"), game(2025, 1, "W")];
    expect(describeH2HStreak(games, "thd", "jay")).toBe(
      "thd has won the last three regular-season meetings"
    );
  });

  it("says nothing for a run shorter than three, or a tie", () => {
    expect(describeH2HStreak([game(2025, 1, "L"), game(2024, 1, "L")], "a", "b")).toBeUndefined();
    expect(
      describeH2HStreak([game(2025, 1, "T"), game(2024, 1, "T"), game(2023, 1, "T")], "a", "b")
    ).toBeUndefined();
  });

  it("gives every pairing's card the same streak from either side", () => {
    // Read from the other side, the same run belongs to the same person.
    const pair = h2hData("thd", "jay");
    const flipped = h2hData("jay", "thd");
    expect(pair?.streak).toBe(flipped?.streak);
    expect(pair?.wins).toBe(flipped?.losses);
  });
});

const decided = YEAR_NUMBERS.filter(
  (year) => (seasons[year]?.winners_bracket?.length ?? 0) > 0
);

describe("the season badge", () => {
  it("follows the league's taxonomy against crowns.ts, for every settled season", () => {
    let scumbos = 0;
    for (const year of decided) {
      for (const crown of getSeasonCrowns(year)) {
        const badge = managerSeasonData(crown.managerId, year)?.badge;
        const expected =
          crown.crownLegs === 3
            ? "Triple Crown"
            : crown.champion
              ? "Champion"
              : crown.scumboLegs === 3
                ? "Triple Scumbo"
                : crown.worstAllPlay
                  ? "Scumbo"
                  : undefined;
        expect(badge, `${crown.managerId} ${year}`).toBe(expected);
        if (badge === "Scumbo" || badge === "Triple Scumbo") scumbos += 1;
      }
    }
    // One Scumbo a season (ties aside) — the worst breakdown, whether or not
    // it came with last place. The old OG rule, three legs only, found far
    // fewer; this catches the regression back to it.
    expect(scumbos).toBeGreaterThanOrEqual(decided.length);
  });

  it("claims no finish or badge for a season still being played", () => {
    const live = YEAR_NUMBERS.filter((y) => !decided.includes(y) && seasons[y]?.rosters?.length);
    for (const year of live) {
      for (const m of managers) {
        const data = managerSeasonData(m.id, year);
        if (!data) continue;
        expect(data.finish).toBeUndefined();
        expect(data.badge).toBeUndefined();
      }
    }
  });
});

describe("the career card", () => {
  it("counts the same record as the manager page, regular season", () => {
    for (const m of managers) {
      const data = managerCareerData(m.id);
      const stats = getManagerStats(m.id, "regular");
      if (!data || !stats) continue;
      expect([data.wins, data.losses, data.ties]).toEqual([
        stats.totalWins,
        stats.totalLosses,
        stats.totalTies,
      ]);
      expect(data.titles).toBeLessThanOrEqual(data.seasons);
    }
  });

  it("gives dix three titles", () => {
    expect(managerCareerData("dix")?.titles).toBe(3);
  });
});

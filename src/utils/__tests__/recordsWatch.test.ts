import { describe, expect, it } from "vitest";
import {
  MIN_PACE_GAMES,
  buildRecordsWatch,
  nextPointsMilestone,
  nextWinMilestone,
  type WatchInput,
} from "@/utils/recordsWatch";
import { computeStat } from "@/utils/stats";

/**
 * The records watch (J3).
 *
 * The watch is the one thing on the site that talks about what has NOT
 * happened, so what these check is the restraint: that it says nothing from
 * two games, nothing about a record that is not nearly in reach, and nothing
 * at all in an off-season — and that when it does speak, the sentence carries
 * the games played and the games left.
 *
 * The sentences are asserted against fixed inputs rather than the live season,
 * per the J1 rule: a test that pinned this week's pace would fail on Tuesday.
 */

const noStreaks = () => ({
  current: new Map<string, { kind: "win" | "loss"; count: number }>(),
  longest: { win: { count: 12, managerId: "jay" }, loss: { count: 10, managerId: "thd" } },
});

const input = (overrides: Partial<WatchInput> = {}): WatchInput => ({
  games: 14,
  teams: [{ managerId: "dix", played: 8, points: 1000 }],
  // Points per game: sol's 1,588.36 over fourteen games in 2013.
  seasonRecord: { value: 113.45, managerId: "sol", year: 2013 },
  careers: [],
  streaks: noStreaks(),
  nameOf: (id) => id,
  ...overrides,
});

describe("what the watch will not say", () => {
  it("says nothing at all before a ball is kicked", () => {
    const items = buildRecordsWatch(
      input({
        teams: [{ managerId: "dix", played: 0, points: 0 }],
        careers: [{ managerId: "dix", wins: 99, points: 19900, perGame: 120 }],
      })
    );
    expect(items).toEqual([]);
  });

  it("will not project a season from three games", () => {
    const three = buildRecordsWatch(
      input({ teams: [{ managerId: "dix", played: 3, points: 600 }] })
    );
    expect(three).toEqual([]);

    // The same points per game, one more game played, and it is worth saying.
    const four = buildRecordsWatch(
      input({ teams: [{ managerId: "dix", played: MIN_PACE_GAMES, points: 800 }] })
    );
    expect(four).toHaveLength(1);
  });

  it("ignores a pace that is not nearly the record", () => {
    // 100 a game against a record of 113.45: a good year, not a watch.
    const items = buildRecordsWatch(
      input({ teams: [{ managerId: "dix", played: 7, points: 700 }] })
    );
    expect(items).toEqual([]);
  });

  it("ignores a run that is not nearly the longest", () => {
    const items = buildRecordsWatch(
      input({
        teams: [{ managerId: "dix", played: 8, points: 800 }],
        streaks: {
          ...noStreaks(),
          current: new Map([["dix", { kind: "win" as const, count: 9 }]]),
        },
      })
    );
    expect(items.filter((item) => item.kind === "streak")).toEqual([]);
  });

  it("will not watch a milestone nobody has the games left to reach", () => {
    const career = [{ managerId: "dix", wins: 97, points: 10, perGame: 120 }];
    // Three wins short with four games left: worth watching.
    expect(
      buildRecordsWatch(
        input({ teams: [{ managerId: "dix", played: 10, points: 1000 }], careers: career })
      ).some((item) => item.text.includes("three wins from 100"))
    ).toBe(true);
    // Three wins short with two to play: arithmetic says no.
    expect(
      buildRecordsWatch(
        input({ teams: [{ managerId: "dix", played: 12, points: 1200 }], careers: career })
      ).some((item) => item.kind === "milestone")
    ).toBe(false);
  });

  it("will not watch a milestone for somebody who is not playing", () => {
    const items = buildRecordsWatch(
      input({ careers: [{ managerId: "phil", wins: 24, points: 10, perGame: 100 }] })
    );
    expect(items.filter((item) => item.kind === "milestone")).toEqual([]);
  });
});

describe("what it says when it does speak", () => {
  it("names the average, the games left and whose record it is", () => {
    const [item] = buildRecordsWatch(
      input({ teams: [{ managerId: "dix", played: 8, points: 950 }] })
    );
    expect(item.text).toBe(
      // The average is a tenth (it is still moving); the record is the
      // hundredth the list shows, because a reader can click through to it.
      "is averaging 118.8 a game with six games to play — above the best season ever, 113.45 (sol, 2013)."
    );
    expect(item.href).toBe("/records/most-points-season");
  });

  it("does not tell someone they are chasing their own record", () => {
    const [item] = buildRecordsWatch(
      input({
        teams: [{ managerId: "sol", played: 8, points: 950 }],
        seasonRecord: { value: 113.45, managerId: "sol", year: 2013 },
      })
    );
    expect(item.text).toContain("above the best season ever, 113.45 (their own, from 2013)");
  });

  it("compares averages, so a thirteen-game season is a fair record", () => {
    // 2014-2020 played thirteen games. Per game, a record from one of those
    // is the same measure as this season's.
    const [item] = buildRecordsWatch(
      input({
        seasonRecord: { value: 118.07, managerId: "sol", year: 2020 },
        teams: [{ managerId: "dix", played: 8, points: 930 }],
      })
    );
    expect(item.text).toBe(
      "is averaging 116.3 a game with six games to play, just short of the best season ever: 118.07 (sol, 2020)."
    );
  });

  it("counts a run that has already passed the record as the record", () => {
    const [item] = buildRecordsWatch(
      input({
        streaks: {
          ...noStreaks(),
          current: new Map([["dix", { kind: "win" as const, count: 13 }]]),
        },
        teams: [{ managerId: "dix", played: 8, points: 800 }],
      })
    );
    expect(item.text).toBe(
      "has won thirteen straight: the longest winning run in Chumbo history."
    );
  });

  it("has words for equalling it, and for equalling your own", () => {
    const equalled = buildRecordsWatch(
      input({
        streaks: {
          ...noStreaks(),
          current: new Map([["dix", { kind: "loss" as const, count: 10 }]]),
        },
        teams: [{ managerId: "dix", played: 8, points: 800 }],
      })
    )[0];
    expect(equalled.text).toBe(
      "has lost ten straight, equalling the longest losing run in Chumbo history (thd's 10)."
    );
    expect(equalled.href).toBe("/records/longest-loss-streak");

    const own = buildRecordsWatch(
      input({
        streaks: {
          ...noStreaks(),
          current: new Map([["thd", { kind: "loss" as const, count: 10 }]]),
        },
        teams: [{ managerId: "thd", played: 8, points: 800 }],
      })
    )[0];
    expect(own.text).toBe(
      "has lost ten straight — their own record losing run, equalled."
    );
  });

  it("puts a milestone in weeks when it is points", () => {
    const [item] = buildRecordsWatch(
      input({
        teams: [{ managerId: "dix", played: 8, points: 800 }],
        careers: [{ managerId: "dix", wins: 10, points: 14750, perGame: 120 }],
      })
    );
    expect(item.text).toBe(
      "is 250.0 points from 15,000 in the regular season — about two games at that average."
    );
  });

  it("ranks a record about to fall above a milestone weeks away", () => {
    const items = buildRecordsWatch(
      input({
        teams: [
          { managerId: "dix", played: 8, points: 950 },
          { managerId: "thd", played: 8, points: 700 },
        ],
        careers: [{ managerId: "thd", wins: 96, points: 10, perGame: 120 }],
      })
    );
    expect(items.map((item) => item.kind)).toEqual(["season-points", "milestone"]);
  });
});

describe("the milestones themselves", () => {
  it("are every 25th win and every 5,000th point", () => {
    expect(nextWinMilestone(98)).toBe(100);
    expect(nextWinMilestone(100)).toBe(125);
    expect(nextPointsMilestone(14719)).toBe(15000);
    expect(nextPointsMilestone(15000)).toBe(20000);
  });
});

describe("the published stat", () => {
  it("is about one season, and every line is a manager and a sentence", () => {
    // No assertion on the CONTENT: it is the live season's, and it moves every
    // Tuesday. What must hold is the shape the rail relies on.
    const entries = computeStat("records-watch");
    const years = new Set(entries.map((entry) => entry.year));
    expect(years.size).toBeLessThanOrEqual(1);
    for (const entry of entries) {
      expect(entry.detail, JSON.stringify(entry)).toMatch(/^(is|has) .+\.$/);
      expect(entry.href).toMatch(/^\/records\//);
      expect(entry.value).toBeGreaterThan(0);
      expect(entry.value).toBeLessThanOrEqual(100);
    }
  });
});

import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { isWeekCompleted } from "@/utils/weekUtils";
import {
  findRandomMatchup,
  matchupHref,
  playedMatchups,
  pickOne,
  RandomMatchupTarget,
} from "../findRandomMatchup";

/**
 * The dice has one job and one way to fail: land on a game that is not there.
 * These assertions are the acceptance test for E5 — a target is only valid if
 * the week was played and exactly two rosters shared that matchup id.
 */
const assertReal = (target: RandomMatchupTarget) => {
  const season = seasons[target.year];
  expect(season, `no season ${target.year}`).toBeDefined();

  const week = season.matchups[
    String(target.week) as keyof typeof season.matchups
  ];
  expect(week, `${target.year} week ${target.week} is not loaded`).toBeDefined();
  expect(isWeekCompleted(target.week, season.league)).toBe(true);

  const sides = (week ?? []).filter(
    (entry) => entry.matchup_id === target.matchupId
  );
  expect(
    sides,
    `${target.year} w${target.week} m${target.matchupId} is not a pairing`
  ).toHaveLength(2);
  expect(sides[0].points + sides[1].points).toBeGreaterThan(0);
};

describe("playedMatchups", () => {
  it("finds six pairings a week across a completed season", () => {
    const games = playedMatchups(2018, seasons[2018]);
    expect(games.length).toBeGreaterThan(80);
    games.forEach(assertReal);
  });

  it("skips byes rather than returning a half matchup", () => {
    // From 2020 the playoff weeks carry four rosters with a null matchup_id.
    const byeWeeks = seasons[2021].matchups["15"] ?? [];
    expect(byeWeeks.filter((entry) => entry.matchup_id === null)).toHaveLength(
      4
    );

    const week15 = playedMatchups(2021, seasons[2021]).filter(
      (target) => target.week === 15
    );
    expect(week15).toHaveLength(4);
    week15.forEach(assertReal);
  });

  it("returns nothing for a season that is not loaded, or does not exist", () => {
    expect(playedMatchups(2018, undefined)).toEqual([]);
    expect(playedMatchups(2018, { league: seasons[2018].league })).toEqual([]);
    expect(playedMatchups(2018, { matchups: {} })).toEqual([]);
  });

  it("ignores weeks the live season has not played yet", () => {
    // A league mid-season: leg 3 means weeks 1 and 2 are in the book, and the
    // week-3 file exists with everyone on zero.
    const live = {
      league: {
        settings: { leg: 3, last_scored_leg: 2 },
      } as unknown as (typeof seasons)[number]["league"],
      matchups: {
        "1": seasons[2018].matchups["1"],
        "3": (seasons[2018].matchups["3"] ?? []).map((entry) => ({
          ...entry,
          points: 0,
        })),
      },
    };

    const weeks = new Set(playedMatchups(2026, live).map((t) => t.week));
    expect(weeks).toEqual(new Set([1]));
  });
});

describe("pickOne", () => {
  it("is empty-safe and covers the whole list", () => {
    expect(pickOne([])).toBeUndefined();
    expect(pickOne(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickOne(["a", "b", "c"], () => 0.999)).toBe("c");
    // A random() that returns exactly 1 would index off the end.
    expect(pickOne(["a", "b", "c"], () => 1)).toBe("a");
  });
});

describe("findRandomMatchup", () => {
  it("only ever lands on a played, paired game — 400 rolls", async () => {
    const years = new Set<number>();
    const weeks = new Set<string>();

    for (let roll = 0; roll < 400; roll++) {
      const target = await findRandomMatchup();
      expect(target).not.toBeNull();
      assertReal(target as RandomMatchupTarget);
      years.add((target as RandomMatchupTarget).year);
      weeks.add(matchupHref(target as RandomMatchupTarget));
    }

    // Not a distribution test, just a liveness one: if the shuffle were broken
    // 400 rolls would sit in one season.
    expect(years.size).toBeGreaterThan(YEAR_NUMBERS.length / 2);
    expect(weeks.size).toBeGreaterThan(100);
  });

  it("builds the route the season page actually serves", () => {
    expect(matchupHref({ year: 2019, week: 8, matchupId: 3 })).toBe(
      "/seasons/2019/matchups/8/3"
    );
  });
});

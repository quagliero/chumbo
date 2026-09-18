import { describe, expect, it } from "vitest";
import { checkWeek, completedWeek, weeksToFetch } from "../season-weeks.js";

/**
 * What the automatic update (J1) fetches. The league objects are cut down to
 * the fields read, with the values Sleeper actually had on the dates noted.
 */
const league = (settings: Record<string, number>, status = "in_season") => ({
  status,
  settings: { playoff_week_start: 15, ...settings },
});

describe("weeksToFetch", () => {
  it("leaves the week being played alone", () => {
    // Friday of 2026 week 2: Thursday night was already scored into week 2.
    const plan = weeksToFetch(league({ leg: 2, last_scored_leg: 1 }), 2026);
    expect(plan.matchups).toEqual([1]);
    // ...but its waivers have already run.
    expect(plan.transactions).toEqual([1, 2]);
    expect(plan.brackets).toBe(false);
  });

  it("takes the new week once Sleeper has scored it", () => {
    // Tuesday of 2026 week 1, the morning after Monday night.
    const plan = weeksToFetch(league({ leg: 1, last_scored_leg: 1 }), 2026);
    expect(plan.matchups).toEqual([1]);
  });

  it("fetches nothing scored before the first game", () => {
    const plan = weeksToFetch(league({ leg: 1 }), 2026);
    expect(plan.matchups).toEqual([]);
  });

  it("fetches the brackets once the regular season is over", () => {
    expect(weeksToFetch(league({ leg: 15, last_scored_leg: 14 }), 2026))
      .toMatchObject({ brackets: true });
    expect(weeksToFetch(league({ leg: 14, last_scored_leg: 13 }), 2026))
      .toMatchObject({ brackets: false });
  });

  it("fetches the whole of a finished season", () => {
    // 2025 as it is committed.
    const plan = weeksToFetch(
      league({ leg: 17, last_scored_leg: 17 }, "complete"),
      2025
    );
    expect(plan.matchups).toHaveLength(17);
    expect(plan.brackets).toBe(true);
  });

  it("has no transactions to fetch before Sleeper", () => {
    expect(weeksToFetch(league({ leg: 5, last_scored_leg: 4 }), 2019))
      .toMatchObject({ transactions: [] });
  });
});

describe("completedWeek", () => {
  it("falls back to the week before the current one", () => {
    expect(completedWeek(league({ leg: 4 }))).toBe(3);
    expect(completedWeek(undefined)).toBe(0);
  });
});

describe("checkWeek", () => {
  const team = (points: number) => ({ points });

  it("accepts a whole week", () => {
    expect(() => checkWeek(1, [team(100), team(0)], 2)).not.toThrow();
  });

  it("refuses a week with teams missing", () => {
    expect(() => checkWeek(1, [team(100)], 2)).toThrow(/expected 2 teams/);
    expect(() => checkWeek(1, null, 2)).toThrow(/expected 2 teams/);
  });

  it("refuses a scored week of zeroes", () => {
    expect(() => checkWeek(3, [team(0), team(0)], 2)).toThrow(/0 points/);
  });
});

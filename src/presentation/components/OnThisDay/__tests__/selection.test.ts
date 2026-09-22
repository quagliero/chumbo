/**
 * E6 — what the home page is allowed to claim.
 *
 * The rule the module lives by is that it must not lie: a game shown under a
 * date was over on that date, one per season, and a date with nothing is
 * nothing rather than the nearest thing in the file. These are the cases that
 * would let it.
 */
import { describe, expect, it } from "vitest";
import type { PrecomputedStat } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";
import { calendarYearOf, selectOnThisDay } from "../selection";

const entry = (over: Partial<StatEntry> & { year: number; value: number }): StatEntry => ({
  subject: "thd",
  href: `/seasons/${over.year}/matchups/1/1`,
  detail: "thd beat jay, 100.00–90.00",
  week: 1,
  ...over,
});

const stat = (entries: StatEntry[]): PrecomputedStat =>
  ({
    id: "on-this-day",
    label: "On this day in Chumbo history",
    description: "",
    scope: "league",
    format: "count",
    direction: "high",
    excluded: [],
    caveat: [],
    total: entries.length,
    entries,
  }) as PrecomputedStat;

/** Noon, local time, so no timezone can move it to another day. */
const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe("selectOnThisDay", () => {
  it("is absent, not empty, when the stat is missing from the file", () => {
    expect(selectOnThisDay(undefined, on("2026-09-22"))).toBeNull();
  });

  it("shows the games that were over on today's date, newest season first", () => {
    const view = selectOnThisDay(
      stat([
        entry({ year: 2013, value: 922 }),
        entry({ year: 2025, value: 922 }),
        entry({ year: 2019, value: 922 }),
        entry({ year: 2020, value: 921 }),
      ]),
      on("2026-09-22")
    )!;
    expect(view.date).toBe("22 September");
    expect(view.entries.map((e) => e.year)).toEqual([2025, 2019, 2013]);
    expect(view.total).toBe(3);
  });

  it("has nothing on a date nothing happened, rather than the nearest date", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2025, value: 921 }), entry({ year: 2025, value: 923 })]),
      on("2026-09-22")
    )!;
    expect(view.entries).toEqual([]);
  });

  it("does not call a game from earlier today history", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2026, value: 922 }), entry({ year: 2025, value: 922 })]),
      on("2026-09-22")
    )!;
    expect(view.entries.map((e) => e.year)).toEqual([2025]);
  });

  it("puts a January game in the year it was played, not its season's", () => {
    // Week 17 of the 2021 season was over on 2 January 2022.
    const january = entry({ year: 2021, value: 102, week: 17 });
    expect(calendarYearOf(january)).toBe(2022);

    // So on 2 January 2022 it is today, not history...
    expect(selectOnThisDay(stat([january]), on("2022-01-02"))!.entries).toEqual([]);
    // ...and a year later it is "2022".
    const later = selectOnThisDay(stat([january]), on("2023-01-02"))!;
    expect(later.entries.map((e) => e.calendarYear)).toEqual([2022]);
  });

  it("caps the rail, and says how many it left out", () => {
    const view = selectOnThisDay(
      stat([2012, 2013, 2014, 2015, 2016, 2017].map((year) => entry({ year, value: 922 }))),
      on("2026-09-22"),
      4
    )!;
    expect(view.entries).toHaveLength(4);
    expect(view.total).toBe(6);
  });

  it("marks a reconstructed season when one is on the rail", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2019, value: 922, approximate: true })]),
      on("2026-09-22")
    )!;
    expect(view.approximate).toBe(true);
  });
});

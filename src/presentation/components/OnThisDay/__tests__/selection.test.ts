/**
 * E6 — what the home page is allowed to claim.
 *
 * The rule the module lives by is that it must not lie: one week, named; one
 * game per season; and an empty archive said out loud rather than papered over
 * with the nearest thing in the file. These are the cases that would let it.
 */
import { describe, expect, it } from "vitest";
import type { PrecomputedStat } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";
import { selectOnThisDay, stakeKind, withoutYearPrefix } from "../selection";

const entry = (over: Partial<StatEntry> & { year: number }): StatEntry => ({
  value: over.year,
  subject: "thd",
  href: `/seasons/${over.year}/matchups/1/1`,
  detail: `${over.year} · thd beat jay, 100.00–90.00`,
  week: 1,
  ...over,
});

const stat = (entries: StatEntry[], total = entries.length): PrecomputedStat =>
  ({
    id: "on-this-day",
    label: "On this day in Chumbo history",
    description: "",
    scope: "league",
    format: "count",
    direction: "high",
    excluded: [],
    caveat: [],
    total,
    entries,
  }) as PrecomputedStat;

describe("selectOnThisDay", () => {
  it("is absent, not empty, when the stat is missing from the file", () => {
    expect(selectOnThisDay(undefined)).toBeNull();
  });

  it("says the archive is empty rather than inventing something", () => {
    const view = selectOnThisDay(stat([], 0));
    expect(view).not.toBeNull();
    expect(view?.entries).toEqual([]);
    expect(view?.week).toBeNull();
  });

  it("shows one game per season", () => {
    const view = selectOnThisDay(
      stat([
        entry({ year: 2025, subject: "loudest" }),
        entry({ year: 2025, subject: "quieter" }),
        entry({ year: 2024, subject: "ryan" }),
      ])
    );
    expect(view?.entries.map((e) => e.year)).toEqual([2025, 2024]);
    // The stat puts each season's loudest game first; that is the one kept.
    expect(view?.entries[0].subject).toBe("loudest");
  });

  it("does not tell the same kind of story four times over", () => {
    const loud = (year: number, subject: string) =>
      entry({
        year,
        subject,
        detail: `${year} · ${subject} beat jay, 100.00–90.00 — the highest-scoring game of the week, 190.00 between them`,
      });
    const close = (year: number, subject: string) =>
      entry({
        year,
        subject,
        detail: `${year} · ${subject} beat jay, 100.00–99.00 — the closest game of the week, by 1.00`,
      });

    const view = selectOnThisDay(
      stat([
        loud(2025, "ant"),
        close(2025, "sol"),
        // Taking the first of each season would give "highest-scoring" twice.
        loud(2024, "rich"),
        close(2024, "htc"),
      ])
    );

    expect(view?.entries.map((e) => e.subject)).toEqual(["ant", "htc"]);
  });

  it("still shows a season whose only story is one already told", () => {
    const loud = (year: number, subject: string) =>
      entry({
        year,
        subject,
        detail: `${year} · ${subject} beat jay, 100.00–90.00 — the highest-scoring game of the week, 190.00 between them`,
      });

    const view = selectOnThisDay(stat([loud(2025, "ant"), loud(2024, "rich")]));
    expect(view?.entries.map((e) => e.year)).toEqual([2025, 2024]);
  });

  it("puts the newest season first even if the file does not", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2019 }), entry({ year: 2023 }), entry({ year: 2021 })])
    );
    expect(view?.entries.map((e) => e.year)).toEqual([2023, 2021, 2019]);
  });

  it("caps the list", () => {
    const view = selectOnThisDay(
      stat([2025, 2024, 2023, 2022, 2021, 2020].map((year) => entry({ year }))),
      2
    );
    expect(view?.entries).toHaveLength(2);
    // The cap is a display limit, so the honest count is still the full one.
    expect(view?.total).toBe(6);
  });

  it("names the week the entries are actually from", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2025, week: 9 }), entry({ year: 2024, week: 9 })])
    );
    expect(view?.week).toBe(9);
  });

  it("refuses to name a week when the entries disagree about it", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2025, week: 9 }), entry({ year: 2024, week: 3 })])
    );
    expect(view?.week).toBeNull();
    expect(view?.entries).toHaveLength(2);
  });

  it("flags reconstructed lineup data when a shown entry carries it", () => {
    expect(
      selectOnThisDay(stat([entry({ year: 2019, approximate: true })]))
        ?.approximate
    ).toBe(true);
    expect(selectOnThisDay(stat([entry({ year: 2019 })]))?.approximate).toBe(
      false
    );
  });

  it("does not flag an approximate entry that the cap dropped", () => {
    const view = selectOnThisDay(
      stat([entry({ year: 2025 }), entry({ year: 2019, approximate: true })]),
      1
    );
    expect(view?.approximate).toBe(false);
  });

  it("falls back to `value` when an entry carries no year", () => {
    const view = selectOnThisDay(
      stat([{ value: 2022, subject: "thd", week: 1 }])
    );
    expect(view?.entries).toHaveLength(1);
    expect(view?.week).toBe(1);
  });
});

describe("stakeKind", () => {
  it("reads the clause the stat appends after the em dash", () => {
    expect(
      stakeKind(
        "2025 · ant beat fin, 114.58–101.62 — the highest-scoring game of the week, 216.20 between them"
      )
    ).toBe("the highest-scoring game of the week");
  });

  it("is empty for a game with nothing riding on it", () => {
    expect(stakeKind("2025 · ant beat fin, 114.58–101.62")).toBe("");
    expect(stakeKind(undefined)).toBe("");
  });

  it("separates a title game from an ordinary one", () => {
    expect(stakeKind("2019 · thd beat jay, 1–0 — the 2019 title game")).not.toBe(
      stakeKind("2019 · thd beat jay, 1–0 — a playoff game")
    );
  });
});

describe("withoutYearPrefix", () => {
  it("strips the year the badge already shows", () => {
    expect(withoutYearPrefix("2025 · thd beat jay, 100.00–90.00", 2025)).toBe(
      "thd beat jay, 100.00–90.00"
    );
  });

  it("leaves a detail that does not start with that year alone", () => {
    expect(withoutYearPrefix("2024 · thd beat jay", 2025)).toBe(
      "2024 · thd beat jay"
    );
    expect(withoutYearPrefix("thd beat jay", 2025)).toBe("thd beat jay");
  });

  it("copes with no detail at all", () => {
    expect(withoutYearPrefix(undefined, 2025)).toBe("");
  });
});

describe("the shipped answers", () => {
  it("are shaped the way the module assumes", async () => {
    const file = await import("../../../../../public/data/all-time.json");
    const onThisDay = (
      file.default.stats as unknown as PrecomputedStat[]
    ).find((s) => s.id === "on-this-day");

    const view = selectOnThisDay(onThisDay);
    expect(view).not.toBeNull();
    // Every entry from one week, and no season shown twice — the two claims
    // the module makes on the page.
    expect(view?.week).not.toBeNull();
    const years = view?.entries.map((e) => e.year) ?? [];
    expect(new Set(years).size).toBe(years.length);
    for (const shown of view?.entries ?? []) {
      expect(shown.href).toMatch(/^\/seasons\/\d{4}\/matchups\/\d+\/\d+$/);
    }
  });
});

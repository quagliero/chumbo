import { beforeAll, describe, expect, it } from "vitest";
// Read through Vite rather than `fs`, for the same reason precomputed.test.ts
// does: the app tsconfig has no node types, and `?raw` is the exact bytes that
// get served.
import raw from "../../../public/data/all-time.json?raw";
import { loadAllSeasons, managers, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { computeStat } from "@/utils/stats";
import type { PrecomputedStats } from "@/utils/stats/precomputed";
import { getScumboCrown, getScumboHolders } from "@/utils/crowns";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";
import {
  MIN_SEASONS_FOR_CAREER_RECORD,
  completedSeasons,
  getManagerHonours,
  getManagersWing,
  getRingOfShame,
  listYears,
} from "@/utils/hallOfFame";

/**
 * The Hall of Fame's two derived wings (F4c, F4d).
 *
 * These are published claims about named league members — "rich has the most
 * wooden spoons", "brock is the worst lineup-setter alive" — so the bar is not
 * "the page renders". Three things are checked:
 *
 *   1. The finishing record the wings are built on is internally consistent:
 *      one champion and one wooden spoon per completed season, nobody counted
 *      twice, the in-progress season excluded.
 *   2. Every Ring of Shame entry really is the extreme of the criterion its
 *      own UI prints. This is the drift-proof half: it re-derives the answer
 *      from the live registry and checks the same row comes out.
 *   3. The current holders, spelled out. This half is EXPECTED to fail the
 *      season somebody takes a record off somebody else — that is the point.
 *      When it fails, look at the jokes, then update the list.
 */

const file: PrecomputedStats = JSON.parse(raw);

beforeAll(async () => {
  await loadAllSeasons();
});

describe("completed seasons", () => {
  it("is every season with a winners bracket, and no others", () => {
    expect(completedSeasons()).toEqual(
      YEAR_NUMBERS.filter((y) => (seasons[y]?.winners_bracket?.length ?? 0) > 0)
    );
  });

  /**
   * The trap this guards. On an in-progress season every roster sits at 0-0,
   * so `getFinalStandings` falls back to record order and hands out a
   * champion and a wooden spoon to whoever happens to sort first and last.
   * Publishing either would be inventing a result, not reporting an early one.
   */
  it("leaves the in-progress season out", () => {
    const inProgress = YEAR_NUMBERS.filter(
      (y) =>
        (seasons[y]?.rosters?.length ?? 0) > 0 &&
        (seasons[y]?.winners_bracket?.length ?? 0) === 0
    );
    for (const year of inProgress) {
      expect(completedSeasons()).not.toContain(year);
    }
  });
});

describe("manager finishing records", () => {
  const honours = getManagerHonours();

  it("gives every completed season exactly one champion and one wooden spoon", () => {
    const seasonsPlayed = completedSeasons();

    const titles = honours.flatMap((h) => h.titles).sort((a, b) => a - b);
    const spoons = honours.flatMap((h) => h.spoons).sort((a, b) => a - b);

    expect(titles).toEqual(seasonsPlayed);
    expect(spoons).toEqual(seasonsPlayed);
  });

  it("places every roster of every completed season exactly once", () => {
    const expected = completedSeasons().reduce(
      (total, year) => total + (seasons[year]?.rosters?.length ?? 0),
      0
    );
    const counted = honours.reduce((total, h) => total + h.finishes.length, 0);

    // Equal, not merely close: a roster whose owner is missing from
    // managers.json is dropped by design, and this is what would catch it.
    expect(counted).toBe(expected);
  });

  it("never gives a manager two finishes in one season", () => {
    for (const h of honours) {
      const years = h.finishes.map((f) => f.year);
      expect(new Set(years).size).toBe(years.length);
    }
  });

  it("agrees with itself: a title is a first place, a Scumbo is the worst breakdown", () => {
    for (const h of honours) {
      for (const year of h.titles) {
        expect(h.finishes.find((f) => f.year === year)?.position).toBe(1);
      }
      // Deliberately NOT `position === teams`. The Scumbo goes to the worst
      // all-play record, which is last place in only nine of the fourteen
      // completed seasons — the other five are where a kind schedule saved
      // somebody, or a brutal one buried them.
      for (const year of h.spoons) {
        const breakdown = getSeasonBreakdown(year);
        const worst = breakdown[breakdown.length - 1];
        const holders = getScumboHolders(year).map((c) => c.managerId);
        expect(holders).toContain(h.managerId);
        expect(worst.winPercentage).toBeLessThanOrEqual(
          breakdown[0].winPercentage
        );
      }
      expect(h.bestFinish).toBe(Math.min(...h.finishes.map((f) => f.position)));
    }
  });

  it("awards exactly one Scumbo per completed season", () => {
    const awarded = honours.flatMap((h) => h.spoons);
    // Ties would legitimately give two managers the same year; there are none
    // today, and if one appears this will say so rather than hiding it.
    expect(awarded.length).toBe(completedSeasons().length);
    expect([...new Set(awarded)].sort()).toEqual([...completedSeasons()].sort());
  });
});

describe("the managers' wing", () => {
  const wing = getManagersWing(file);

  it("inducts every champion and nobody else", () => {
    const champions = getManagerHonours()
      .filter((h) => h.titles.length > 0)
      .map((h) => h.managerId)
      .sort();

    expect(wing.map((e) => e.managerId).sort()).toEqual(champions);
    expect(wing.every((e) => e.titles.length > 0)).toBe(true);
  });

  it("orders by titles, then runner-up finishes, then seasons served", () => {
    for (let i = 1; i < wing.length; i++) {
      const previous = wing[i - 1];
      const current = wing[i];
      const rank = (e: (typeof wing)[number]) => [
        -e.titles.length,
        -e.runnerUps.length,
        -e.finishes.length,
      ];
      // Compare lexicographically, which is what the sort promises.
      const a = rank(previous);
      const b = rank(current);
      const firstDifference = a.findIndex((value, index) => value !== b[index]);
      if (firstDifference !== -1) {
        expect(a[firstDifference]).toBeLessThan(b[firstDifference]);
      }
    }
  });

  it("quotes each archetype verbatim from the stat, never paraphrased", () => {
    const details = new Map(
      (file.stats.find((s) => s.id === "manager-archetypes")?.entries ?? []).map(
        (e) => [e.subject, e.detail]
      )
    );

    for (const entry of wing) {
      const detail = details.get(entry.managerId);
      if (!detail) {
        expect(entry.archetype).toBeUndefined();
        continue;
      }
      const rebuilt = entry.archetype
        ? `${entry.archetype} — ${entry.archetypeReason}`
        : entry.archetypeReason;
      expect(rebuilt).toBe(detail);
    }
  });

  it("links every inductee to a manager page that exists", () => {
    for (const entry of wing) {
      expect(managers.some((m) => m.id === entry.managerId)).toBe(true);
    }
  });
});

describe("the ring of shame", () => {
  const ring = getRingOfShame(file);
  const byId = new Map(ring.map((e) => [e.id, e]));

  it("names a real manager, with a number and a criterion, on every entry", () => {
    expect(ring.length).toBeGreaterThan(0);
    for (const entry of ring) {
      const manager = managers.find((m) => m.id === entry.managerId);
      expect(manager, entry.id).toBeDefined();
      expect(entry.name).toBe(manager!.name);
      expect(entry.teamName).toBe(manager!.teamName);
      expect(entry.value.trim(), entry.id).not.toBe("");
      expect(entry.basis.trim(), entry.id).not.toBe("");
      expect(entry.title.trim(), entry.id).not.toBe("");
    }
  });

  it("has no duplicate entry ids", () => {
    expect(new Set(ring.map((e) => e.id)).size).toBe(ring.length);
  });

  /* ---------------- the criteria, re-derived ---------------- */

  it("shames the manager with the most full Scumbos", () => {
    const entry = byId.get("most-scumbos")!;
    const counts = new Map<string, number>();
    for (const year of completedSeasons()) {
      for (const crown of getScumboCrown(year)) {
        counts.set(crown.managerId, (counts.get(crown.managerId) ?? 0) + 1);
      }
    }
    const most = Math.max(...counts.values());
    expect(counts.get(entry.managerId)).toBe(most);
    expect(entry.value).toBe(`${most} full Scumbo${most === 1 ? "" : "s"}`);
  });

  /**
   * The correction this replaced. The Scumbo goes to the worst BREAKDOWN —
   * the all-play record — not to last place in the standings. The two disagree
   * in five of the fourteen completed seasons, so the old entry named the
   * wrong manager in five of them; asserting only "it is someone bad" would
   * not have caught that.
   */
  it("gives the reigning Scumbo to the worst breakdown, not to last place", () => {
    const entry = byId.get("reigning-scumbo")!;
    const latest = completedSeasons()[completedSeasons().length - 1];

    const breakdown = getSeasonBreakdown(latest);
    const worst = breakdown[breakdown.length - 1];
    const holder = getScumboHolders(latest)[0];

    expect(entry.managerId).toBe(holder.managerId);
    expect(holder.rosterId).toBe(worst.rosterId);
    expect(entry.basis).toContain(String(latest));
    expect(entry.value).toContain("all-play");
  });

  /**
   * The six stat-backed entries, each re-derived from the LIVE registry rather
   * than from the file they were built from. Catches two different mistakes:
   * a stale `all-time.json`, and reading the wrong end of a ranking — the stats
   * are not all sorted the same way round, so "worst" is the first row of
   * `worst-draft-picks` and the last row of `manager-efficiency`.
   */
  const stateBacked: {
    id: string;
    statId: string;
    end: "top" | "bottom";
    eligibleOnly: boolean;
  }[] = [
    { id: "bench-points", statId: "bench-points", end: "top", eligibleOnly: false },
    {
      id: "manager-efficiency",
      statId: "manager-efficiency",
      end: "bottom",
      eligibleOnly: true,
    },
    { id: "worst-start-sit", statId: "worst-start-sit", end: "top", eligibleOnly: false },
    {
      id: "longest-loss-streak",
      statId: "longest-loss-streak",
      end: "top",
      eligibleOnly: false,
    },
    {
      id: "waiver-hit-rate",
      statId: "waiver-hit-rate",
      end: "bottom",
      eligibleOnly: true,
    },
    { id: "roster-churn", statId: "roster-churn", end: "top", eligibleOnly: false },
  ];

  const longServing = new Set(
    getManagerHonours()
      .filter((h) => h.finishes.length >= MIN_SEASONS_FOR_CAREER_RECORD)
      .map((h) => h.managerId)
  );

  it.each(stateBacked)(
    "$id names the real extreme of $statId",
    ({ id, statId, end, eligibleOnly }) => {
      const entry = byId.get(id);
      expect(entry, `${id} missing from the ring`).toBeDefined();

      const live = computeStat(statId).filter((row) =>
        eligibleOnly ? longServing.has(row.subject) : true
      );
      const expected = end === "top" ? live[0] : live[live.length - 1];

      expect(entry!.managerId).toBe(expected.subject);
      expect(entry!.detail).toBe(expected.detail ?? "");
      expect(entry!.href).toBe(expected.href);
      // The headline number has to BE the stat's number, not a near miss.
      // Every one of these formats as "<number> <unit>", and each is rounded to
      // at most two decimals, so half a tenth is a generous tolerance.
      expect(Math.abs(parseFloat(entry!.value) - expected.value)).toBeLessThan(
        0.05
      );
    }
  );

  it("only ranks career rates among managers with a real career", () => {
    for (const { id, eligibleOnly } of stateBacked) {
      if (!eligibleOnly) continue;
      const entry = byId.get(id)!;
      const holder = getManagerHonours().find(
        (h) => h.managerId === entry.managerId
      )!;
      expect(holder.finishes.length).toBeGreaterThanOrEqual(
        MIN_SEASONS_FOR_CAREER_RECORD
      );
    }
  });

  it("carries the 2019 lineup caveat onto the entries that need it", () => {
    for (const { id, statId } of stateBacked) {
      const entry = byId.get(id)!;
      const stat = file.stats.find((s) => s.id === statId)!;
      expect(entry.excluded).toEqual(stat.excluded);
    }
  });

  /* ---------------- the current holders ---------------- */

  /**
   * Deliberately hardcoded. These are the names printed on the page next to
   * words like "the single worst decision ever made", and the league will
   * quote them. If this test fails, the record changed hands: check the new
   * holder reads well before updating the list.
   */
  it("names today's holders", () => {
    expect(
      Object.fromEntries(ring.map((e) => [e.id, `${e.managerId} · ${e.value}`]))
    ).toEqual({
      "most-scumbos": "fin · 3 full Scumbos",
      "reigning-scumbo": "rich · 47-107 all-play (30.5%)",
      "bench-points": "kitch · 2949.3 points benched",
      "manager-efficiency": "brock · 85.3% efficient",
      "worst-start-sit": "chris · 47.7 points thrown away",
      "longest-loss-streak": "thd · 10 straight defeats",
      "waiver-hit-rate": "sol · 5.27 points per pickup",
      "roster-churn": "sol · 248 moves in one season",
    });
  });
});

describe("listYears", () => {
  it("reads like a sentence", () => {
    expect(listYears([])).toBe("");
    expect(listYears([2014])).toBe("2014");
    expect(listYears([2014, 2016])).toBe("2014 and 2016");
    expect(listYears([2014, 2016, 2017])).toBe("2014, 2016 and 2017");
  });
});

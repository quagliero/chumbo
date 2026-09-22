import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { buildDraftScatter } from "@/presentation/components/Chart/DraftScatter/useDraftScatter";
import {
  buildDrafters,
  buildDrafts,
  draftFinishCorrelation,
  outcomeOf,
  strategiesOf,
  tiersOf,
  type Finish,
  type ReportPick,
} from "@/utils/draftReport";
import { getFinalStandings } from "@/utils/finalStandings";
import { isSeasonSettled } from "@/utils/playoffUtils";

/**
 * The Draft explorer's analysis. Fixed inputs for the arithmetic; the real
 * archive for the invariants, which must hold whatever the live season does.
 */

const pick = (over: Partial<ReportPick>): ReportPick => ({
  year: 2020,
  round: 1,
  pickNo: 1,
  rosterId: 1,
  managerId: "a",
  position: "RB",
  name: "Someone",
  value: 0,
  approximate: false,
  ...over,
});

const finish = (position: number): Finish => ({ position, of: 3, playoffTeams: 2 });

describe("a draft", () => {
  const picks = [
    pick({ managerId: "a", rosterId: 1, value: 50, name: "Steal" }),
    pick({ managerId: "a", rosterId: 1, value: -20, round: 2, pickNo: 6, name: "Bust" }),
    pick({ managerId: "b", rosterId: 2, value: 10, pickNo: 2 }),
    pick({ managerId: "c", rosterId: 3, value: -40, pickNo: 3 }),
  ];
  const finishes: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
  const drafts = buildDrafts(picks, (_, rosterId) => finish(finishes[rosterId]));

  it("is the sum of its picks, ranked against that season's others", () => {
    const a = drafts.find((d) => d.managerId === "a")!;
    expect(a.value).toBe(30);
    expect(a.rank).toBe(1);
    expect(a.of).toBe(3);
    expect(a.hits).toBe(1);
    expect(a.best.name).toBe("Steal");
    expect(a.worst.name).toBe("Bust");
  });

  it("sets the draft against how the season ended", () => {
    // Draft ranks 1,2,3 and finishes 1,2,3: a perfect agreement.
    expect(draftFinishCorrelation(drafts)).toBe(1);
    const [best] = tiersOf(drafts);
    expect(best.outcome).toMatchObject({ drafts: 1, titles: 1, playoffs: 1 });
  });

  it("says nothing about a season that has not ended", () => {
    const live = buildDrafts(picks, () => null);
    expect(outcomeOf(live)).toMatchObject({ finished: 0, averageFinish: null, titles: 0 });
    expect(draftFinishCorrelation(live)).toBeNull();
  });

  it("gives each manager their average, best and worst", () => {
    const [top] = buildDrafters(drafts).sort((x, y) => y.averageValue - x.averageValue);
    expect(top.managerId).toBe("a");
    expect(top.averageValue).toBe(30);
    expect(top.hitRate).toBe(0.5);
  });
});

describe("a strategy", () => {
  it("reads only the early rounds, and is always beside every draft", () => {
    const picks = [
      // a: WR, WR, WR, QB in rounds 1-4, then an RB — zero RB, WR-heavy, early QB.
      ...["WR", "WR", "QB", "WR"].map((position, i) =>
        pick({ managerId: "a", round: i + 1, pickNo: i * 12 + 1, position })
      ),
      pick({ managerId: "a", round: 5, pickNo: 49, position: "RB" }),
      // b: RB, RB, RB, TE — RB-heavy.
      ...["RB", "RB", "RB", "TE"].map((position, i) =>
        pick({ managerId: "b", rosterId: 2, round: i + 1, pickNo: i * 12 + 2, position })
      ),
    ];
    const drafts = buildDrafts(picks, () => null);
    const byLabel = Object.fromEntries(
      strategiesOf(drafts, picks).map((s) => [s.label, s.drafts.map((d) => d.managerId)])
    );
    expect(byLabel["Every draft"].sort()).toEqual(["a", "b"]);
    expect(byLabel["Zero RB"]).toEqual(["a"]);
    expect(byLabel["WR-heavy"]).toEqual(["a"]);
    expect(byLabel["Early QB"]).toEqual(["a"]);
    expect(byLabel["RB-heavy"]).toEqual(["b"]);
    // b's tight end came in round 4, not the first three.
    expect(byLabel["Early TE"]).toEqual([]);
  });
});

describe("the real drafts", () => {
  const { points } = buildDraftScatter();
  const drafts = buildDrafts(points, (year, rosterId) => {
    if (!isSeasonSettled(seasons[year])) return null;
    const standings = getFinalStandings(year);
    const at = standings.find((s) => s.rosterId === rosterId);
    return at ? { position: at.position, of: standings.length, playoffTeams: 6 } : null;
  });

  it("are one per manager per season, every one ranked within its season", () => {
    const keys = drafts.map((d) => `${d.year}|${d.managerId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(drafts.length).toBeGreaterThan(150);
    for (const d of drafts) {
      expect(d.rank).toBeGreaterThanOrEqual(1);
      expect(d.rank).toBeLessThanOrEqual(d.of);
    }
  });

  it("have a finish for every settled season, and one champion each", () => {
    const bySeason = new Map<number, number>();
    for (const d of drafts) {
      if (d.finish?.position === 1) bySeason.set(d.year, (bySeason.get(d.year) ?? 0) + 1);
    }
    for (const count of bySeason.values()) expect(count).toBe(1);
  });

  it("split into tiers that cover every settled draft", () => {
    const [, top, middle, bottom] = tiersOf(drafts);
    const settled = drafts.filter((d) => d.finish).length;
    expect(top.outcome.drafts + middle.outcome.drafts + bottom.outcome.drafts).toBe(settled);
  });
});

import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { buildDraftScatter } from "@/presentation/components/Chart/DraftScatter/useDraftScatter";
import {
  buildDrafters,
  buildDrafts,
  draftFinishCorrelation,
  drafterShrinkage,
  PRIOR_DRAFTS,
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

const realDrafts = buildDrafts(buildDraftScatter().points, (year, rosterId) => {
  if (!isSeasonSettled(seasons[year])) return null;
  const standings = getFinalStandings(year);
  const at = standings.find((s) => s.rosterId === rosterId);
  return at ? { position: at.position, of: standings.length, playoffTeams: 6 } : null;
});

describe("the real drafts", () => {
  const drafts = realDrafts;

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

describe("the Bayesian adjustments", () => {
  it("shrinks a manager's average by how noisy drafts are against how much managers differ", () => {
    // Everyone's drafts swing by ±100 year to year, and the managers' true
    // averages barely differ: an average should mean very little.
    const noisy = [
      [100, -100, 100, -100],
      [110, -90, 110, -90],
      [90, -110, 90, -110],
    ];
    // Same swings, but the managers really are 100 apart: trust the averages.
    const distinct = [
      [200, 0, 200, 0],
      [100, -100, 100, -100],
      [0, -200, 0, -200],
    ];
    expect(drafterShrinkage(noisy)).toBeGreaterThan(drafterShrinkage(distinct));
    // No difference between managers at all: everyone is the league.
    expect(drafterShrinkage([[10, -10], [10, -10]])).toBe(Number.POSITIVE_INFINITY);
  });

  it("rates a manager as their average pulled toward the league by k drafts", () => {
    const picks: ReportPick[] = Array.from({ length: 12 }, (_, i) =>
      pick({
        managerId: `m${i % 4}`,
        rosterId: i % 4,
        year: 2020 + Math.floor(i / 4),
        value: ((i * 37) % 90) - 45,
        pickNo: i,
      })
    );
    const drafters = buildDrafters(buildDrafts(picks, () => null));
    const byManager = new Map<string, number[]>();
    for (const d of buildDrafts(picks, () => null)) {
      byManager.set(d.managerId, [...(byManager.get(d.managerId) ?? []), d.value]);
    }
    const k = drafterShrinkage([...byManager.values()]);
    for (const d of drafters) {
      const values = byManager.get(d.managerId)!;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const expected = Number.isFinite(k) ? (mean * values.length) / (values.length + k) : 0;
      expect(d.rating).toBeCloseTo(expected, 1);
    }
  });

  it("gives every manager a range as wide as their number of drafts deserves", () => {
    // The fewer drafts, the wider: a manager with five cannot be pinned down
    // as closely as one with fourteen.
    const drafters = buildDrafters(realDrafts);
    const few = drafters.find((d) => d.drafts <= 5)!;
    const many = drafters.find((d) => d.drafts >= 14)!;
    expect(few.margin).toBeGreaterThan(many.margin);
    for (const d of drafters) expect(d.margin).toBeGreaterThan(0);
  });

  it("will not let a strategy tried a handful of times speak louder than that", () => {
    // Four drafts, all four made the playoffs; the league's rate is a half.
    const picks: ReportPick[] = [];
    const finishes = new Map<string, Finish>();
    for (let i = 0; i < 40; i++) {
      const managerId = `m${i}`;
      const zeroRb = i < 4;
      for (let round = 1; round <= 4; round++) {
        picks.push(
          pick({ managerId, rosterId: i, year: 2020, round, pickNo: round * 100 + i, position: zeroRb ? "WR" : "RB" })
        );
      }
      finishes.set(managerId, { position: zeroRb || i % 2 ? 1 : 12, of: 12, playoffTeams: 6 });
    }
    const drafts = buildDrafts(picks, (_, rosterId) => finishes.get(`m${rosterId}`) ?? null);
    const zero = strategiesOf(drafts, picks).find((s) => s.label === "Zero RB")!;
    expect(zero.outcome.playoffs / zero.outcome.finished).toBe(1);
    // (4 + 10 × 0.55) / (4 + 10): far from certain.
    const league = strategiesOf(drafts, picks)[0].playoffChance!;
    expect(zero.playoffChance).toBeCloseTo((4 + PRIOR_DRAFTS * league) / (4 + PRIOR_DRAFTS), 10);
    expect(zero.playoffChance!).toBeLessThan(0.75);
  });
});

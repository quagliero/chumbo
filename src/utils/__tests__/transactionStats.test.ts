import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { computeStat, getStatContext } from "@/utils/stats";
import { playerTrades } from "@/utils/stats/transactionStats";

/**
 * Waiver and trade stats (C5).
 *
 * The thing worth testing hardest here is not the arithmetic, it is that the
 * arithmetic ran on anything at all. Transactions are fetched lazily (A2a), so
 * a stat that reads `seasons[year].transactions` before the chunks land does
 * not throw — it returns an empty list, and every manager scores zero. That
 * failure is completely silent, and it produces a trade ledger that is wrong
 * rather than absent, so these start by proving the data is there.
 */

describe("transaction data", () => {
  it("is actually loaded — setup.ts awaited it", () => {
    let transactions = 0;
    const seasonsWithData: number[] = [];

    for (const year of YEAR_NUMBERS) {
      const byWeek = seasons[year]?.transactions ?? {};
      const count = Object.values(byWeek).reduce(
        (total, week) => total + (week?.length ?? 0),
        0
      );
      if (count) seasonsWithData.push(year);
      transactions += count;
    }

    // 6,359 across the fifteen seasons: 266 hand-entered trades for 2012-2019
    // and the full add/drop log from 2020 on. A loader regression that dropped
    // one of the two formats would halve this rather than zero it, so the bar
    // is set close enough to catch that.
    expect(transactions).toBeGreaterThan(6_000);
    expect(seasonsWithData).toEqual([...YEAR_NUMBERS]);
  });
});

describe("trade ledger", () => {
  const entries = computeStat("trade-ledger");

  it("scored a meaningful number of trades", () => {
    // Every trade contributes one entry per side, so entries outnumber trades.
    expect(entries.length).toBeGreaterThan(400);
    expect(entries.some((entry) => entry.value > 100)).toBe(true);
  });

  it("is zero-sum: every trade's sides cancel out", () => {
    // A ledger people are going to quote at each other has to balance, or one
    // manager's version of a trade is not the negative of the other's.
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    expect(Math.abs(total)).toBeLessThan(0.5);

    // Stronger than the total: the sides of one trade have to cancel each
    // other, not be cancelled by some unrelated trade elsewhere in the season.
    // The detail names the counterparties after the final " to ", so the set of
    // managers plus the week identifies the trade. Three-team trades are
    // included — 2020 week 1 is a genuine one, and its three nets also sum to
    // zero.
    const byTrade = new Map<string, number>();
    for (const entry of entries) {
      const counterparties = entry.detail?.split(" to ").pop() ?? "";
      const managers = [entry.subject, ...counterparties.split(" / ")].sort();
      const key = `${entry.year}|${entry.week}|${managers.join(",")}`;
      byTrade.set(key, (byTrade.get(key) ?? 0) + entry.value);
    }

    const unbalanced = [...byTrade].filter(([, sum]) => Math.abs(sum) > 0.05);
    expect(unbalanced).toEqual([]);

    // And the grouping actually found trades rather than one big bucket.
    expect(byTrade.size).toBeGreaterThan(300);
  });

  it("drops a trade that was entered and undone in the same week", () => {
    // NFL.com trades 232 and 233 in 2018 swap James Conner one way and then
    // straight back ten minutes later. Kept, they would put his whole season
    // on the ledger four times over.
    const conner = entries.filter(
      (entry) => entry.year === 2018 && entry.detail?.includes("James Conner")
    );
    expect(conner).toEqual([]);
  });

  it("covers both eras — the hand-entered seasons and Sleeper's", () => {
    const years = new Set(entries.map((entry) => entry.year));
    expect([...years].filter((year) => year! < 2020).length).toBeGreaterThan(5);
    expect([...years].filter((year) => year! >= 2020).length).toBeGreaterThan(4);
  });

  it("names both sides and links somewhere real", () => {
    for (const entry of entries.slice(0, 20)) {
      expect(entry.subject).toBeTruthy();
      expect(entry.href).toMatch(/^\/seasons\/\d{4}\/trades$/);
      expect(entry.detail).toContain("got ");
      expect(entry.detail).toContain("gave ");
    }
  });

  it("excludes 2019, whose per-player scores are a reconstruction", () => {
    // The stat declares `requiresLineups`, so the registry filters 2019 out
    // before compute sees it. 2019 has 43 trades; none may appear here.
    expect(entries.filter((entry) => entry.year === 2019)).toEqual([]);
  });

  it("puts the 2013 Arian Foster trade at the top", () => {
    const [top] = entries;
    expect(top.year).toBe(2013);
    expect(top.subject).toBe("jay");
    expect(top.value).toBeGreaterThan(400);
    expect(top.detail).toContain("Arian Foster");
  });
});

describe("waiver wire", () => {
  const entries = computeStat("waiver-hit-rate");

  it("gives every manager a non-zero return", () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      expect(entry.value).toBeGreaterThan(0);
      expect(entry.detail).toMatch(/^\d+ pickups, /);
      expect(entry.href).toBe(`/managers/${entry.subject}`);
    }
  });

  it("counts thousands of pickups, not a handful", () => {
    const pickups = entries.reduce(
      (total, entry) => total + Number(entry.detail?.match(/^(\d+) /)?.[1] ?? 0),
      0
    );
    expect(pickups).toBeGreaterThan(2_000);
  });
});

describe("roster churn", () => {
  const entries = computeStat("roster-churn");

  it("counts whole manager-seasons from 2020 on", () => {
    expect(entries.length).toBeGreaterThan(50);
    for (const entry of entries) {
      expect(entry.year).toBeGreaterThanOrEqual(2020);
      expect(entry.value).toBeGreaterThan(0);
    }
  });

  it("has a busiest season well clear of a hundred moves", () => {
    const [top] = entries;
    expect(top.value).toBeGreaterThan(100);
    expect(top.detail).toMatch(/^\d{4}: \d+ adds, \d+ drops, \d+ trades$/);
  });
});

describe("one player's trades (I3)", () => {
  it("tells the Kamara deal from the giving side, settled by the ledger", () => {
    // Pick 4 of 2018, traded in week 1 for a Le'Veon Bell who never played
    // that season. The popover leans on every field of this.
    const [trade, ...rest] = playerTrades(getStatContext(), 2018, "4035");
    expect(rest).toEqual([]);
    expect(trade).toMatchObject({ week: 1, from: "chris", to: "thd", picks: [], faab: 0 });
    expect(trade.received.map((r) => [r.name, r.points])).toEqual([["Le'Veon Bell", 0]]);

    const ledger = computeStat("trade-ledger").find(
      (e) => e.year === 2018 && e.subject === "chris" && e.detail?.includes("Alvin Kamara")
    );
    expect(trade.net).toBe(ledger?.value);
  });

  it("follows a player through every trade in order", () => {
    const trades = playerTrades(getStatContext(), 2018, "4866"); // Barkley
    expect(trades.map((t) => [t.week, t.from, t.to])).toEqual([
      [1, "thd", "sol"],
      [11, "sol", "ant"],
    ]);
  });

  it("leaves a deal with FAAB in it unsettled rather than guessing", () => {
    const [lamar] = playerTrades(getStatContext(), 2024, "4881");
    expect(lamar.faab).toBeGreaterThan(0);
    expect(lamar.net).toBeUndefined();
  });

  it("does not report an entry corrected in the same week as a trade", () => {
    // NFL.com trades 232/233 in 2018: James Conner swapped and swapped back
    // ten minutes later. The ledger drops the pair; so must this.
    expect(playerTrades(getStatContext(), 2018, "4137")).toEqual([]);
  });
});

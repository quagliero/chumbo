import { describe, expect, it } from "vitest";
import raw from "../../../public/data/all-time.json?raw";
import { narrate, recordListHref } from "@/utils/narrative/narrate";
import { ordinal } from "@/utils/narrative/phrases";
import type { PrecomputedStats } from "@/utils/stats/precomputed";
import managers from "@/data/managers.json";

const MANAGER_IDS = new Set(managers.map((m) => m.id));

const stats: PrecomputedStats = JSON.parse(raw);

/**
 * E7. These sentences are the things that end up pasted into a group chat, so
 * the bar is that every one of them is defensible: it names a real placing in a
 * list the site already publishes, about the person it says it is about.
 */
describe("the narrative engine", () => {
  it("says nothing when it has nothing to say", () => {
    expect(narrate(stats, { year: 1999, week: 3 })).toEqual([]);
    expect(narrate(null, { year: 2022 })).toEqual([]);
    // No subject at all is not an invitation to narrate the whole archive.
    expect(narrate(stats, {})).toEqual([]);
  });

  it("finds the record it is standing on", () => {
    // The biggest margin in league history, straight off the stat.
    const top = stats.stats.find((s) => s.id === "biggest-margin")!.entries[0];
    const notes = narrate(stats, {
      managerIds: [top.subject],
      year: top.year,
      week: top.week,
    });

    const note = notes.find((n) => n.statId === "biggest-margin");
    expect(note).toBeDefined();
    expect(note!.rank).toBe(1);
    expect(note!.text).toBe("The biggest margin of victory in Chumbo history.");
  });

  /**
   * The failure that would matter most: attaching somebody else's record to a
   * manager because the stat happened to have a row in the same week, or
   * because a player's name was compared against a manager id.
   */
  it("never attributes another manager's record", () => {
    for (const stat of stats.stats) {
      for (const entry of stat.entries) {
        if (entry.year === undefined) continue;
        const notes = narrate(stats, {
          managerIds: ["thd"],
          year: entry.year,
          week: entry.week,
        });
        for (const note of notes) {
          const source = stats.stats.find((s) => s.id === note.statId)!;
          const row = source.entries[note.rank - 1];

          // The real assertion: if the row names a MANAGER, it must be the
          // manager we asked about. A row naming a player or a draft slot is
          // allowed through on the strength of the week it belongs to.
          if (MANAGER_IDS.has(row.subject)) {
            expect(row.subject).toBe("thd");
          }
          if (row.year !== undefined) expect(row.year).toBe(entry.year);
          if (row.week !== undefined && entry.week !== undefined) {
            expect(row.week).toBe(entry.week);
          }
        }
      }
    }
  });

  it("ranks the record above the runner-up", () => {
    const first = narrate(stats, { year: 2022, week: 17, managerIds: ["hadkiss"] });
    expect(first.length).toBeGreaterThan(0);
    // Sorted by weight, descending.
    for (let i = 1; i < first.length; i++) {
      expect(first[i - 1].weight).toBeGreaterThanOrEqual(first[i].weight);
    }
  });

  it("carries the 2019 caveat through to the sentence", () => {
    // Lamar Jackson's 2019 draft pick is flagged `approximate` in the file
    // because 2019's per-player data is a reconstruction. A note built on it
    // must keep the flag, or the caveat is lost exactly where it matters.
    const flagged = stats.stats
      .flatMap((s) => s.entries.map((e) => ({ s, e })))
      .find(({ e }) => e.approximate);
    expect(flagged).toBeDefined();

    const notes = narrate(
      stats,
      { year: flagged!.e.year, week: flagged!.e.week, managerIds: [flagged!.e.subject] },
      { limit: 25, minWeight: 0 }
    );
    const note = notes.find((n) => n.statId === flagged!.s.id);
    if (note) expect(note.approximate).toBe(true);
  });

  it("carries the scope, the holder's name and the number", () => {
    const top = stats.stats.find((s) => s.id === "biggest-margin")!.entries[0];
    const note = narrate(stats, {
      managerIds: [top.subject],
      year: top.year,
      week: top.week,
    }).find((n) => n.statId === "biggest-margin")!;

    expect(note.scope).toBe("league");
    // The id is what the stat carries; the card has to print a name. (For
    // some managers those are the same string, which is why this compares
    // against managers.json rather than asserting they differ.)
    expect(note.managerId).toBe(top.subject);
    expect(note.holder).toBe(managers.find((m) => m.id === top.subject)!.name);
    // Whoever holds it by then: the live season can take this record.
    expect(note.recordValue).toBe(top.value.toFixed(2));
  });

  /**
   * `closest-margin` is the reason `recordValue` is not `formatPoints`: the
   * narrowest win in league history is 0.04 points, and one decimal renders
   * the record as "0.0".
   */
  it("does not round a record away", () => {
    const top = stats.stats.find((s) => s.id === "closest-margin")!.entries[0];
    expect(top.value).toBeLessThan(0.1);
    const note = narrate(stats, {
      managerIds: [top.subject],
      year: top.year,
      week: top.week,
    }).find((n) => n.statId === "closest-margin")!;
    expect(note.recordValue).toBe(String(top.value));
  });

  /**
   * Four stats rank on a number that is not a magnitude — a year, a week, a
   * z-score, a count of opponents — and a record card leading with one of
   * those under the words "CHUMBO RECORD" would be claiming nonsense. They
   * still narrate; they just offer no number.
   */
  it("offers no record number where the number is not a magnitude", () => {
    // Ranked by the week a title became certain: a number, not a magnitude.
    const inevitable = stats.stats.find((s) => s.id === "championship-inevitability")!;
    const entry = inevitable.entries[0];
    const notes = narrate(
      stats,
      { year: entry.year, week: entry.week },
      { limit: 25, minWeight: 0 }
    );
    const note = notes.find((n) => n.statId === "championship-inevitability");
    expect(note).toBeDefined();
    expect(note!.recordValue).toBeUndefined();
  });

  it("respects the limit and the notability bar", () => {
    const many = narrate(stats, { year: 2022, week: 17 }, { limit: 1, minWeight: 0 });
    expect(many.length).toBeLessThanOrEqual(1);

    // Nothing weak sneaks through at the default bar.
    const strict = narrate(stats, { year: 2022, week: 17 });
    for (const note of strict) expect(note.weight).toBeGreaterThanOrEqual(0.9);
  });
});

/**
 * A rivalry is not a manager, and it is not two managers either — it is one
 * subject that happens to be spelled with two ids in it. Every test here is
 * about that distinction holding in both directions: the pairing must be
 * reachable from either order, and must not be reachable from one half of it.
 */
describe("the narrative engine, on a pairing", () => {
  const rivalry = stats.stats.find((s) => s.id === "rivalry-intensity")!;
  const top = rivalry.entries[0];
  const [a, b] = top.subject.split(" vs ");

  it("has a pairing stat to talk about at all", () => {
    // If this ever fails, the rest of this block is testing nothing.
    expect(MANAGER_IDS.has(a)).toBe(true);
    expect(MANAGER_IDS.has(b)).toBe(true);
    expect(MANAGER_IDS.has(top.subject)).toBe(false);
  });

  it("speaks about the pairing", () => {
    const notes = narrate(stats, { pairing: [a, b] });
    const note = notes.find((n) => n.statId === "rivalry-intensity");
    expect(note).toBeDefined();
    expect(note!.rank).toBe(1);
    expect(note!.href).toBe(top.href);
    // The qualifier, because this stat counts playoffs and the H2H page does
    // not. Without it the sentence reads as a claim about the page's record.
    expect(note!.text).toBe(
      "The closest rivalry in Chumbo history (playoffs included)."
    );
    // Both names, not the raw "fin vs sol" key.
    expect(note!.holder).toBe(
      `${managers.find((m) => m.id === a)!.name} vs ${
        managers.find((m) => m.id === b)!.name
      }`
    );
  });

  it("does not care which way round the pairing is asked for", () => {
    expect(narrate(stats, { pairing: [b, a] })).toEqual(
      narrate(stats, { pairing: [a, b] })
    );
  });

  /**
   * The failure this is really guarding: `fin vs sol` offered on the
   * `fin vs jay` page because both mention fin. A subset test would pass every
   * other test in this block and fail this one.
   */
  it("never matches a different rivalry that shares one manager", () => {
    const other = managers.find((m) => m.id !== a && m.id !== b)!.id;

    for (const pairing of [
      [a, other],
      [other, a],
      [b, other],
      [other, b],
    ] as const) {
      const notes = narrate(stats, { pairing }, { limit: 25, minWeight: 0 });
      for (const note of notes) {
        const source = stats.stats.find((s) => s.id === note.statId)!;
        const row = source.entries[note.rank - 1];
        // Whatever came back, its subject must name BOTH managers asked for.
        expect(new Set(row.subject.split(" vs "))).toEqual(
          new Set(pairing as readonly string[])
        );
      }
    }

    // And specifically: nothing from the top rivalry leaks onto those pages.
    for (const pairing of [
      [a, other],
      [b, other],
    ] as const) {
      const notes = narrate(stats, { pairing }, { limit: 25, minWeight: 0 });
      expect(
        notes.some((n) => n.statId === "rivalry-intensity" && n.rank === 1)
      ).toBe(false);
    }
  });

  /**
   * The existing rule, unchanged. A pairing subject must not be reachable by
   * naming one of its managers — that is the guard `describes()` was written
   * for, and adding pairings must not open a side door to it.
   */
  it("still refuses to hang a pairing on one of its managers", () => {
    for (const subject of [
      { managerIds: [a] },
      { managerIds: [a, b] },
      { managerIds: [a], year: top.year },
      { managerIds: [a, b], year: 2022, week: 17 },
      {},
    ]) {
      const notes = narrate(stats, subject, { limit: 25, minWeight: 0 });
      expect(notes.some((n) => n.statId === "rivalry-intensity")).toBe(false);
    }
  });

  /** A pairing ask is narrower than a manager ask, not wider. */
  it("brings back nothing that is about only one of them", () => {
    const notes = narrate(stats, { pairing: [a, b] }, { limit: 25, minWeight: 0 });
    for (const note of notes) {
      const source = stats.stats.find((s) => s.id === note.statId)!;
      const row = source.entries[note.rank - 1];
      expect(MANAGER_IDS.has(row.subject)).toBe(false);
    }
  });
});

describe("ordinal", () => {
  it("handles the teens, which every naive version gets wrong", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

describe("which week a note belongs to", () => {
  it("puts an inevitable championship on the final, not the week it was settled", () => {
    // 2024: thd never left the top three after Week 6 and won the final in
    // Week 17. The note was showing on Week 6's recap.
    const settledWeek = narrate(stats, { year: 2024, week: 6 }, { limit: 25, minWeight: 0 });
    expect(settledWeek.map((n) => n.statId)).not.toContain("championship-inevitability");
    const final = narrate(stats, { year: 2024, week: 17 }, { limit: 25, minWeight: 0 });
    expect(final.map((n) => n.statId)).toContain("championship-inevitability");
  });

  it("never narrates on-this-day, which is a date, not a ranking", () => {
    for (const stat of stats.stats) {
      for (const entry of stat.entries) {
        const notes = narrate(
          stats,
          { year: entry.year, week: entry.week },
          { limit: 50, minWeight: 0 }
        );
        expect(notes.map((n) => n.statId)).not.toContain("on-this-day");
      }
    }
  });

  it("links a note to its own row of its list", () => {
    expect(recordListHref("biggest-margin", 3)).toBe("/records/biggest-margin#rank-3");
    expect(recordListHref("biggest-margin")).toBe("/records/biggest-margin");
  });
});

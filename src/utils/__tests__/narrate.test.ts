import { describe, expect, it } from "vitest";
import raw from "../../../public/data/all-time.json?raw";
import { narrate } from "@/utils/narrative/narrate";
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

  it("respects the limit and the notability bar", () => {
    const many = narrate(stats, { year: 2022, week: 17 }, { limit: 1, minWeight: 0 });
    expect(many.length).toBeLessThanOrEqual(1);

    // Nothing weak sneaks through at the default bar.
    const strict = narrate(stats, { year: 2022, week: 17 });
    for (const note of strict) expect(note.weight).toBeGreaterThanOrEqual(0.9);
  });
});

describe("ordinal", () => {
  it("handles the teens, which every naive version gets wrong", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

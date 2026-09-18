import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { loadWeek } from "@/data/gamedays";
import {
  buildGameFlow,
  describeFlow,
  slotOf,
  squeezedTime,
} from "@/utils/gameFlow";

/** Epoch seconds for an ISO time. */
const at = (iso: string) => Date.parse(iso) / 1000;

describe("the NFL's week, in Eastern time", () => {
  it("names every slot the way the week is spoken about", () => {
    // 2025 week 2, as it was played.
    expect(slotOf(at("2025-09-12T00:20:00Z"))).toBe("Thursday night"); // 8:20pm Thu ET
    expect(slotOf(at("2025-09-12T03:10:00Z"))).toBe("Thursday night"); // past midnight
    expect(slotOf(at("2025-09-14T17:05:00Z"))).toBe("Sunday early");
    expect(slotOf(at("2025-09-14T20:30:00Z"))).toBe("Sunday late");
    expect(slotOf(at("2025-09-15T00:25:00Z"))).toBe("Sunday night");
    expect(slotOf(at("2025-09-16T00:15:00Z"))).toBe("Monday night");
    expect(slotOf(at("2025-09-16T04:40:00Z"))).toBe("Monday night");
    // London, 9:30am Eastern.
    expect(slotOf(at("2025-10-05T13:35:00Z"))).toBe("Sunday morning");
  });
});

describe("the squeezed clock", () => {
  it("draws play at its width and a night as half an hour", () => {
    const { position, span } = squeezedTime([0, 60, 120, 120 + 20 * 3600]);
    expect(position(60)).toBe(60);
    expect(position(90)).toBe(90);
    expect(span).toBe(120 + 1800);
    expect(position(120 + 20 * 3600)).toBe(span);
  });
});

describe("2025 week 2: hadkiss 130.8, fin 105.48", () => {
  it("is fourteen lead changes, settled on Monday night by Baker Mayfield", async () => {
    const file = (await loadWeek(2025, 2))!;
    const pair = seasons[2025].matchups["2"]!
      .filter((side) => side.matchup_id === 3)
      .map((side) => side.roster_id);
    const flow = buildGameFlow(file, [pair[0], pair[1]])!;
    const official = pair.map(
      (id) => seasons[2025].matchups["2"]!.find((s) => s.roster_id === id)!.points
    );

    expect(flow.final).toEqual(official);
    expect(flow.leadChanges).toHaveLength(14);
    expect(slotOf(flow.decided!.at)).toBe("Monday night");
    expect(flow.decided!.starterId).toBe("4892");

    const names = ["hadkiss", "fin"] as const;
    const winner = official[0] > official[1] ? 0 : 1;
    const ordered = winner === 0 ? names : ([names[1], names[0]] as const);
    expect(describeFlow(flow, pair[0] === pair[0] ? ordered : names, (id) => (id === "4892" ? "Baker Mayfield" : id)))
      .toContain("went ahead for good on Monday night, when Baker Mayfield scored.");
  });
});

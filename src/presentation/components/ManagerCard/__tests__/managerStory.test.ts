import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEAR_NUMBERS } from "@/domain/constants";
import { buildCareerTimeline } from "@/presentation/components/ManagerDetail/useCareerTimeline";
import { getSeasonCrowns } from "@/utils/crowns";
import { getManagerStats } from "@/utils/managerStats";
import { buildManagerStories } from "../managerStories";

/**
 * F1e. The line on each manager card is read by the managers it describes,
 * who will check it. So every claim is recounted here from the timeline,
 * independently of how `managerStory` phrased it.
 */
const stories = buildManagerStories();
const settledYears = YEAR_NUMBERS.filter(
  (y) => (seasons[y]?.winners_bracket?.length ?? 0) > 0
);

const settledOf = (id: string) =>
  buildCareerTimeline(
    id,
    getManagerStats(id, "regular")?.seasonStats ?? []
  ).seasons.filter((s) => !s.inProgress && s.position !== null);

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
};
const num = (w: string) => WORDS[w.toLowerCase()] ?? Number(w);

describe("manager stories", () => {
  it("has a line for everyone who has finished a season", () => {
    for (const m of managers) {
      if (settledOf(m.id).length) expect(stories[m.id], m.id).toBeTruthy();
    }
  });

  it("counts titles right, and names the most recent", () => {
    for (const m of managers) {
      const story = stories[m.id] ?? "";
      const titles = settledOf(m.id)
        .filter((s) => s.position === 1)
        .map((s) => s.year);
      const one = /^Champion in (\d{4})/.exec(story);
      const many = /^(\w+) titles, the last in (\d{4})/.exec(story);
      if (titles.length === 1) expect(one?.[1], m.id).toBe(String(titles[0]));
      else if (titles.length > 1) {
        expect(num(many?.[1] ?? ""), m.id).toBe(titles.length);
        expect(many?.[2], m.id).toBe(String(Math.max(...titles)));
      } else expect(one ?? many, m.id).toBeNull();
    }
  });

  it("only says 'no playoffs since' when every settled season after it missed", () => {
    let checked = 0;
    for (const m of managers) {
      const since = /no playoffs since (\d{4})/.exec(stories[m.id] ?? "");
      if (!since) continue;
      const year = Number(since[1]);
      const settled = settledOf(m.id);
      expect(settled.find((s) => s.year === year)?.madePlayoffs, m.id).toBe(true);
      const after = settled.filter((s) => s.year > year);
      expect(after.length, m.id).toBeGreaterThanOrEqual(3);
      expect(after.some((s) => s.madePlayoffs), m.id).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("only claims a playoff run it can count, in consecutive seasons", () => {
    for (const m of managers) {
      const run = /in the playoffs (\w+) years running/.exec(stories[m.id] ?? "");
      if (!run) continue;
      const settled = settledOf(m.id);
      const last = Math.max(...settled.map((s) => s.year));
      for (let y = last; y > last - num(run[1]); y--) {
        expect(settled.find((s) => s.year === y)?.madePlayoffs, `${m.id} ${y}`).toBe(true);
      }
    }
  });

  it("counts Scumbos as the worst all-play record, from crowns.ts", () => {
    let checked = 0;
    for (const m of managers) {
      const story = stories[m.id] ?? "";
      const held = settledYears.filter((y) =>
        getSeasonCrowns(y).some((c) => c.managerId === m.id && c.worstAllPlay)
      );
      const many = /(\w+)-time Scumbo/.exec(story);
      const once = /Scumbo in (\d{4})/.exec(story);
      if (many) expect(num(many[1]), m.id).toBe(held.length);
      if (once) expect(held, m.id).toEqual([Number(once[1])]);
      if (many || once) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("says 'last played' only of managers who have left", () => {
    const latest = Math.max(...settledYears);
    for (const m of managers) {
      const left = /last played in (\d{4})/.exec(stories[m.id] ?? "");
      if (!left) continue;
      const last = Math.max(...settledOf(m.id).map((s) => s.year));
      expect(Number(left[1]), m.id).toBe(last);
      expect(last, m.id).toBeLessThan(latest);
    }
  });

  it("gives a one-season manager that season, not a 'best'", () => {
    for (const m of managers) {
      const settled = settledOf(m.id);
      if (settled.length !== 1) continue;
      const [only] = settled;
      expect(stories[m.id]).toBe(
        `One season: ${only.position}${only.position === 1 ? "st" : only.position === 2 ? "nd" : only.position === 3 ? "rd" : "th"} of ${only.field} in ${only.year}.`
      );
    }
  });
});

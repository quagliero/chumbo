import { describe, expect, it } from "vitest";
import { isSeasonSettled } from "@/utils/playoffUtils";
import managers from "@/data/managers.json";
import { seasons } from "@/data";
import { CURRENT_YEAR, YEAR_NUMBERS } from "@/domain/constants";
import { getManagerStats, type ManagerStats } from "@/utils/managerStats";
import { buildCareerTimeline } from "../useCareerTimeline";

/**
 * The timeline replaced eight stat tiles, and it is the only place on the page
 * that claims a real finishing position. Two things can go wrong without
 * looking wrong:
 *
 *   - the finish comes from regular-season order instead of the brackets, so a
 *     12-1 team that lost its semi-final is shown as champion;
 *   - a trophy is handed out for a season still being played.
 *
 * Both are asserted here against the real archive rather than a fixture,
 * because the bracket-numbering conventions the finish depends on are a
 * property of this league's data (see `utils/finalStandings.ts`).
 */

const timelineFor = (managerId: string) => {
  const stats = getManagerStats(managerId, "regular") as ManagerStats | null;
  return buildCareerTimeline(managerId, stats?.seasonStats ?? []);
};

const LONG = timelineFor("thd");
const SHORT = timelineFor("phil"); // one season, 2016

describe("buildCareerTimeline", () => {
  it("returns nothing for a manager with no seasons", () => {
    const timeline = buildCareerTimeline("nobody", []);
    expect(timeline.seasons).toEqual([]);
    expect(timeline.titles).toBe(0);
    expect(timeline.bestFinish).toBeNull();
  });

  it("covers a one-season career", () => {
    expect(SHORT.seasons).toHaveLength(1);
    expect(SHORT.seasons[0].year).toBe(2016);
    expect(SHORT.seasons[0].position).not.toBeNull();
    expect(SHORT.bestFinish).toBe(SHORT.seasons[0].position);
  });

  it("runs oldest season first", () => {
    const years = LONG.seasons.map((season) => season.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it("puts every finish inside the field that played that year", () => {
    for (const season of LONG.seasons) {
      expect(season.field).toBe(seasons[season.year].rosters.length);
      expect(season.position).not.toBeNull();
      expect(season.position!).toBeGreaterThanOrEqual(1);
      expect(season.position!).toBeLessThanOrEqual(season.field);
    }
  });

  /**
   * The point of using `getFinalStandings` rather than `SeasonStats`: exactly
   * one manager can have finished first in a settled season. Regular-season
   * order would put the top seed there, and in several of these seasons the top
   * seed did not win it.
   */
  it("gives each settled season exactly one champion across the league", () => {
    const champions = new Map<number, string[]>();

    for (const manager of managers) {
      for (const season of timelineFor(manager.id).seasons) {
        if (season.inProgress || season.position !== 1) continue;
        champions.set(season.year, [
          ...(champions.get(season.year) ?? []),
          manager.id,
        ]);
      }
    }

    for (const year of YEAR_NUMBERS) {
      const settled = isSeasonSettled(seasons[year]);
      if (!settled) continue;
      expect(champions.get(year) ?? []).toHaveLength(1);
    }
  });

  it("awards no trophy for the season still being played", () => {
    for (const manager of managers) {
      for (const season of timelineFor(manager.id).seasons) {
        if (!season.inProgress) continue;
        // In progress means no brackets, so the position can only have come
        // from the table — and nothing in that state may count as a title.
        expect(season.source).toBe("record");
        expect(season.year).toBe(CURRENT_YEAR);
      }
    }
  });

  /**
   * The bug F1c found, in its sharper form: in September a manager with an
   * empty cabinet sits top of the table on two results, and the page reads
   * "No titles yet · best 1st".
   */
  it("counts only settled seasons towards titles and best finish", () => {
    const live = LONG.seasons.filter((season) => season.inProgress);
    const settled = LONG.seasons.filter((season) => !season.inProgress);

    expect(LONG.titles).toBe(
      settled.filter((season) => season.position === 1).length
    );
    expect(LONG.bestFinish).toBe(
      Math.min(...settled.map((season) => season.position!))
    );
    // And the live season is present in the list even though it counts for
    // nothing — the timeline still has to show where they stand.
    if (live.length > 0) expect(live[0].position).not.toBeNull();
  });

  it("nests the honours: every title is a final, every final a podium", () => {
    for (const manager of managers) {
      const timeline = timelineFor(manager.id);
      expect(timeline.finals).toBeGreaterThanOrEqual(timeline.titles);
      expect(timeline.podiums).toBeGreaterThanOrEqual(timeline.finals);
      expect(timeline.playoffBerths).toBeLessThanOrEqual(
        timeline.seasons.length
      );
    }
  });

  /**
   * 2012 and 2013 bracket only eight of their ten teams, so the bottom two of
   * those seasons are placed by record. That is a real finish, but the UI marks
   * it differently, so the distinction has to survive into the data.
   */
  it("says how each finish was decided", () => {
    const sources = new Set<string | null>();
    for (const manager of managers) {
      for (const season of timelineFor(manager.id).seasons) {
        sources.add(season.source);
      }
    }
    expect(sources.has("bracket")).toBe(true);
    expect(sources.has("record")).toBe(true);
    expect(sources.has(null)).toBe(false);
  });
});

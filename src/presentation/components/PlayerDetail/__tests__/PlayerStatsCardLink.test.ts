import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { pairingsInWeek } from "@/presentation/components/SeeAlso/matchupRail";
import { gameHref } from "../PlayerStatsCardLink";

/**
 * `PlayerStatsCard` links a player's best week to
 * `/seasons/:y/matchups/:w/:id`, built from the matchup id stored on that
 * performance. `history.tsx` renders "Invalid matchup data" for an id that is
 * not exactly two sides, so the card must not offer the link for one.
 */

/** A real two-sided game, taken from the data rather than invented. */
const realGame = (() => {
  for (const [year, season] of Object.entries(seasons)) {
    for (const [week, weekMatchups] of Object.entries(season.matchups ?? {})) {
      const [pairing] = pairingsInWeek(weekMatchups);
      if (pairing) {
        return {
          year: Number(year),
          week: Number(week),
          matchupId: pairing.matchupId,
        };
      }
    }
  }
  throw new Error("no paired matchup in the archive");
})();

/** A team-week with no opponent: eliminated, still setting a lineup. */
const unpairedGame = (() => {
  for (const [year, season] of Object.entries(seasons)) {
    for (const [week, weekMatchups] of Object.entries(season.matchups ?? {})) {
      const real = new Set(pairingsInWeek(weekMatchups).map((p) => p.matchupId));
      const lone = (weekMatchups ?? []).find((m) => !real.has(m.matchup_id));
      if (lone) {
        return {
          year: Number(year),
          week: Number(week),
          matchupId: lone.matchup_id,
        };
      }
    }
  }
  throw new Error("no unpaired team-week in the archive");
})();

describe("the best-week link", () => {
  it("is offered for a two-sided game", () => {
    expect(gameHref(realGame)).toBe(
      `/seasons/${realGame.year}/matchups/${realGame.week}/${realGame.matchupId}`
    );
  });

  it("is withheld for a team-week with no opponent", () => {
    // 48 of these exist, all `matchup_id: null` — an eliminated team in a
    // playoff week. Each would have linked to "Invalid matchup data".
    expect(Number.isFinite(unpairedGame.matchupId)).toBe(false);
    expect(gameHref(unpairedGame)).toBeNull();
  });

  it("is withheld for a matchup id that week does not have", () => {
    expect(gameHref({ ...realGame, matchupId: 999 })).toBeNull();
  });

  it("is withheld for a week the season does not have", () => {
    expect(gameHref({ ...realGame, week: 99 })).toBeNull();
  });

  it("is withheld when there is no best week at all", () => {
    expect(gameHref(null)).toBeNull();
  });

  it("is withheld while that season's matchups are not loaded (A2a)", () => {
    const saved = seasons[realGame.year].matchups;
    seasons[realGame.year].matchups = {};
    try {
      expect(gameHref(realGame)).toBeNull();
    } finally {
      seasons[realGame.year].matchups = saved;
    }
  });
});

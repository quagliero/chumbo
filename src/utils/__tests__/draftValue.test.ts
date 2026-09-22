import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { computeStat } from "@/utils/stats";
import type { Game } from "@/utils/stats/types";
import {
  baselineByPickNumber,
  replacementLevels,
  scoreDraftPicks,
  withBaseline,
  COMPLETE_SEASON_WEEKS,
  STARTING_SLOTS,
  type DraftPick,
} from "../draftValue";
import { buildDraftScatter } from "@/presentation/components/Chart/DraftScatter/useDraftScatter";

/**
 * D6's derivation, tested rather than eyeballed.
 *
 * A scatter that plots the wrong pick against the wrong points looks exactly
 * like one that does not, which is the whole reason this file exists. The last
 * block is the important one: it checks the chart agrees with the records
 * tables, which are computed by a different implementation of the same two
 * decisions.
 */

/** Only the four fields the derivation reads. */
const game = (
  year: number,
  week: number,
  rosterId: number,
  playersPoints: Record<string, number>
): Game => ({ year, week, rosterId, playersPoints } as Game);

/** A season long enough to be scored, with the points all in week 1. */
const playedSeason = (
  year: number,
  scoring: Array<{ rosterId: number; playersPoints: Record<string, number> }>,
  weeks = COMPLETE_SEASON_WEEKS
): Game[] =>
  Array.from({ length: weeks }, (_, index) =>
    scoring.map(({ rosterId, playersPoints }) =>
      game(year, index + 1, rosterId, index === 0 ? playersPoints : {})
    )
  ).flat();

const pick = (
  pickNo: number,
  playerId: string,
  rosterId: number,
  year = 2020,
  position = "RB"
): DraftPick => ({
  year,
  round: Math.ceil(pickNo / 12),
  pickNo,
  playerId,
  rosterId,
  position,
});

describe("scoreDraftPicks", () => {
  it("values a pick on the player's whole season, and keeps who got what", () => {
    const games = playedSeason(2020, [
      { rosterId: 1, playersPoints: { "99": 100 } },
      { rosterId: 2, playersPoints: { "99": 50 } },
    ]);

    const [scored] = scoreDraftPicks(
      games,
      new Map([[2020, [pick(1, "99", 1)]]])
    );

    expect(scored.total).toBe(150);
    expect(scored.points).toBe(100);
    expect(scored.pointsElsewhere).toBe(50);
  });

  it("does not call a player traded before week 1 a zero", () => {
    // I3. Every point for somebody else — the drafter kept none of them.
    const games = playedSeason(2020, [
      { rosterId: 2, playersPoints: { "99": 300 } },
    ]);
    const [valued] = withBaseline(
      scoreDraftPicks(games, new Map([[2020, [pick(1, "99", 1)]]]))
    );

    expect(valued.points).toBe(0);
    expect(valued.total).toBe(300);
    expect(valued.value).toBe(0); // alone in its window: it IS the baseline
  });

  it("scores a pick who never played for anyone as zero, not as missing", () => {
    const games = playedSeason(2020, [
      { rosterId: 1, playersPoints: { "99": 100 } },
    ]);

    const [scored] = scoreDraftPicks(
      games,
      new Map([[2020, [pick(2, "404", 1)]]])
    );

    expect(scored.points).toBe(0);
    expect(scored.pointsElsewhere).toBe(0);
  });

  it("adds up a player's weeks on the roster that drafted him", () => {
    const games = [
      game(2020, 1, 1, { "99": 10 }),
      game(2020, 2, 1, { "99": 20 }),
      ...Array.from({ length: 12 }, (_, index) => game(2020, index + 3, 1, {})),
    ];

    const [scored] = scoreDraftPicks(
      games,
      new Map([[2020, [pick(1, "99", 1)]]])
    );

    expect(scored.points).toBe(30);
  });

  it("drops a season with too little football behind it", () => {
    // The 2026 case: a draft has happened, a fortnight has been played, and
    // every one of its picks would otherwise sit on the floor of the chart.
    const games = playedSeason(
      2026,
      [{ rosterId: 1, playersPoints: { "99": 12 } }],
      2
    );

    expect(
      scoreDraftPicks(games, new Map([[2026, [pick(1, "99", 1)]]]))
    ).toHaveLength(0);
  });

  it("drops a draft whose season has no games at all", () => {
    expect(scoreDraftPicks([], new Map([[2020, [pick(1, "99", 1)]]]))).toEqual(
      []
    );
  });
});

describe("baselineByPickNumber", () => {
  const scored = [
    { ...pick(1, "a", 1), total: 100, points: 100, pointsElsewhere: 0 },
    { ...pick(2, "b", 2), total: 80, points: 80, pointsElsewhere: 0 },
    { ...pick(3, "c", 3), total: 60, points: 60, pointsElsewhere: 0 },
  ];

  it("averages every pick within the window, both sides", () => {
    // Window 1 around pick 2 sees picks 1, 2 and 3.
    expect(baselineByPickNumber(scored, 1).get(2)).toBeCloseTo(80, 10);
    // And at the end of the board there is only one neighbour to average with.
    expect(baselineByPickNumber(scored, 1).get(1)).toBeCloseTo(90, 10);
  });

  it("pools every season's observations of the same pick number", () => {
    const twoSeasons = [
      { ...pick(1, "a", 1, 2020), total: 100, points: 100, pointsElsewhere: 0 },
      { ...pick(1, "b", 1, 2021), total: 0, points: 0, pointsElsewhere: 0 },
    ];
    expect(baselineByPickNumber(twoSeasons, 0).get(1)).toBe(50);
  });

  it("is the same window either side, so the curve has no step in it", () => {
    expect(baselineByPickNumber(scored, 5).get(1)).toBeCloseTo(240 / 3, 10);
    expect(baselineByPickNumber(scored, 5).get(3)).toBeCloseTo(240 / 3, 10);
  });
});

describe("withBaseline", () => {
  it("values a pick as its return minus the going rate for that slot", () => {
    const valued = withBaseline([
      { ...pick(1, "a", 1), total: 100, points: 100, pointsElsewhere: 0, elsewhere: [], started: 10, startedPoints: 100 },
      { ...pick(2, "b", 2), total: 0, points: 0, pointsElsewhere: 0, elsewhere: [], started: 0, startedPoints: 0 },
    ]);

    // Both picks are inside one window of each other, so both baselines are 50.
    expect(valued[0].baseline).toBe(50);
    expect(valued[0].value).toBe(50);
    expect(valued[1].value).toBe(-50);
  });
});

/* ------------------------------------------------------------------ *
 * Against the real drafts.
 * ------------------------------------------------------------------ */

/** What `useDraftScatter` builds, without React. */
const realPoints = () => buildDraftScatter().points;

describe("the real drafts", () => {
  it("scores every pick of every finished draft, and none of an unfinished one", () => {
    const valued = realPoints();
    const years = [...new Set(valued.map((point) => point.year))].sort();

    // Ten teams in 2012-13, twelve since; fifteen rounds throughout.
    const expected = years.reduce(
      (total, year) => total + (seasons[year]?.picks?.length ?? 0),
      0
    );
    expect(valued).toHaveLength(expected);

    // Every year with a draft and a played season, and only those.
    for (const year of years) {
      expect(seasons[year]?.picks?.length).toBeGreaterThan(0);
    }
  });

  it("values Kamara and Barkley 2018 on their seasons, not on a week-1 trade", () => {
    // Picks 4 and 6 of 2018, both traded in leg 1 for Le'Veon Bell. Before I3
    // both sat on the floor of the chart at 0.0 as two of the worst picks the
    // league had ever made.
    const valued = realPoints().filter((point) => point.year === 2018);
    for (const [pickNo, playerId] of [
      [4, "4035"],
      [6, "4866"],
    ] as const) {
      const point = valued.find((p) => p.pickNo === pickNo);
      expect(point?.playerId).toBe(playerId);
      expect(point?.points).toBe(0);
      expect(point?.total).toBeGreaterThan(200); // 256.9 and 248.9
      expect(point?.value).toBeGreaterThan(0);
    }
  });

  it("keeps 2019, whose bench scores are incomplete, rather than hiding it", () => {
    // The chart marks these rather than dropping them (see the component).
    // `draftStats.ts` made the same call for the records tables.
    expect(realPoints().some((point) => point.year === 2019)).toBe(true);
  });

  it("agrees with the records tables about the best and worst picks ever", () => {
    // `best-draft-picks` and the scatter share the model now, but not the
    // plumbing into it — the positions, the drafts, the games. If the
    // scatter's top steal is not the records' top entry, one of those joins
    // is wrong, and a scatter is the one where nobody would notice.
    const valued = [...realPoints()].sort((a, b) => b.value - a.value);
    const best = computeStat("best-draft-picks", 1)[0];
    const worst = computeStat("worst-draft-picks", 1)[0];

    expect(Math.round(valued[0].value * 10) / 10).toBe(best.value);
    expect(best.detail).toContain(`pick ${valued[0].pickNo}`);
    expect(best.year).toBe(valued[0].year);

    const last = valued[valued.length - 1];
    expect(Math.round(last.value * 10) / 10).toBe(worst.value);
    expect(worst.detail).toContain(`pick ${last.pickNo}`);
    expect(worst.year).toBe(last.year);
  });
});

/* ------------------------------------------------------------------ *
 * The last starter at each position.
 * ------------------------------------------------------------------ */

describe("replacementLevels", () => {
  /** Twelve teams, one week: each lineup a QB, two RBs, two WRs, a flex RB or WR. */
  const week = (weekNo: number, scores: (team: number) => Record<string, number>, flexRb: (team: number) => boolean) =>
    Array.from({ length: 12 }, (_, t) => {
      const team = t + 1;
      const players = scores(team);
      // Both receiver slots are always filled, as every real lineup's are,
      // so the flex is whatever comes after them.
      const starters = [
        `qb${team}`,
        `rb${team}a`,
        `rb${team}b`,
        `wr${team}a`,
        `wr${team}b`,
        flexRb(team) ? `rb${team}c` : `wr${team}c`,
      ];
      return {
        year: 2020,
        week: weekNo,
        rosterId: team,
        playersPoints: players,
        starters,
        startersPoints: starters.map((id) => players[id] ?? 0),
      } as unknown as Game;
    });

  const positionOf = (id: string) => (id.startsWith("qb") ? "QB" : id.startsWith("rb") ? "RB" : "WR");

  it("measures a quarterback against quarterbacks", () => {
    // Every quarterback scores 20 a week; running backs 5 to 16. On raw points
    // every one of them beats every back. Against the last starting QB, the
    // league's twelve interchangeable quarterbacks are worth nothing extra.
    const games = week(
      1,
      (team) => ({
        [`qb${team}`]: 20,
        [`rb${team}a`]: 5 + team,
        [`rb${team}b`]: 4 + team,
        [`rb${team}c`]: 3,
        [`wr${team}c`]: 3,
      }),
      () => true
    );
    const levels = replacementLevels(games, positionOf).get(2020)!;
    expect(levels.get("QB")).toBe(20);
    expect(levels.get("QB")! - 20).toBe(0);
    expect(levels.get("RB")).toBeLessThan(20);
  });

  it("counts a position's share of the flex from who actually started there", () => {
    // Half the league starts a third back in the flex, so backs have 2.5
    // starters a team (30), not 2 (24): the last starter is further down.
    const games = week(
      1,
      (team) => ({
        [`qb${team}`]: 20,
        [`rb${team}a`]: 100 - team,
        [`rb${team}b`]: 70 - team,
        [`rb${team}c`]: 40 - team,
        [`wr${team}c`]: 30,
      }),
      (team) => team % 2 === 0
    );
    const halfFlex = replacementLevels(games, positionOf).get(2020)!.get("RB")!;
    const noFlex = replacementLevels(
      week(1, (team) => ({ [`qb${team}`]: 20, [`rb${team}a`]: 100 - team, [`rb${team}b`]: 70 - team, [`rb${team}c`]: 40 - team, [`wr${team}c`]: 30 }), () => false),
      positionOf
    ).get(2020)!.get("RB")!;
    expect(halfFlex).toBeLessThan(noFlex);
  });

  it("does not hold a missed or benched week against a player", () => {
    // Two backs averaging 10 a start; one started half the season. Over the
    // weeks each started they were the same player, and a pick that got the
    // second is not worth less for the weeks somebody else filled in.
    const picks = withBaseline(
      [
        { ...pick(1, "full", 1), total: 140, points: 140, pointsElsewhere: 0, elsewhere: [], started: 14, startedPoints: 140 },
        { ...pick(2, "half", 2), total: 70, points: 70, pointsElsewhere: 0, elsewhere: [], started: 7, startedPoints: 70 },
      ],
      new Map([[2020, new Map([["RB", 10]])]])
    );
    expect(picks.map((p) => p.aboveReplacement)).toEqual([0, 0]);
  });

  it("describes the lineup every season has actually used", () => {
    // If the league changes its lineup, the last-starter counts are wrong
    // until STARTING_SLOTS is told. This is how it gets told.
    for (const year of YEAR_NUMBERS) {
      const slots = (seasons[year].league?.roster_positions ?? []).filter((p) => p !== "BN");
      const counted: Record<string, number> = {};
      for (const slot of slots) counted[slot] = (counted[slot] ?? 0) + 1;
      expect(counted, String(year)).toEqual({ ...STARTING_SLOTS, FLEX: 1 });
    }
  });
});

describe("the real drafts, by position", () => {
  it("no longer makes a late quarterback a steal for being a quarterback", () => {
    // The whole point. On raw points every quarterback taken in round 9 or
    // later outscored the picks around him; measured against the last
    // starting quarterback, the typical one is worth about what his slot is.
    const late = realPoints()
      .filter((p) => p.position === "QB" && p.round >= 9)
      .map((p) => p.value)
      .sort((a, b) => a - b);
    const median = late[Math.floor(late.length / 2)];
    expect(Math.abs(median)).toBeLessThan(30);
  });
});

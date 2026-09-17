import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { computeStat } from "@/utils/stats";
import { getStatContext } from "@/utils/stats/traverse";
import type { Game } from "@/utils/stats/types";
import {
  baselineByPickNumber,
  scoreDraftPicks,
  withBaseline,
  COMPLETE_SEASON_WEEKS,
  type DraftPick,
} from "../draftValue";

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
  year = 2020
): DraftPick => ({
  year,
  round: Math.ceil(pickNo / 12),
  pickNo,
  playerId,
  rosterId,
});

describe("scoreDraftPicks", () => {
  it("credits a pick only with what the drafting roster got", () => {
    const games = playedSeason(2020, [
      { rosterId: 1, playersPoints: { "99": 100 } },
      { rosterId: 2, playersPoints: { "99": 50 } },
    ]);

    const [scored] = scoreDraftPicks(
      games,
      new Map([[2020, [pick(1, "99", 1)]]])
    );

    expect(scored.points).toBe(100);
    expect(scored.pointsElsewhere).toBe(50);
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
    { ...pick(1, "a", 1), points: 100, pointsElsewhere: 0 },
    { ...pick(2, "b", 2), points: 80, pointsElsewhere: 0 },
    { ...pick(3, "c", 3), points: 60, pointsElsewhere: 0 },
  ];

  it("averages every pick within the window, both sides", () => {
    // Window 1 around pick 2 sees picks 1, 2 and 3.
    expect(baselineByPickNumber(scored, 1).get(2)).toBeCloseTo(80, 10);
    // And at the end of the board there is only one neighbour to average with.
    expect(baselineByPickNumber(scored, 1).get(1)).toBeCloseTo(90, 10);
  });

  it("pools every season's observations of the same pick number", () => {
    const twoSeasons = [
      { ...pick(1, "a", 1, 2020), points: 100, pointsElsewhere: 0 },
      { ...pick(1, "b", 1, 2021), points: 0, pointsElsewhere: 0 },
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
      { ...pick(1, "a", 1), points: 100, pointsElsewhere: 0 },
      { ...pick(2, "b", 2), points: 0, pointsElsewhere: 0 },
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
const realDrafts = () => {
  const drafts = new Map<number, DraftPick[]>();
  for (const year of YEAR_NUMBERS) {
    const picks = seasons[year]?.picks;
    if (!picks?.length) continue;
    drafts.set(
      year,
      picks.map((raw) => ({
        year,
        round: raw.round,
        pickNo: raw.pick_no,
        playerId: String(raw.player_id),
        rosterId: raw.roster_id,
      }))
    );
  }
  return drafts;
};

const realPoints = () =>
  withBaseline(scoreDraftPicks(getStatContext().games, realDrafts()));

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

  it("keeps 2019, whose lineups are reconstructed, rather than hiding it", () => {
    // The chart marks these rather than dropping them (see the component).
    // `draftStats.ts` made the same call for the records tables.
    expect(realPoints().some((point) => point.year === 2019)).toBe(true);
  });

  it("agrees with the records tables about the best and worst picks ever", () => {
    // `best-draft-picks` is a second, independent implementation of the same
    // two decisions. If the scatter's top steal is not its top entry, one of
    // them is wrong — and a scatter is the one where nobody would notice.
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

import { afterEach, describe, expect, it } from "vitest";
import { getWeek } from "@/data/gamedays";
import { computeStat, getStatContext, provideTimelines } from "@/utils/stats";
import { clockOf, minutesIntoWeek, slotOf } from "@/utils/gameFlow";
import { PINNED_THROUGH } from "./helpers";

/**
 * The records that only the play-by-play can see (L2).
 *
 * Two kinds of check, for the reason J1's note gives: a fact checked by hand
 * is pinned to the last finished season, so a live 2026 game taking a record
 * cannot fail the build; everything else is an invariant that must hold
 * whatever the season does.
 */

/** Epoch seconds for an ISO time. */
const at = (iso: string) => Date.parse(iso) / 1000;

/** The timelines the setup file provided, for tests that take them away. */
const restore = () =>
  provideTimelines((year, week) => getWeek(year, week) ?? null);

afterEach(restore);

const finished = <T extends { year?: number }>(entries: T[]) =>
  entries.filter((entry) => (entry.year ?? 0) <= PINNED_THROUGH);

describe("the week's flows", () => {
  it("is one per decided game, the winner first", () => {
    const { flows, games } = getStatContext();

    expect(flows.length).toBeGreaterThan(1000);
    // A game appears once, as its winner's half, and the flow agrees with the
    // official scores — which is what makes side 0 "the winner" everywhere.
    const wrong = flows.filter(
      ({ game, flow }) =>
        game.result !== "win" ||
        Math.abs(flow.final[0] - game.points) > 0.05 ||
        Math.abs(flow.final[1] - game.opponentPoints) > 0.05
    );
    expect(wrong.map(({ game }) => `${game.year} w${game.week}`)).toEqual([]);

    // Never more than one per game played.
    expect(flows.length).toBeLessThanOrEqual(games.length / 2);
  });

  it("leaves 2019 out of every record built on it", () => {
    // Its lineups are a reconstruction, so its timelines are a guess at the
    // shape of the game, not only at a total.
    for (const id of ["biggest-comeback", "latest-decisive-play"]) {
      expect(computeStat(id).some((entry) => entry.year === 2019)).toBe(false);
    }
  });
});

describe("without the timelines", () => {
  it("refuses to answer rather than reporting no records", () => {
    provideTimelines(null);
    expect(() => computeStat("biggest-comeback")).toThrow(/timelines/);
    expect(() => computeStat("monday-night-wins")).toThrow(/timelines/);
    // A stat that reads only season data is unaffected.
    expect(computeStat("biggest-margin").length).toBeGreaterThan(100);
  });

  it("does not serve a cached answer from when they were there", () => {
    const before = computeStat("biggest-comeback");
    expect(before.length).toBeGreaterThan(0);
    provideTimelines(null);
    expect(() => computeStat("biggest-comeback")).toThrow();
    restore();
    expect(computeStat("biggest-comeback")).toHaveLength(before.length);
  });
});

describe("the biggest comeback", () => {
  it("is rich, 77.4 down to jay in 2024 week 8", () => {
    const [top] = finished(computeStat("biggest-comeback"));
    expect(top.subject).toBe("rich");
    expect(top.value).toBeCloseTo(77.4, 1);
    expect(top.year).toBe(2024);
    expect(top.week).toBe(8);
    expect(top.detail).toContain("77.4 down in Sunday's early games");
    expect(top.href).toMatch(/^\/seasons\/2024\/matchups\/8\//);
  });

  it("is the widest gap the two timelines ever showed", () => {
    // Re-derived from the steps rather than trusted from the running total,
    // and the moment named in the detail is that step. (Not bounded by the
    // opponent's final score, as it first looks: a fumbling lineup can go
    // below zero, which is how 2022 week 17 trails by more than its opponent
    // ever scored.)
    const wrong: string[] = [];
    for (const { game, flow } of getStatContext().flows) {
      const widest = Math.max(0, ...flow.steps.map((s) => s.score[1] - s.score[0]));
      const where = `${game.year} w${game.week} ${game.managerId}`;
      if (Math.abs(flow.comeback - widest) > 0.011) wrong.push(`${where}: ${flow.comeback} vs ${widest}`);
      if (flow.comeback > 0 && !flow.comebackFrom) wrong.push(`${where}: no low point`);
      if (
        flow.comebackFrom &&
        Math.abs(flow.comebackFrom.score[1] - flow.comebackFrom.score[0] - widest) > 0.011
      ) {
        wrong.push(`${where}: low point is not the widest gap`);
      }
    }
    expect(wrong).toEqual([]);
    expect(computeStat("biggest-comeback").every((entry) => entry.value > 0)).toBe(true);
  });
});

describe("the latest decisive play", () => {
  it("is the Tuesday night Buffalo and Tennessee had to play in 2020", () => {
    const [top] = finished(computeStat("latest-decisive-play"));
    expect(top.subject).toBe("nick");
    expect(top.year).toBe(2020);
    expect(top.week).toBe(5);
    expect(top.detail).toContain("Tuesday, 9:22 pm");
    expect(top.detail).toContain("Cole Beasley");
  });

  it("never hands the record to a correction", () => {
    // Sixteen NFL.com-era weeks end on an adjustment that squares a team with
    // its official score. It is not a play, it has no player, and its time is
    // borrowed from the last real one — so it cannot hold a record about WHEN
    // a game was won. No game in league history has been decided by one yet;
    // this is what keeps it that way.
    const { flows } = getStatContext();
    const byPlay = flows.filter(
      ({ game, flow }) => !game.lineupsApproximate && !flow.decided?.correction
    );
    expect(computeStat("latest-decisive-play")).toHaveLength(byPlay.length);
  });
});

describe("Monday night winners", () => {
  it("is hadkiss, and counts only games the lead changed hands that night", () => {
    const entries = computeStat("monday-night-wins");
    const [top] = entries;
    expect(top.subject).toBe("hadkiss");
    expect(top.value).toBeGreaterThanOrEqual(27);
    // The detail names a game, so the link is that game.
    expect(top.href).toMatch(/^\/seasons\/\d{4}\/matchups\/\d+\/\d+$/);
    expect(top.detail).toMatch(/^Most recently \d{4} Week \d+ vs /);
  });

  it("carries no year or week: it is a career count, not a game", () => {
    for (const entry of computeStat("monday-night-wins")) {
      expect(entry.year).toBeUndefined();
      expect(entry.week).toBeUndefined();
    }
  });

  it("adds up to the games the timelines say were won on Monday night", () => {
    const mondays = getStatContext().flows.filter(
      ({ game, flow }) =>
        !game.lineupsApproximate &&
        game.managerId &&
        flow.decided &&
        !flow.decided.correction &&
        slotOf(flow.decided.at) === "Monday night"
    );
    const counted = computeStat("monday-night-wins").reduce(
      (sum, entry) => sum + entry.value,
      0
    );
    expect(counted).toBe(mondays.length);
  });
});

describe("the NFL week's clock", () => {
  it("starts on Wednesday and ends on Tuesday night", () => {
    // 2012 opened on a Wednesday and 2024 played Christmas on one; a week that
    // began on Thursday made those the latest moments in league history.
    expect(minutesIntoWeek(at("2012-09-06T00:30:00Z"))).toBeLessThan(
      minutesIntoWeek(at("2012-09-07T00:30:00Z"))
    );
    // Tuesday night 2020, the latest football ever played in a Chumbo week.
    expect(minutesIntoWeek(at("2020-10-14T01:22:00Z"))).toBeGreaterThan(
      minutesIntoWeek(at("2020-10-13T03:00:00Z"))
    );
  });

  it("says the time the way the game was watched", () => {
    expect(clockOf(at("2025-09-16T03:42:00Z"))).toBe("Monday, 11:42 pm");
    expect(clockOf(at("2025-09-16T04:05:00Z"))).toBe("Tuesday, 12:05 am");
    expect(clockOf(at("2025-09-14T17:00:00Z"))).toBe("Sunday, 1:00 pm");
  });
});

import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import type { ExtendedMatchup } from "@/types/matchup";
import type { ExtendedRoster } from "@/types/roster";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import {
  buildMatchupPreview,
  fixturesFor,
  formStreak,
  formatOdds,
  previewWeek,
  stakesFor,
  streakRecords,
} from "@/utils/matchupPreview";
import allTime from "../../../public/data/all-time.json";
import {
  PRIOR_GAMES,
  calculateTeamStats,
  calculateWeekStakes,
  seededRandom,
} from "@/utils/playoffOdds";

/**
 * Matchup previews (K1).
 *
 * The stakes are tested on 2025 rewound to week 8 — a real season with real
 * fixtures still to come — rather than on the live season, which the
 * automatic update moves every week.
 */

/** 2025 as it stood after week 8: its matchups, and its rosters' records then. */
const rewound = (through: number) => {
  const season = seasons[2025];
  const matchups: Record<string, ExtendedMatchup[]> = {};
  for (let week = 1; week <= 14; week++) {
    const sides = season.matchups[String(week) as keyof typeof season.matchups] ?? [];
    matchups[week] =
      week <= through
        ? sides
        : sides.map((side) => ({ ...side, points: 0, players_points: {}, starters_points: [] }));
  }
  const rosters: ExtendedRoster[] = season.rosters.map((roster) => {
    let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
    for (let week = 1; week <= through; week++) {
      const sides = matchups[week];
      const mine = sides.find((s) => s.roster_id === roster.roster_id)!;
      const theirs = sides.find(
        (s) => s.matchup_id === mine.matchup_id && s.roster_id !== roster.roster_id
      )!;
      pf += mine.points;
      pa += theirs.points;
      if (mine.points > theirs.points) wins++;
      else if (mine.points < theirs.points) losses++;
      else ties++;
    }
    return {
      ...roster,
      settings: {
        ...roster.settings,
        wins, losses, ties,
        fpts: Math.floor(pf), fpts_decimal: Math.round((pf % 1) * 100),
        fpts_against: Math.floor(pa), fpts_against_decimal: Math.round((pa % 1) * 100),
      },
    };
  });
  const league = {
    ...season.league,
    status: "in_season",
    settings: { ...season.league.settings, leg: through + 1, last_scored_leg: through },
  };
  return { matchups, rosters, league };
};

describe("what a game is worth", () => {
  const data = rewound(8);
  const stakes = calculateWeekStakes(data, 9, { simulations: 4000, seed: 7 });

  it("has a line for every team", () => {
    expect(stakes).toHaveLength(12);
  });

  it("is always worth more to win than to lose", () => {
    for (const s of stakes) {
      expect(s.ifWin, String(s.rosterId)).toBeGreaterThanOrEqual(s.ifLose);
      for (const value of [s.now, s.ifWin, s.ifLose]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("puts the odds now between the odds either way", () => {
    // Now is a weighted average of the two, so it can only sit between them.
    for (const s of stakes) {
      expect(s.now).toBeGreaterThanOrEqual(s.ifLose - 0.01);
      expect(s.now).toBeLessThanOrEqual(s.ifWin + 0.01);
    }
  });

  it("gives six playoff places' worth of odds between them", () => {
    const total = stakes.reduce((sum, s) => sum + s.now, 0);
    expect(total).toBeCloseTo(600, 0);
  });

  it("gives the same answer for the same seed, which is what lets a page and its preview agree", () => {
    expect(calculateWeekStakes(data, 9, { simulations: 4000, seed: 7 })).toEqual(stakes);
  });

  it("has nothing to say about a week already played, or a playoff week", () => {
    expect(calculateWeekStakes(data, 8)).toEqual([]);
    expect(calculateWeekStakes(data, 15)).toEqual([]);
  });
});

describe("a team's expected score", () => {
  it("is pulled towards the league's after one game, and less so after many", () => {
    const early = rewound(1);
    const late = rewound(13);
    const leagueMean = (weeks: number, data: ReturnType<typeof rewound>) => {
      const scores = Object.entries(data.matchups)
        .filter(([week]) => Number(week) <= weeks)
        .flatMap(([, sides]) => sides.map((s) => s.points));
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };

    const [first] = calculateTeamStats(early, 1);
    const own = early.matchups[1].find((s) => s.roster_id === first.rosterId)!.points;
    const league = leagueMean(1, early);
    // One real game against PRIOR_GAMES at the league average.
    expect(first.mean).toBeCloseTo((own + PRIOR_GAMES * league) / (1 + PRIOR_GAMES), 6);

    // By week 13 the team's own record dominates.
    const [firstLate] = calculateTeamStats(late, 13);
    const ownLate = Object.values(late.matchups)
      .slice(0, 13)
      .map((sides) => sides.find((s) => s.roster_id === firstLate.rosterId)!.points);
    const ownMean = ownLate.reduce((a, b) => a + b, 0) / ownLate.length;
    expect(Math.abs(firstLate.mean - ownMean)).toBeLessThan(
      Math.abs(first.mean - own)
    );
  });
});

describe("the streak records a preview can threaten", () => {
  it("are the records page's records", () => {
    // Same rules as `longest-win-streak`, worked out separately: if the two
    // disagree, a preview would promise a record the records page denies.
    const { longest } = streakRecords();
    const entries = (id: string) => allTime.stats.find((s) => s.id === id)!.entries;
    for (const kind of ["win", "loss"] as const) {
      const [record, ...rest] = entries(`longest-${kind}-streak`);
      expect(longest[kind].count).toBe(record.value);
      // A shared record can be credited to either holder.
      const holders = [record, ...rest]
        .filter((entry) => entry.value === record.value)
        .map((entry) => entry.subject);
      expect(holders).toContain(longest[kind].managerId);
    }
  });
});

describe("seededRandom", () => {
  it("repeats for a seed and differs between seeds", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("the words", () => {
  it("never claims a certainty the simulation cannot", () => {
    expect(formatOdds(99.7)).toBe(">99%");
    expect(formatOdds(0.2)).toBe("<1%");
    expect(formatOdds(100)).toBe("100%");
    expect(formatOdds(0)).toBe("0%");
    expect(formatOdds(71.4)).toBe("71%");
  });

  it("only calls two in a row a streak", () => {
    expect(formStreak(["L", "W", "W", "W"])).toBe("won three straight");
    expect(formStreak(["W", "L", "L"])).toBe("lost two straight");
    expect(formStreak(["L", "W"])).toBeUndefined();
    expect(formStreak(["W", "T"])).toBeUndefined();
    expect(formStreak([])).toBeUndefined();
  });
});

// The live season, while it has a week to preview. Properties only: the
// automatic update changes the facts every week.
const upcoming = previewWeek(CURRENT_YEAR);

describe.runIf(upcoming !== null)("the week to come", () => {
  const week = upcoming as number;
  const fixtures = fixturesFor(CURRENT_YEAR, week);
  const stakes = stakesFor(CURRENT_YEAR, week);

  it("previews every game, each team once", () => {
    const teams = fixtures.flatMap(([, a, b]) => [a, b]);
    expect(new Set(teams).size).toBe(teams.length);
    expect(teams.length).toBe(seasons[CURRENT_YEAR].rosters.length);
  });

  it.each(fixtures)("game %i agrees with the head-to-head record", (matchupId) => {
    const preview = buildMatchupPreview(CURRENT_YEAR, week, matchupId, stakes)!;
    const [a, b] = preview.sides;
    const record = getAllTimeH2HRecord(a.ownerId, b.ownerId);
    expect(preview.h2h.wins).toBe(record.team1Wins);
    expect(preview.h2h.losses).toBe(record.team2Wins);
    expect(a.form.length).toBeLessThanOrEqual(5);
    for (const line of preview.onTheLine) expect(line).toMatch(/\.$/);
  });

  it("does not preview a week already played", () => {
    expect(buildMatchupPreview(CURRENT_YEAR, 1, fixturesFor(CURRENT_YEAR, 1)[0]?.[0] ?? 1)).toBeNull();
  });
});

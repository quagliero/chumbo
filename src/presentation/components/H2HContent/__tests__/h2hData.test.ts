import { describe, expect, it } from "vitest";
import { managers, seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import { digest } from "@/utils/__tests__/helpers";
import { getH2HData, H2HData, playoffRoundLabel } from "../h2hData";

/**
 * Pins the head-to-head page's computation (H2).
 *
 * The record, streak, matchup lists, All-Star lineups and best performances
 * used to be one 550-line `useMemo` in `H2HContent.tsx`. The snapshots were
 * recorded from the code moved out of it, verbatim, before the page was
 * switched over to call it, and the page rendered identically for every
 * pairing before and after.
 *
 * Only pairings with a manager who is not in the live season are pinned: the
 * rest gain a game most weeks, and a snapshot that moves every Tuesday stops
 * being read.
 */

const inLiveSeason = new Set(
  seasons[CURRENT_YEAR].rosters.map((roster) => roster.owner_id)
);
const retired = managers.filter((m) => !inLiveSeason.has(m.sleeper.id));

/** Every unordered pairing with at least one manager not playing this year. */
const STABLE_PAIRS = managers.flatMap((a, i) =>
  managers
    .slice(i + 1)
    .filter((b) => retired.includes(a) || retired.includes(b))
    .map((b) => [a.id, b.id] as const)
);

const describePair = (data: H2HData) => {
  const { stats } = data;
  const streak = stats.currentStreak;
  return {
    record: `${stats.managerAWins}-${stats.managerBWins}-${stats.ties}`,
    points: `${stats.managerATotalPoints.toFixed(2)} - ${stats.managerBTotalPoints.toFixed(2)}`,
    streak: `${streak.manager} ${streak.type}${streak.count}`,
    regularSeason: data.regularSeasonMatchups.map(
      (m) =>
        `${m.year} W${m.week} #${m.matchupId} ${m.managerAPoints}-${m.managerBPoints} ${m.result}`
    ),
    playoffs: data.playoffMatchups.map(
      (m) =>
        `${m.year} W${m.week} ${playoffRoundLabel(m.year, m.week)} ${m.managerAPoints}-${m.managerBPoints} ${m.result}`
    ),
    lineups: [data.managerALineup, data.managerBLineup].map((lineup) =>
      lineup.map(({ position, player }) =>
        player
          ? `${position} ${player.playerName} (${player.playerId}) ${player.gamesPlayed}g ${player.totalPoints.toFixed(2)}`
          : `${position} —`
      )
    ),
    best: [data.managerABestPerformances, data.managerBBestPerformances].map(
      (performances) =>
        performances.map(
          (p) =>
            `${p.playerName} (${p.playerId}) ${p.score} ${p.year} W${p.week} ${p.result}`
        )
    ),
  };
};

describe("getH2HData", () => {
  it("has pairings to pin", () => {
    expect(retired.length).toBeGreaterThan(0);
    expect(STABLE_PAIRS.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown manager", () => {
    expect(getH2HData("thd", "nobody")).toBeNull();
    expect(getH2HData("nobody", "thd")).toBeNull();
  });

  // Every stable pairing, both ways round, as a record and a digest of the
  // whole result — so a change anywhere fails, and the diff says which pair.
  it("matches every stable pairing", () => {
    const lines = STABLE_PAIRS.flatMap(([a, b]) =>
      [
        [a, b],
        [b, a],
      ].map(([x, y]) => {
        const data = getH2HData(x, y)!;
        return `${x} v ${y}: ${describePair(data).record} ${digest(data)}`;
      })
    );
    expect(lines).toMatchSnapshot();
  });

  // And three in full, so the snapshot shows what the digests stand for. All
  // three met in the playoffs; the last two have both left the league.
  it.each([
    ["nick", "hadkiss"],
    ["chris", "ant"],
    ["chris", "nick"],
  ])("%s v %s in full", (a, b) => {
    expect(describePair(getH2HData(a, b)!)).toMatchSnapshot();
  });
});

describe("playoffRoundLabel", () => {
  it("reads four-team brackets", () => {
    expect([15, 16].map((week) => playoffRoundLabel(2012, week))).toEqual([
      "Semi Finals",
      "Championship",
    ]);
  });

  it("reads six-team brackets", () => {
    expect([14, 15, 16].map((week) => playoffRoundLabel(2016, week))).toEqual(
      ["Wildcard", "Semi Finals", "Championship"]
    );
  });
});

import { describe, expect, it } from "vitest";
import { managers, seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import { digest } from "@/utils/__tests__/helpers";
import { getPlayerPosition } from "@/utils/playerDataUtils";
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

describe("the current streak", () => {
  /**
   * It used to be credited to manager A whatever the results, so a run of A's
   * losses rendered as "A L3" in A's colour — A looking like the one on a run.
   * The run belongs to whoever is winning it: A's losses are B's wins.
   */
  it("belongs to whoever won the most recent regular-season meeting", () => {
    let aOwned = 0;
    let bOwned = 0;
    for (const a of managers) {
      for (const b of managers) {
        if (a.id === b.id) continue;
        const data = getH2HData(a.id, b.id);
        const games = data?.regularSeasonMatchups ?? [];
        if (!data || games.length === 0) continue;
        const [latest] = [...games].sort(
          (x, y) => y.year - x.year || y.week - x.week
        );
        const streak = data.stats.currentStreak;
        if (latest.result === "W") {
          expect(streak.manager, `${a.id} v ${b.id}`).toBe("A");
          aOwned++;
        } else if (latest.result === "L") {
          expect(streak.manager, `${a.id} v ${b.id}`).toBe("B");
          bOwned++;
        } else {
          expect(streak.manager, `${a.id} v ${b.id}`).toBeNull();
        }
        expect(streak.type).toBe(latest.result === "T" ? "T" : "W");
      }
    }
    // Both orders of every pairing are walked, so both sides must occur.
    expect(aOwned).toBeGreaterThan(0);
    expect(bOwned).toBeGreaterThan(0);
  });
});

describe("the All-Star lineups", () => {
  /**
   * Players used to be grouped, and positioned, by NAME. Looking up "David
   * Johnson" found the tight end of that name, so the running back (2391) was
   * slotted at TE in twelve pairings' lineups, and Kenneth Walker the running
   * back at WR. Every slot must now hold a player whose own position — by id —
   * fits it.
   */
  it("puts every player in a slot his own position fits", () => {
    const fits = (slot: string, position: string) =>
      slot === "FLEX" ? ["RB", "WR", "TE"].includes(position) : slot === position;
    for (const a of managers) {
      for (const b of managers) {
        if (a.id >= b.id) continue;
        const data = getH2HData(a.id, b.id);
        if (!data) continue;
        for (const slot of [...data.managerALineup, ...data.managerBLineup]) {
          if (!slot.player) continue;
          const position = getPlayerPosition(slot.player.playerId);
          expect(
            fits(slot.position, position),
            `${a.id} v ${b.id}: ${slot.player.playerName} (${position}) at ${slot.position}`
          ).toBe(true);
        }
      }
    }
  });
});

import { getOptimalLineup, getPlayerRows } from "@/utils/lineupAnalysis";
import { getPlayerName } from "@/utils/playerDataUtils";
import { defineStat } from "./registry";
import type { Game, StatEntry } from "./types";

/**
 * Lineup records — what getOptimalLineup can already tell us (C2).
 *
 * These are the stats about managing rather than drafting: the points you had
 * on your roster and did not play. Each one is a filter and a map over
 * `context.games`, the flattened team-week list; none of them walks the seasons
 * itself.
 *
 * Every stat here reads `starters` / `playersPoints`, so every one of them sets
 * `requiresLineups`. 2019's team scores are correct but its per-player
 * breakdown was reconstructed from the gap between a lineup and its recorded
 * total (see `src/domain/dataQuality.ts`), and an inferred score must not be
 * allowed to win "worst start/sit in Chumbo history". The registry does the
 * excluding; the flag is what asks it to.
 */

const matchupHref = (game: Game) =>
  `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;

const managerHref = (managerId: string) => `/managers/${managerId}`;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The positions the seventh starting slot has always accepted. */
const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);

/**
 * Can a benched player legally take this starting slot? The lineup has been
 * QB / RB / RB / WR / WR / TE / FLEX / K / DEF in every season of the league,
 * so the answer is "same position, or a flex-eligible body in the flex slot".
 * `UNK` on either side means the player's position could not be resolved, and
 * a swap we cannot justify is a swap we do not claim.
 */
const canFillSlot = (benchPosition: string, slot: string) => {
  if (benchPosition === "UNK" || slot === "UNK") return false;
  if (slot === "FLEX") return FLEX_POSITIONS.has(benchPosition);
  return slot === benchPosition;
};

interface StartSit {
  benchName: string;
  benchPoints: number;
  starterName: string;
  starterPoints: number;
  /** How much the manager gave up by picking the wrong one. Always positive. */
  gap: number;
}

interface LineupRead {
  /**
   * False when this team-week cannot honestly be graded — see `readLineup`.
   * Every stat below skips these rather than ranking them.
   */
  usable: boolean;
  actual: number;
  optimal: number;
  /** `optimal - actual`, never negative (an unusable read reports zero). */
  benchPoints: number;
  worstStartSit: StartSit | null;
}

const UNUSABLE: LineupRead = {
  usable: false,
  actual: 0,
  optimal: 0,
  benchPoints: 0,
  worstStartSit: null,
};

/**
 * Grade one team-week: what they scored, what they could have scored, and the
 * single swap they most obviously missed.
 *
 * Two kinds of team-week are refused rather than graded:
 *
 *   1. Nothing was played. A week that has been fetched but not yet played
 *      scores zero for everybody; it is not a lineup decision.
 *   2. The "optimal" lineup came back *lower* than the lineup actually
 *      started, which is arithmetically impossible — the started lineup is one
 *      of the candidates. It happens when a player's position resolves to
 *      `UNK`, so the optimiser cannot place someone who really did start.
 *      A1d fixed most of these; the handful that remain are a gap in the player
 *      dictionary, not a manager who benched negative points, and ranking them
 *      would put a data artefact at the top of a league record.
 */
const gradeLineup = (game: Game): LineupRead => {
  const started = game.startersPoints.reduce((sum, points) => sum + points, 0);
  if (!game.players.length || game.points <= 0 || started <= 0) return UNUSABLE;

  const { optimalTotal } = getOptimalLineup(game.raw, game.year);
  const benchPoints = optimalTotal - game.points;
  if (benchPoints < -1e-9) return UNUSABLE;

  const { starters, bench } = getPlayerRows(game.raw, game.year);

  let worstStartSit: StartSit | null = null;
  for (const benched of bench) {
    for (const starter of starters) {
      if (!canFillSlot(benched.position, starter.position)) continue;
      const gap = benched.points - starter.points;
      if (gap <= 0) continue;
      if (!worstStartSit || gap > worstStartSit.gap) {
        worstStartSit = {
          benchName: benched.name,
          benchPoints: benched.points,
          starterName: starter.name,
          starterPoints: starter.points,
          gap,
        };
      }
    }
  }

  return {
    usable: true,
    actual: game.points,
    optimal: optimalTotal,
    benchPoints: Math.max(0, benchPoints),
    worstStartSit,
  };
};

/**
 * Four stats ask the same question of the same team-weeks, and
 * `getOptimalLineup` is not cheap. The flattened game list is itself memoised,
 * so game objects are stable identities and can key a cache.
 */
const graded = new WeakMap<Game, LineupRead>();

const readLineup = (game: Game): LineupRead => {
  const cached = graded.get(game);
  if (cached) return cached;
  const read = gradeLineup(game);
  graded.set(game, read);
  return read;
};

/** Only team-weeks with a named manager and a lineup we can grade. */
const gradable = (games: Game[]) =>
  games
    .filter((game) => game.managerId)
    .map((game) => ({ game, read: readLineup(game) }))
    .filter(({ read }) => read.usable);

const seasonLabel = (years: number[]) => {
  const sorted = [...years].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? `${first}` : `${first}–${last}`;
};

export const benchPointsAllTime = defineStat({
  id: "bench-points",
  label: "Points left on the bench",
  description:
    "Every point a manager had on their roster and did not start, added up across their whole career. The worst lineup-setter in Chumbo history is at the top of this list.",
  scope: "manager",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: ({ games }) => {
    const totals = new Map<
      string,
      { points: number; weeks: number; years: Set<number>; worst: Game | null; worstPoints: number }
    >();

    for (const { game, read } of gradable(games)) {
      const managerId = game.managerId as string;
      const entry = totals.get(managerId) ?? {
        points: 0,
        weeks: 0,
        years: new Set<number>(),
        worst: null,
        worstPoints: 0,
      };
      entry.points += read.benchPoints;
      entry.weeks += 1;
      entry.years.add(game.year);
      if (read.benchPoints > entry.worstPoints) {
        entry.worst = game;
        entry.worstPoints = read.benchPoints;
      }
      totals.set(managerId, entry);
    }

    return [...totals].map(([managerId, total]): StatEntry => {
      const perWeek = total.weeks ? total.points / total.weeks : 0;
      const worst = total.worst
        ? `; worst single week ${round1(total.worstPoints)} in ${total.worst.year} Week ${total.worst.week}`
        : "";
      return {
        value: round1(total.points),
        subject: managerId,
        href: managerHref(managerId),
        detail: `${round1(perWeek)} a week across ${total.weeks} games, ${seasonLabel([...total.years])}${worst}`,
      };
    });
  },
});

export const benchPointsSeason = defineStat({
  id: "bench-points-season",
  label: "Worst bench-warming season",
  description:
    "The most points anyone has left on the bench in a single season. One bad autumn of lineup decisions.",
  scope: "season",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: ({ games }) => {
    const totals = new Map<
      string,
      { managerId: string; year: number; points: number; weeks: number }
    >();

    for (const { game, read } of gradable(games)) {
      const managerId = game.managerId as string;
      const key = `${managerId}|${game.year}`;
      const entry = totals.get(key) ?? {
        managerId,
        year: game.year,
        points: 0,
        weeks: 0,
      };
      entry.points += read.benchPoints;
      entry.weeks += 1;
      totals.set(key, entry);
    }

    return [...totals.values()].map(
      (total): StatEntry => ({
        value: round1(total.points),
        subject: total.managerId,
        href: managerHref(total.managerId),
        detail: `${total.year} — ${round1(total.points / total.weeks)} a week over ${total.weeks} games`,
        year: total.year,
      })
    );
  },
});

/**
 * A manager with three graded weeks is not the league's best lineup-setter,
 * they are a small sample. One full season is the floor for appearing here.
 */
const MIN_GAMES_FOR_EFFICIENCY = 13;

export const managerEfficiency = defineStat({
  id: "manager-efficiency",
  label: "Manager efficiency",
  description:
    "The share of your best possible score you actually started, over a whole career. Drafting well is one skill; picking the right nine every Sunday is another, and this is the one that measures the second.",
  scope: "manager",
  format: "percent",
  direction: "high",
  requiresLineups: true,
  compute: ({ games }) => {
    const totals = new Map<
      string,
      { actual: number; optimal: number; weeks: number; years: Set<number> }
    >();

    for (const { game, read } of gradable(games)) {
      const managerId = game.managerId as string;
      const entry = totals.get(managerId) ?? {
        actual: 0,
        optimal: 0,
        weeks: 0,
        years: new Set<number>(),
      };
      entry.actual += read.actual;
      entry.optimal += read.optimal;
      entry.weeks += 1;
      entry.years.add(game.year);
      totals.set(managerId, entry);
    }

    return [...totals]
      .filter(
        ([, total]) =>
          total.weeks >= MIN_GAMES_FOR_EFFICIENCY && total.optimal > 0
      )
      .map(([managerId, total]): StatEntry => {
        const left = total.optimal - total.actual;
        return {
          value: round1((total.actual / total.optimal) * 100),
          subject: managerId,
          href: managerHref(managerId),
          detail: `${round1(total.actual)} started of ${round1(total.optimal)} available across ${total.weeks} games — ${round1(left)} left behind`,
        };
      });
  },
});

export const worstStartSit = defineStat({
  id: "worst-start-sit",
  label: "Worst start/sit call",
  description:
    "The single most expensive lineup decision ever made: the biggest gap between a player left on the bench and the starter he could have replaced.",
  scope: "league",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: ({ games }) =>
    gradable(games).flatMap(({ game, read }): StatEntry[] => {
      const swap = read.worstStartSit;
      if (!swap) return [];
      return [
        {
          value: round2(swap.gap),
          subject: game.managerId as string,
          href: matchupHref(game),
          detail: `${game.year} Week ${game.week}, benched ${swap.benchName} (${round2(swap.benchPoints)}) for ${swap.starterName} (${round2(swap.starterPoints)})`,
          year: game.year,
          week: game.week,
        },
      ];
    }),
});

export const benchBandit = defineStat({
  id: "bench-bandit",
  label: "The Bench Bandit",
  description:
    "The player who has scored the most points while sitting on somebody's bench. Largely a monument to the backup quarterback: nobody starts two, and the good ones pile up hundreds of points nobody ever collected.",
  scope: "player",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: ({ games }) => {
    const totals = new Map<
      string,
      {
        points: number;
        weeks: number;
        byManager: Map<string, number>;
        best: { points: number; year: number; week: number } | null;
      }
    >();

    for (const game of games) {
      // A week nobody has played yet benches everybody for nothing.
      if (game.points <= 0) continue;

      const starters = new Set(game.starters);
      for (const playerId of game.players) {
        if (starters.has(playerId)) continue;
        const points = game.playersPoints[playerId] ?? 0;
        if (points <= 0) continue;

        const entry = totals.get(playerId) ?? {
          points: 0,
          weeks: 0,
          byManager: new Map<string, number>(),
          best: null,
        };
        entry.points += points;
        entry.weeks += 1;
        if (game.managerId) {
          entry.byManager.set(
            game.managerId,
            (entry.byManager.get(game.managerId) ?? 0) + points
          );
        }
        if (!entry.best || points > entry.best.points) {
          entry.best = { points, year: game.year, week: game.week };
        }
        totals.set(playerId, entry);
      }
    }

    return [...totals].map(([playerId, total]): StatEntry => {
      const [culprit] = [...total.byManager].sort((a, b) => b[1] - a[1]);
      const blame = culprit
        ? `, mostly by ${culprit[0]} (${round1(culprit[1])})`
        : "";
      const best = total.best
        ? `; best ${round1(total.best.points)} in ${total.best.year} Week ${total.best.week}`
        : "";
      return {
        value: round1(total.points),
        subject: getPlayerName(playerId),
        href: `/players/${playerId}`,
        detail: `${total.weeks} weeks on a bench${blame}${best}`,
      };
    });
  },
});

export const lineupStats = [
  benchPointsAllTime,
  benchPointsSeason,
  managerEfficiency,
  worstStartSit,
  benchBandit,
];

import managers from "@/data/managers.json";
import { memoiseOverSeasons } from "@/utils/cache";
import { getStatContext } from "@/utils/stats/traverse";

/**
 * How each manager does in each week of the season: every week 1 they have
 * played, every week 2, and so on. The group chat's "ryan is 2–5 all time in
 * week 3", for everyone at once.
 *
 * Regular season only. A week number means the same thing in every regular
 * season, but the playoffs have started in week 14 and in week 15, so "week
 * 15" would be a semi-final one year and a quarter-final the next.
 *
 * Two measures, because they answer different questions. The RECORD is what
 * happened, but it depends on who the schedule put in front of you. Points
 * AGAINST THE LEAGUE — each score less the league's average that same week —
 * is the performance alone, and it is fair across eras: 110 in 2013 and 110 in
 * 2024 are not the same week.
 */

export interface WeekCell {
  week: number;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  /** Points per game in this week of the season. */
  average: number;
  /** Per game, above (+) or below (−) the league's average those same weeks. */
  vsLeague: number;
  /** Wins, with a tie as half. */
  winRate: number;
}

export interface ManagerWeeks {
  managerId: string;
  name: string;
  /** Played in the latest season — managers.json's own flag is not kept up. */
  active: boolean;
  /** Indexed by week number; a week never played is absent. */
  weeks: Map<number, WeekCell>;
}

/** Fewer games than this in a cell, and it is a coin toss: shown, but faded. */
export const MIN_WEEK_GAMES = 4;

const compute = (): { weeks: number[]; managers: ManagerWeeks[] } => {
  const games = getStatContext().games.filter((g) => g.isRegularSeason);

  const leagueAverage = new Map<string, number>();
  const byYearWeek = new Map<string, number[]>();
  for (const game of games) {
    const key = `${game.year}|${game.week}`;
    const list = byYearWeek.get(key);
    if (list) list.push(game.points);
    else byYearWeek.set(key, [game.points]);
  }
  for (const [key, points] of byYearWeek) {
    leagueAverage.set(key, points.reduce((a, b) => a + b, 0) / points.length);
  }

  type Tally = { wins: number; losses: number; ties: number; points: number; above: number; games: number };
  const tallies = new Map<string, Map<number, Tally>>();
  for (const game of games) {
    if (!game.managerId) continue;
    const mine = tallies.get(game.managerId) ?? new Map<number, Tally>();
    tallies.set(game.managerId, mine);
    const cell = mine.get(game.week) ?? { wins: 0, losses: 0, ties: 0, points: 0, above: 0, games: 0 };
    mine.set(game.week, cell);
    cell[game.result === "win" ? "wins" : game.result === "loss" ? "losses" : "ties"] += 1;
    cell.points += game.points;
    cell.above += game.points - (leagueAverage.get(`${game.year}|${game.week}`) ?? game.points);
    cell.games += 1;
  }

  const latest = Math.max(...games.map((g) => g.year));
  const playing = new Set(games.filter((g) => g.year === latest).map((g) => g.managerId));

  const allWeeks = new Set<number>();
  const result: ManagerWeeks[] = [];
  for (const manager of managers) {
    const mine = tallies.get(manager.id);
    if (!mine) continue;
    const weeks = new Map<number, WeekCell>();
    for (const [week, t] of mine) {
      allWeeks.add(week);
      weeks.set(week, {
        week,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        games: t.games,
        average: t.points / t.games,
        vsLeague: t.above / t.games,
        winRate: (t.wins + t.ties / 2) / t.games,
      });
    }
    result.push({
      managerId: manager.id,
      name: manager.name,
      active: playing.has(manager.id),
      weeks,
    });
  }

  return { weeks: [...allWeeks].sort((a, b) => a - b), managers: result };
};

export const getWeekByWeek = memoiseOverSeasons("weekByWeek", compute, 2);

/** A manager's best and worst week of the season, by record, among cells worth reading. */
export const bestAndWorstWeeks = (manager: ManagerWeeks) => {
  const cells = [...manager.weeks.values()].filter((c) => c.games >= MIN_WEEK_GAMES);
  if (cells.length < 2) return null;
  const byRate = [...cells].sort(
    (a, b) => b.winRate - a.winRate || b.vsLeague - a.vsLeague
  );
  return { best: byRate[0], worst: byRate[byRate.length - 1] };
};

export const recordText = (cell: Pick<WeekCell, "wins" | "losses" | "ties">) =>
  cell.ties ? `${cell.wins}–${cell.losses}–${cell.ties}` : `${cell.wins}–${cell.losses}`;

/** "+4.2", "−1.3", and "0.0" rather than a "−0.0" from rounding. */
export const signed = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
};

import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { buildRecordsWatch, type WatchCareer, type WatchTeam } from "@/utils/recordsWatch";
import { defineStat } from "./registry";
import { careerTotals, completeSeasonTotals } from "./matchupStats";
import type { Game, StatContext } from "./types";

/**
 * The records watch (J3), published the way everything else is: computed at
 * build time into `public/data/all-time.json`, so the rail that shows it
 * downloads 19 kB and works nothing out.
 *
 * It is a stat because the weekly update (J1) regenerates that file every time
 * it commits a week, which is exactly when the watch changes. It is NOT a
 * record — it ranks nothing that has happened — so `NOT_RECORDS` keeps it off
 * /records and out of the narrative engine, the same as `on-this-day`.
 *
 * The numbers come from the registry's own flattened games rather than from
 * `getManagerStats`, which in "regular" mode trusts Sleeper's roster totals
 * (see the note in `managerStats/seasonRecords.ts`). The two differ by a point
 * or two over a fifteen-season career, and the watch links straight to
 * `career-points`, so it has to be quoting the list it points at.
 */

const NAMES = new Map(managers.map((manager) => [manager.id, manager.name]));
const nameOf = (managerId: string) => NAMES.get(managerId) ?? managerId;

/**
 * The season being played: the last one with games that has not been settled.
 *
 * Settled means its final has a winner (`isSeasonSettled`), never that it has
 * brackets — J1 writes those the week the playoffs start, and a watch that
 * stopped there would go quiet for the three weeks people care most.
 */
const liveYear = (context: StatContext): number | undefined => {
  const played = new Set(context.games.map((game) => game.year));
  return [...context.years]
    .sort((a, b) => b - a)
    .find((year) => played.has(year) && !isSeasonSettled(seasons[year]));
};

/** How many regular-season games this season has, by its own settings. */
const regularSeasonGames = (year: number): number =>
  (seasons[year]?.league?.settings?.playoff_week_start ?? 15) - 1;

const liveTeams = (games: Game[], year: number): WatchTeam[] => {
  const byManager = new Map<string, WatchTeam>();
  for (const game of games) {
    if (game.year !== year || !game.isRegularSeason || !game.managerId) continue;
    const team = byManager.get(game.managerId) ?? {
      managerId: game.managerId,
      played: 0,
      points: 0,
    };
    team.played += 1;
    team.points = Math.round((team.points + game.points) * 100) / 100;
    byManager.set(game.managerId, team);
  }
  return [...byManager.values()];
};

const careers = (games: Game[]): WatchCareer[] =>
  [...careerTotals(games)].map(([managerId, career]) => ({
    managerId,
    wins: career.wins,
    points: career.points,
    perGame: career.played ? career.points / career.played : 0,
  }));

/** The most points anyone has scored in a finished regular season. */
const seasonRecord = (games: Game[]) => {
  const best = completeSeasonTotals(games).reduce<
    ReturnType<typeof completeSeasonTotals>[number] | undefined
  >((top, team) => (!top || team.points > top.points ? team : top), undefined);
  return best?.managerId
    ? {
        value: best.points,
        managerId: best.managerId,
        year: best.year,
        games: best.played,
      }
    : undefined;
};

/**
 * Current runs, and the longest there has ever been.
 *
 * Counted straight through the playoffs and on into the next season, which is
 * what `longest-win-streak` means by a streak — the watch links to that list,
 * so it counts the same way.
 */
const streaks = (games: Game[]) => {
  const byManager = new Map<string, Game[]>();
  for (const game of games) {
    if (!game.managerId) continue;
    const played = byManager.get(game.managerId);
    if (played) played.push(game);
    else byManager.set(game.managerId, [game]);
  }

  const current = new Map<string, { kind: "win" | "loss"; count: number }>();
  const longest = {
    win: { count: 0, managerId: "" },
    loss: { count: 0, managerId: "" },
  };

  for (const [managerId, played] of byManager) {
    const order = [...played].sort((a, b) => a.year - b.year || a.week - b.week);
    let run: { kind: Game["result"]; count: number } = { kind: "tie", count: 0 };
    for (const game of order) {
      run =
        game.result === run.kind
          ? { kind: run.kind, count: run.count + 1 }
          : { kind: game.result, count: 1 };
      if (run.kind !== "tie" && run.count > longest[run.kind].count) {
        longest[run.kind] = { count: run.count, managerId };
      }
    }
    if (run.kind !== "tie") current.set(managerId, { kind: run.kind, count: run.count });
  }

  return { current, longest };
};

export const recordsWatch = defineStat({
  id: "records-watch",
  label: "The records watch",
  description:
    "What this season could still do: who is on pace for a season record, whose run is nearly the longest the league has seen, and who is a win or a week from a round number. Paces are straight-line arithmetic over the games that are left, and nothing appears before a team has played four.",
  scope: "league",
  format: "count",
  direction: "high",
  compute: (context) => {
    const year = liveYear(context);
    if (!year) return [];

    const items = buildRecordsWatch({
      games: regularSeasonGames(year),
      teams: liveTeams(context.games, year),
      seasonRecord: seasonRecord(context.games),
      careers: careers(context.games),
      streaks: streaks(context.games),
      nameOf,
    });

    return items.map((item) => ({
      // Rounded to whole percent: the file is committed, and a float here
      // would rewrite every entry on every run for no visible difference.
      value: Math.round(item.urgency * 100),
      subject: item.managerId,
      href: item.href,
      detail: item.text,
      year,
    }));
  },
});

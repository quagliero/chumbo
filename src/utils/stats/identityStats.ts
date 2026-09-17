import { seasons } from "@/data";
import { defineStat } from "./registry";
import type { Game, StatContext, StatDefinition, StatEntry } from "./types";

/**
 * Derived identity and fun (C6).
 *
 * Follows the pattern in `matchupStats.ts`: each stat filters and maps
 * `context.games` — the flattened team-week list — and never walks the seasons
 * itself. The one thing the flattened list cannot answer is who actually won a
 * title (that lives in the winners bracket), so `championships()` reads the
 * fifteen bracket files directly. It is a fifteen-entry lookup, not a
 * traversal.
 *
 * These three are the "come back and share a nugget" stats, so the `detail`
 * string carries the whole story and every claim is a number you could check.
 */

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Points, as the site shows them. */
const points = (value: number): string => value.toFixed(2);

/** A whole percentage, for win rates. */
const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

const managerHref = (managerId: string): string => `/managers/${managerId}`;

/** 1st, 2nd, 3rd — for ranks and finishing positions. */
const ordinal = (n: number): string => {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const matchupHref = (game: Game): string =>
  `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;

/** A manager id, or something readable when the owner is unknown. */
const named = (managerId: string | null, rosterId: number): string =>
  managerId ?? `roster ${rosterId}`;

/**
 * Whether a game was actually played.
 *
 * An in-progress season can carry matchup rows for weeks that have not
 * happened, and both halves read 0.00. Those are not games and must never
 * reach a record, a record's denominator, or "on this day".
 */
const wasPlayed = (game: Game): boolean =>
  game.points > 0 || game.opponentPoints > 0;

const meanOf = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Population standard deviation — this is the whole career, not a sample. */
const stdevOf = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((v) => (v - mean) ** 2)));
};

/** Group a list by a derived key, preserving insertion order. */
const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = grouped.get(k);
    if (bucket) bucket.push(item);
    else grouped.set(k, [item]);
  }
  return grouped;
};

/* ------------------------------------------------------------------ *
 * Titles — the one thing the game list does not know
 * ------------------------------------------------------------------ */

interface Title {
  year: number;
  championRosterId: number;
  runnerUpRosterId: number;
  /** How many teams made the playoffs that year. 4 early on, 6 since. */
  playoffTeams: number;
}

const championships = (): Title[] => {
  const titles: Title[] = [];

  for (const [key, season] of Object.entries(seasons)) {
    const year = Number(key);
    if (!Number.isFinite(year)) continue;

    // `p: 1` is the game for the trophy. A season in progress has no bracket.
    const final = season?.winners_bracket?.find((match) => match.p === 1);
    if (!final?.w) continue;

    titles.push({
      year,
      championRosterId: final.w,
      runnerUpRosterId: final.l,
      playoffTeams: season.league?.settings?.playoff_teams || 6,
    });
  }

  return titles.sort((a, b) => a.year - b.year);
};

/* ------------------------------------------------------------------ *
 * C6c — On this day in Chumbo history
 * ------------------------------------------------------------------ */

export interface SeasonPoint {
  year: number;
  week: number;
}

/**
 * Where the league is right now, read off the data rather than the clock.
 *
 * The latest season with a played game, and the latest week of it that has
 * been played. Nothing here looks at `Date`: the almanac is a static build, so
 * "now" has to mean "the last thing that happened".
 */
export const latestPlayedWeek = (games: Game[]): SeasonPoint | null => {
  let year = -Infinity;
  let week = -Infinity;

  for (const game of games) {
    if (!wasPlayed(game)) continue;
    if (game.year > year) {
      year = game.year;
      week = game.week;
    } else if (game.year === year && game.week > week) {
      week = game.week;
    }
  }

  return Number.isFinite(year) ? { year, week } : null;
};

/** Win-loss-tie records going into a given week, keyed `year|rosterId`. */
const recordsEnteringWeek = (
  games: Game[],
  week: number
): Map<string, string> => {
  const tally = new Map<string, [number, number, number]>();

  for (const game of games) {
    if (!wasPlayed(game) || !game.isRegularSeason || game.week >= week) continue;
    const key = `${game.year}|${game.rosterId}`;
    const record = tally.get(key) ?? [0, 0, 0];
    if (game.result === "win") record[0] += 1;
    else if (game.result === "loss") record[1] += 1;
    else record[2] += 1;
    tally.set(key, record);
  }

  return new Map(
    [...tally].map(([key, [wins, losses, ties]]) => [
      key,
      ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
    ])
  );
};

/**
 * What, if anything, was riding on this game — the line that turns a score
 * into a story. First match wins, most consequential first.
 */
const stakesFor = (
  game: Game,
  titles: Title[],
  weekBest: { combined: number; closest: number; widest: number }
): string | null => {
  const title = titles.find((t) => t.year === game.year);
  const inTitleGame =
    title &&
    game.isPlayoff &&
    ((game.rosterId === title.championRosterId &&
      game.opponentRosterId === title.runnerUpRosterId) ||
      (game.rosterId === title.runnerUpRosterId &&
        game.opponentRosterId === title.championRosterId));

  if (inTitleGame) return `the ${game.year} title game`;
  if (game.isPlayoff) return "a playoff game";

  const combined = game.points + game.opponentPoints;
  const gap = Math.abs(game.margin);

  if (combined === weekBest.combined) {
    return `the highest-scoring game of the week, ${points(combined)} between them`;
  }
  if (gap === weekBest.closest && gap < 5) {
    return `the closest game of the week, by ${points(gap)}`;
  }
  if (gap === weekBest.widest && gap >= 40) {
    return `the heaviest beating of the week, by ${points(gap)}`;
  }
  return null;
};

const onThisDayEntries = ({ games }: StatContext): StatEntry[] => {
  const now = latestPlayedWeek(games);
  if (!now) return [];

  // The same week, in seasons that have already finished with it. Strictly
  // earlier years, so nothing from the future — or from this week's own
  // still-unfolding results — can appear.
  const sameWeek = games.filter(
    (game) => wasPlayed(game) && game.week === now.week && game.year < now.year
  );

  // Each game is in the list twice. Keep the winner's half, so the subject is
  // the manager the entry is about; on a tie keep the lower roster id. The
  // loudest game of each season goes first: entries share a value (the year),
  // and the registry's sort is stable, so this ordering survives ranking.
  const oneSide = sameWeek
    .filter(
      (game) =>
        game.result === "win" ||
        (game.result === "tie" && game.rosterId < game.opponentRosterId)
    )
    .sort(
      (a, b) =>
        b.points + b.opponentPoints - (a.points + a.opponentPoints) ||
        a.matchupId - b.matchupId
    );

  const records = recordsEnteringWeek(games, now.week);
  const titles = championships();

  // "Best of the week" is per season, since every entry shares a week number.
  const bestByYear = new Map(
    [...groupBy(oneSide, (game) => String(game.year))].map(([year, yearly]) => [
      year,
      {
        combined: Math.max(...yearly.map((g) => g.points + g.opponentPoints)),
        closest: Math.min(...yearly.map((g) => Math.abs(g.margin))),
        widest: Math.max(...yearly.map((g) => Math.abs(g.margin))),
      },
    ])
  );

  return oneSide.map((game): StatEntry => {
    const winner = named(game.managerId, game.rosterId);
    const loser = named(game.opponentManagerId, game.opponentRosterId);
    const verb = game.result === "tie" ? "tied" : "beat";

    const winnerRecord = records.get(`${game.year}|${game.rosterId}`);
    const loserRecord = records.get(`${game.year}|${game.opponentRosterId}`);
    const form =
      now.week > 1 && winnerRecord && loserRecord
        ? ` (${winner} ${winnerRecord}, ${loser} ${loserRecord} going in)`
        : "";

    const stakes = stakesFor(
      game,
      titles,
      bestByYear.get(String(game.year)) ?? {
        combined: -1,
        closest: -1,
        widest: -1,
      }
    );

    return {
      value: game.year,
      subject: winner,
      href: matchupHref(game),
      detail:
        `${game.year} · ${winner} ${verb} ${loser}, ` +
        `${points(game.points)}–${points(game.opponentPoints)}` +
        `${form}${stakes ? ` — ${stakes}` : ""}`,
      year: game.year,
      week: game.week,
    };
  });
};

export const onThisDay = defineStat({
  id: "on-this-day",
  label: "On this day in Chumbo history",
  description:
    "The same week of the season, in every year before this one. The week " +
    "is read off the latest result in the data, so this moves on by itself " +
    "as the season does.",
  scope: "league",
  format: "count",
  direction: "high",
  compute: onThisDayEntries,
});

/* ------------------------------------------------------------------ *
 * C6a — Manager archetypes
 * ------------------------------------------------------------------ */

interface Profile {
  managerId: string;
  played: number;
  /** Losses by under five points. */
  narrowLosses: number;
  /** Wins by under five points. */
  narrowWins: number;
  /** Population standard deviation of the weekly score. */
  swing: number;
  avgPoints: number;
  /** Games in the bottom tenth of every score the league has ever posted. */
  lowScores: number;
  /** Weeks as the highest scorer in the league, and beaten anyway. */
  cursedWeeks: number;
  avgWinMargin: number;
  avgLossMargin: number;
  /** Share of the whole league their regular-season scores would have beaten. */
  allPlayRate: number;
  /** Real win rate minus that share. Positive means the schedule was kind. */
  luck: number;
  regularWinRate: number;
  /**
   * REGULAR-SEASON record, to match `regularWinRate`.
   *
   * It has to be the same set of games as the rate it is quoted beside, or the
   * prose fails its own arithmetic: the first version printed an all-games
   * record (108-101) next to a regular-season rate (50.0%), and 108/209 is not
   * 50%.
   */
  record: { wins: number; losses: number; ties: number };
  playoffWinRate: number | null;
  earlyWinRate: number | null;
  lateWinRate: number | null;
  best: { score: number; year: number; week: number } | null;
}

/** Fewer games than this and any of these measures is noise. */
const MIN_GAMES = 40;

/** Playoff form needs a sample before it means anything. */
const MIN_PLAYOFF_GAMES = 6;

/** Each half of the season needs its own sample for the fade measure. */
const MIN_SPLIT_GAMES = 12;

const winRate = (list: Game[]): number => {
  if (!list.length) return 0;
  const wins = list.filter((g) => g.result === "win").length;
  const ties = list.filter((g) => g.result === "tie").length;
  return (wins + ties / 2) / list.length;
};

/**
 * The share of the whole league a manager's scores actually beat, week by
 * week — the all-play record. Compared against their real win rate it
 * separates the good teams from the well-scheduled ones.
 */
const allPlayRates = (games: Game[]): Map<string, number> => {
  const beaten = new Map<string, number>();
  const faced = new Map<string, number>();

  for (const [, week] of groupBy(games, (g) => `${g.year}|${g.week}`)) {
    // Each team appears once per week already, but de-duplicate on roster id
    // so a double-header in the data cannot count anyone twice.
    const board = [...new Map(week.map((g) => [g.rosterId, g])).values()];
    if (board.length < 2) continue;

    for (const team of board) {
      if (!team.managerId) continue;
      const others = board.filter((o) => o.rosterId !== team.rosterId);
      const better = others.filter((o) => o.points < team.points).length;
      const level = others.filter((o) => o.points === team.points).length;
      beaten.set(
        team.managerId,
        (beaten.get(team.managerId) ?? 0) + better + level / 2
      );
      faced.set(team.managerId, (faced.get(team.managerId) ?? 0) + others.length);
    }
  }

  return new Map(
    [...beaten].map(([managerId, total]) => [
      managerId,
      total / (faced.get(managerId) || 1),
    ])
  );
};

/** One row per manager with enough history to be judged. */
export const buildProfiles = (games: Game[]): Profile[] => {
  const real = games.filter((game) => wasPlayed(game) && game.managerId);
  // Measured on the regular season, the same games as `regularWinRate`, so the
  // two halves of the luck sentence are comparable.
  const allPlay = allPlayRates(real.filter((game) => game.isRegularSeason));

  // The weeks a manager out-scored the entire league and still lost.
  const cursed = new Map<string, number>();
  for (const [, week] of groupBy(real, (g) => `${g.year}|${g.week}`)) {
    const board = [...new Map(week.map((g) => [g.rosterId, g])).values()];
    if (board.length < 4) continue;
    const top = Math.max(...board.map((g) => g.points));
    const leaders = board.filter((g) => g.points === top);
    if (leaders.length !== 1) continue;
    const [leader] = leaders;
    if (leader.result === "loss" && leader.managerId) {
      cursed.set(leader.managerId, (cursed.get(leader.managerId) ?? 0) + 1);
    }
  }

  // The line below which a score is simply an embarrassment: the tenth
  // percentile of every score in league history.
  const allScores = real.map((game) => game.points).sort((a, b) => a - b);
  const trapdoor = allScores[Math.floor(allScores.length * 0.1)] ?? 0;

  const profiles: Profile[] = [];

  for (const [managerId, played] of groupBy(real, (g) => g.managerId ?? "")) {
    if (!managerId || played.length < MIN_GAMES) continue;

    const wins = played.filter((g) => g.result === "win");
    const losses = played.filter((g) => g.result === "loss");
    const regular = played.filter((g) => g.isRegularSeason);
    const playoff = played.filter((g) => g.isPlayoff);
    const early = regular.filter((g) => g.week <= 6);
    const late = regular.filter((g) => g.week >= 9);
    const best = played.reduce<Game | null>(
      (top, game) => (!top || game.points > top.points ? game : top),
      null
    );

    const allPlayRate = allPlay.get(managerId) ?? 0;

    profiles.push({
      managerId,
      played: played.length,
      record: {
        wins: regular.filter((g) => g.result === "win").length,
        losses: regular.filter((g) => g.result === "loss").length,
        ties: regular.filter((g) => g.result === "tie").length,
      },
      narrowLosses: losses.filter((g) => Math.abs(g.margin) < 5).length,
      narrowWins: wins.filter((g) => g.margin < 5).length,
      swing: stdevOf(played.map((g) => g.points)),
      avgPoints: meanOf(played.map((g) => g.points)),
      lowScores: played.filter((g) => g.points <= trapdoor).length,
      cursedWeeks: cursed.get(managerId) ?? 0,
      avgWinMargin: meanOf(wins.map((g) => g.margin)),
      avgLossMargin: meanOf(losses.map((g) => Math.abs(g.margin))),
      allPlayRate,
      luck: winRate(regular) - allPlayRate,
      regularWinRate: winRate(regular),
      playoffWinRate:
        playoff.length >= MIN_PLAYOFF_GAMES ? winRate(playoff) : null,
      earlyWinRate: early.length >= MIN_SPLIT_GAMES ? winRate(early) : null,
      lateWinRate: late.length >= MIN_SPLIT_GAMES ? winRate(late) : null,
      best: best ? { score: best.points, year: best.year, week: best.week } : null,
    });
  }

  return profiles.sort((a, b) => a.managerId.localeCompare(b.managerId));
};

export interface Archetype {
  key: string;
  label: string;
  /** Bigger means more of this. `null` when the manager cannot be judged. */
  measure: (profile: Profile) => number | null;
  /** The measure as it reads in prose. The evidence must contain this. */
  show: (value: number) => string;
  /**
   * The fact the label rests on. `shown` is `show(measure)` and must appear in
   * it, because the number is the whole point — a label without one is a
   * horoscope.
   */
  evidence: (profile: Profile, shown: string) => string;
  /** What being top of this measure is called: "most", "widest", "highest". */
  lead: string;
  /** The unkind bit. Appended after the evidence and the ranking. */
  quip?: string;
}

const splitGap = (profile: Profile): number | null =>
  profile.earlyWinRate === null || profile.lateWinRate === null
    ? null
    : (profile.earlyWinRate - profile.lateWinRate) * 100;

const playoffGap = (profile: Profile): number | null =>
  profile.playoffWinRate === null
    ? null
    : (profile.playoffWinRate - profile.regularWinRate) * 100;

/**
 * The labels, and the measure each one is earned on.
 *
 * Pairs are deliberate — the Rollercoaster has a Metronome, the Bully a
 * Punchbag — so both ends of every distribution get a name and no measure
 * quietly only ever flatters. No `evidence` claims a superlative: assignment
 * is greedy, so the manager wearing a label is not always the one top of its
 * measure, and the ranking is printed separately from the real position.
 */
export const ARCHETYPES: Archetype[] = [
  {
    key: "heartbreaker",
    label: "The Heartbreaker",
    measure: (p) => p.narrowLosses,
    show: (v) => String(Math.round(v)),
    evidence: (_p, shown) => `${shown} losses by under five points`,
    lead: "most in the league",
  },
  {
    key: "burglar",
    label: "The Cat Burglar",
    measure: (p) => p.narrowWins,
    show: (v) => String(Math.round(v)),
    evidence: (_p, shown) => `${shown} wins by under five points`,
    lead: "most in the league",
    quip: "wins nothing by a distance and everything by a whisker",
  },
  {
    key: "rollercoaster",
    label: "The Rollercoaster",
    measure: (p) => p.swing,
    show: (v) => v.toFixed(1),
    evidence: (_p, shown) => `scores swing by ±${shown} points week to week`,
    lead: "the widest in the league",
    quip: "nobody, himself included, knows which team turns up",
  },
  {
    key: "metronome",
    label: "The Metronome",
    measure: (p) => -p.swing,
    show: (v) => Math.abs(v).toFixed(1),
    evidence: (_p, shown) => `scores swing by only ±${shown} points week to week`,
    lead: "the narrowest in the league",
    quip: "the same thing, every Sunday, forever",
  },
  {
    key: "cursed",
    label: "The Cursed",
    measure: (p) => p.cursedWeeks,
    show: (v) => String(Math.round(v)),
    evidence: (_p, shown) =>
      `${shown} weeks as the highest scorer in the entire league, and lost`,
    lead: "most in the league",
  },
  {
    key: "bully",
    label: "The Bully",
    measure: (p) => p.avgWinMargin,
    show: (v) => v.toFixed(1),
    evidence: (_p, shown) => `wins by ${shown} points on average`,
    lead: "the largest in the league",
    quip: "does not so much win as make a point",
  },
  {
    key: "punchbag",
    label: "The Punchbag",
    measure: (p) => p.avgLossMargin,
    show: (v) => v.toFixed(1),
    evidence: (_p, shown) => `loses by ${shown} points on average`,
    lead: "the largest in the league",
    quip: "which is not losing so much as being disposed of",
  },
  {
    key: "fraud",
    label: "The Fraud",
    measure: (p) => p.luck * 100,
    show: (v) => v.toFixed(1),
    evidence: (p, shown) =>
      `wins ${percent(p.regularWinRate)} of his regular-season games on scores ` +
      `that beat only ${percent(p.allPlayRate)} of the league — ${shown} ` +
      `percentage points of pure fixture luck`,
    lead: "the biggest gift in the league",
  },
  {
    key: "nearlyman",
    label: "The Nearly Man",
    measure: (p) => -p.luck * 100,
    show: (v) => Math.abs(v).toFixed(1),
    evidence: (p, shown) =>
      `his scores beat ${percent(p.allPlayRate)} of the league but he wins only ` +
      `${percent(p.regularWinRate)} of his regular-season games — ${shown} ` +
      `percentage points handed back by the schedule`,
    lead: "the worst robbery in the league",
  },
  {
    key: "biggame",
    label: "The Big-Game Hunter",
    measure: playoffGap,
    show: (v) => v.toFixed(0),
    evidence: (p, shown) =>
      `${percent(p.playoffWinRate ?? 0)} in the playoffs against ` +
      `${percent(p.regularWinRate)} in the regular season — ${shown} percentage ` +
      `points better once it matters`,
    lead: "the biggest step up in the league",
  },
  {
    key: "choker",
    label: "The Choker",
    measure: (p) => {
      const gap = playoffGap(p);
      return gap === null ? null : -gap;
    },
    show: (v) => Math.abs(v).toFixed(0),
    evidence: (p, shown) =>
      `${percent(p.regularWinRate)} in the regular season, ` +
      `${percent(p.playoffWinRate ?? 0)} once the playoffs start — ${shown} ` +
      `percentage points worse when it matters`,
    lead: "the biggest drop in the league",
  },
  {
    /**
     * Added because htc led nothing.
     *
     * Every other label is an extreme, and a manager who is not extreme at
     * anything ends up with somebody else's label at rank 2 — "The Firework,
     * 2nd of 14" is a runner-up rosette, not a character. Being relentlessly,
     * immovably average across fifteen years IS a character, and it is the one
     * thing the middle of the table is unmatched at.
     *
     * Purely distance from .500, gated by MIN_GAMES. Weighting it by games
     * played was the first attempt and it handed the label to rich on 46.8%,
     * because 221 games outweighed being nowhere near a coin toss — the
     * qualifying threshold belongs in the filter, not in the score.
     */
    key: "coin-flip",
    label: "The Coin Flip",
    measure: (p) =>
      p.played < MIN_GAMES ? null : -Math.abs(p.regularWinRate - 0.5),
    show: (v) => `${(Math.abs(v) * 100).toFixed(1)} points`,
    evidence: (p) =>
      `${p.record.wins}-${p.record.losses}` +
      (p.record.ties ? `-${p.record.ties}` : "") +
      ` across ${p.record.wins + p.record.losses + p.record.ties} regular-season games, a win rate of ${(p.regularWinRate * 100).toFixed(1)}%`,
    lead: "the closest anyone has come to a coin toss over a whole career",
    quip: "fifteen years of being exactly as good as everybody else",
  },
  {
    key: "firework",
    label: "The Firework",
    measure: (p) => p.best?.score ?? null,
    show: (v) => points(v),
    evidence: (p, shown) =>
      `a career-best ${shown} in ${p.best?.year} Week ${p.best?.week}`,
    lead: "the highest score any of these managers has posted",
    quip: "and has been telling everyone about it ever since",
  },
  {
    key: "machine",
    label: "The Machine",
    measure: (p) => p.avgPoints,
    show: (v) => v.toFixed(1),
    evidence: (_p, shown) => `${shown} points a week across a whole career`,
    lead: "the highest average in the league",
  },
  {
    key: "anchor",
    label: "The Anchor",
    measure: (p) => -p.avgPoints,
    show: (v) => Math.abs(v).toFixed(1),
    evidence: (_p, shown) => `${shown} points a week across a whole career`,
    lead: "the lowest average in the league",
    quip: "a fixture everyone else pencils in as a win",
  },
  {
    key: "trapdoor",
    label: "The Trapdoor",
    measure: (p) => p.lowScores,
    show: (v) => String(Math.round(v)),
    evidence: (_p, shown) =>
      `${shown} weeks spent in the bottom tenth of every score this league has ` +
      `ever posted`,
    lead: "most in the league",
  },
  {
    key: "ironman",
    label: "The Iron Man",
    measure: (p) => p.played,
    show: (v) => String(Math.round(v)),
    evidence: (_p, shown) => `${shown} games played`,
    lead: "more than anyone else",
    quip: "has outlasted managers, teams and at least one league format",
  },
  {
    key: "september",
    label: "The September Hero",
    measure: splitGap,
    show: (v) => v.toFixed(0),
    evidence: (p, shown) =>
      `${percent(p.earlyWinRate ?? 0)} through Week 6, ` +
      `${percent(p.lateWinRate ?? 0)} from Week 9 — a fade of ${shown} ` +
      `percentage points`,
    lead: "the steepest fade in the league",
  },
  {
    key: "closer",
    label: "The Closer",
    measure: (p) => {
      const gap = splitGap(p);
      return gap === null ? null : -gap;
    },
    show: (v) => Math.abs(v).toFixed(0),
    evidence: (p, shown) =>
      `${percent(p.earlyWinRate ?? 0)} through Week 6, ` +
      `${percent(p.lateWinRate ?? 0)} from Week 9 — a surge of ${shown} ` +
      `percentage points`,
    lead: "the steepest surge in the league",
  },
];

export interface Assignment {
  profile: Profile;
  archetype: Archetype;
  /** The raw measure the label was chosen on. */
  raw: number;
  /** Where that number places among the managers who qualify. 1 is the top. */
  rank: number;
  /** How many managers had a number on that measure at all. */
  outOf: number;
  /** Standard deviations above the league average on that measure. */
  z: number;
}

/**
 * Give every manager the label they fit most extremely.
 *
 * Measures are in different units — counts, points, percentages — so they are
 * compared as z-scores across the qualifying managers. Pairs are then taken
 * greedily, strongest fit first, and each label is claimed once, so the league
 * gets eighteen different insults rather than four people who are all The
 * Rollercoaster.
 *
 * The greedy pass means the manager wearing a label is not always the one top
 * of its measure — whoever fit something else even more strongly got there
 * first — so each assignment carries its real rank and the entry prints that
 * rather than assuming a superlative.
 */
export const assignArchetypes = (games: Game[]): Assignment[] => {
  const profiles = buildProfiles(games);
  if (!profiles.length) return [];

  const pairs: Assignment[] = [];

  for (const archetype of ARCHETYPES) {
    const scored = profiles
      .map((profile) => ({ profile, raw: archetype.measure(profile) }))
      .filter((row): row is { profile: Profile; raw: number } => row.raw !== null)
      .sort((a, b) => b.raw - a.raw || a.profile.managerId.localeCompare(b.profile.managerId));

    if (scored.length < 3) continue;

    const values = scored.map((row) => row.raw);
    const mean = meanOf(values);
    const spread = stdevOf(values);

    scored.forEach((row, index) => {
      pairs.push({
        profile: row.profile,
        archetype,
        raw: row.raw,
        // Equal numbers share the better rank — a tie for most narrow losses
        // is two managers who are both "most in the league".
        rank: scored.findIndex((other) => other.raw === row.raw) + 1 || index + 1,
        outOf: scored.length,
        z: spread === 0 ? 0 : (row.raw - mean) / spread,
      });
    });
  }

  // Labels somebody actually leads go out first, strongest fit first. Without
  // this the greedy hands "The Iron Man" to the fourth-most durable manager
  // just because the top three fitted something else even better.
  pairs.sort(
    (a, b) =>
      Number(b.rank === 1) - Number(a.rank === 1) ||
      b.z - a.z ||
      a.profile.managerId.localeCompare(b.profile.managerId) ||
      a.archetype.key.localeCompare(b.archetype.key)
  );

  const taken = new Set<string>();
  const labelled = new Map<string, Assignment>();

  // Pass one: strongest fits first, each label claimed once.
  for (const pair of pairs) {
    if (pair.z <= 0) continue;
    if (labelled.has(pair.profile.managerId)) continue;
    if (taken.has(pair.archetype.key)) continue;
    labelled.set(pair.profile.managerId, pair);
    taken.add(pair.archetype.key);
  }

  // Pass two: anyone left takes the best label still on the shelf. Still only
  // above-average fits — "The Cursed, 0 weeks cursed" is worse than no label.
  for (const pair of pairs) {
    if (pair.z <= 0) continue;
    if (labelled.has(pair.profile.managerId)) continue;
    if (taken.has(pair.archetype.key)) continue;
    labelled.set(pair.profile.managerId, pair);
    taken.add(pair.archetype.key);
  }

  // Pass three: if the labels ran out, the last few share one. `pairs` is in
  // descending order, so this is still that manager's own strongest fit.
  for (const pair of pairs) {
    if (pair.z <= 0) continue;
    if (labelled.has(pair.profile.managerId)) continue;
    labelled.set(pair.profile.managerId, pair);
  }

  return [...labelled.values()];
};

export const managerArchetypes = defineStat({
  id: "manager-archetypes",
  label: "Manager archetypes",
  description:
    "What fifteen years of results say about each manager, in one phrase. " +
    "Every label is the measure that manager is furthest from the league " +
    "average on — narrow losses, how far their scores swing, how much the " +
    "schedule has flattered them — and the number behind it is in the line. " +
    "Managers with fewer than 40 games are left out.",
  scope: "manager",
  format: "count",
  direction: "high",
  compute: ({ games }) =>
    assignArchetypes(games).map((assignment): StatEntry => {
      const { archetype, profile, rank, outOf } = assignment;
      const shown = archetype.show(assignment.raw);
      const standing =
        rank === 1 ? archetype.lead : `${ordinal(rank)} of ${outOf} in the league`;

      return {
        value: round(assignment.z),
        subject: profile.managerId,
        href: managerHref(profile.managerId),
        detail:
          `${archetype.label} — ${archetype.evidence(profile, shown)}, ` +
          `${standing}${archetype.quip ? ` — ${archetype.quip}` : ""}`,
      };
    }),
});

/* ------------------------------------------------------------------ *
 * C6b — Championship inevitability
 * ------------------------------------------------------------------ */

interface Standing {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

const byRecord = (a: Standing, b: Standing): number =>
  b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor;

const asRecord = (standing: Standing): string =>
  standing.ties
    ? `${standing.wins}-${standing.losses}-${standing.ties}`
    : `${standing.wins}-${standing.losses}`;

/**
 * The half of the playoff field that is genuinely in contention — the top
 * three of six seeds, or the top two of four in the early years.
 */
const contenderCutoff = (playoffTeams: number): number =>
  Math.max(2, Math.ceil(playoffTeams / 2));

const inevitabilityEntries = ({ games }: StatContext): StatEntry[] =>
  championships().flatMap((title): StatEntry[] => {
    const season = games.filter((g) => g.year === title.year && wasPlayed(g));
    const regular = season.filter((g) => g.isRegularSeason);
    if (!regular.length) return [];

    const champion = season.find((g) => g.rosterId === title.championRosterId);
    const subject = named(champion?.managerId ?? null, title.championRosterId);
    const cutoff = contenderCutoff(title.playoffTeams);

    // Walk the regular season once, ranking after each week.
    const weeks = [...new Set(regular.map((g) => g.week))].sort((a, b) => a - b);
    const table = new Map<number, Standing>();
    const ranks: number[] = [];
    let final: Standing | undefined;

    for (const week of weeks) {
      for (const game of regular.filter((g) => g.week === week)) {
        const row = table.get(game.rosterId) ?? {
          rosterId: game.rosterId,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
        };
        if (game.result === "win") row.wins += 1;
        else if (game.result === "loss") row.losses += 1;
        else row.ties += 1;
        row.pointsFor += game.points;
        table.set(game.rosterId, row);
      }

      const ordered = [...table.values()].sort(byRecord);
      ranks.push(
        ordered.findIndex((row) => row.rosterId === title.championRosterId) + 1
      );
      final = table.get(title.championRosterId);
    }

    // The earliest week from which they never fell back out of the top group.
    let fromIndex = weeks.length;
    for (let i = weeks.length - 1; i >= 0; i -= 1) {
      if (ranks[i] >= 1 && ranks[i] <= cutoff) fromIndex = i;
      else break;
    }

    const titleGame = season
      .filter(
        (g) =>
          g.isPlayoff &&
          g.rosterId === title.championRosterId &&
          g.opponentRosterId === title.runnerUpRosterId &&
          g.result === "win"
      )
      .sort((a, b) => b.week - a.week)[0];

    const lastWeek = weeks[weeks.length - 1];
    const finishedAt = ranks[ranks.length - 1];
    const record = final ? asRecord(final) : "";
    const byline = titleGame
      ? ` by ${points(Math.abs(titleGame.margin))} against ` +
        `${named(titleGame.opponentManagerId, title.runnerUpRosterId)}`
      : "";

    if (fromIndex === weeks.length) {
      // Never settled: they were outside the contenders at the final whistle.
      return [
        {
          value: titleGame?.week ?? lastWeek + 1,
          subject,
          href: titleGame ? matchupHref(titleGame) : `/seasons/${title.year}/standings`,
          detail:
            `${title.year} · never — ${subject} was outside the top ${cutoff} right ` +
            `to the end of Week ${lastWeek}, finished ${ordinal(finishedAt)} at ` +
            `${record}, and then won the final${byline} anyway`,
          year: title.year,
          week: titleGame?.week ?? lastWeek,
        },
      ];
    }

    const settledWeek = weeks[fromIndex];
    const before =
      fromIndex > 0
        ? `was ${ordinal(ranks[fromIndex - 1])} after Week ${weeks[fromIndex - 1]}, then `
        : "";

    return [
      {
        value: settledWeek,
        subject,
        href: titleGame ? matchupHref(titleGame) : `/seasons/${title.year}/standings`,
        detail:
          `${title.year} · Week ${settledWeek} — ${subject} ${before}` +
          `never left the top ${cutoff} again, finished ${ordinal(finishedAt)} ` +
          `at ${record}, and won the final${byline}`,
        year: title.year,
        week: settledWeek,
      },
    ];
  });

export const championshipInevitability = defineStat({
  id: "championship-inevitability",
  label: "When the title was decided",
  description:
    "Looking back at each championship: the week after which the eventual " +
    "champion never again fell out of the top half of the playoff places — " +
    "the top three of six, or the top two of four in the early years. " +
    "Ranked on the standings after every week, by record then points scored. " +
    "The earlier the week, the less doubt there ever was; 'never' means they " +
    "were still outside that group on the last day and won it regardless.",
  scope: "season",
  format: "count",
  direction: "low",
  compute: inevitabilityEntries,
});

// The module is imported for its side effects in index.ts, so a stat exists as
// soon as it is defined; this list is here for anything that wants the three
// together.
export const identityStats: StatDefinition[] = [
  onThisDay,
  managerArchetypes,
  championshipInevitability,
];

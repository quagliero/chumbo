import { defineStat } from "./registry";
import type { Game, StatEntry } from "./types";

/**
 * Matchup records (C3a–C3f).
 *
 * C3a/C3b are the reference implementations for the registry — the shape the
 * remaining stats follow. Each one is a filter and a map over the flattened
 * game list; none of them walks the seasons itself.
 */

const matchupHref = (game: Game) =>
  `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;

const versus = (game: Game) =>
  `${game.year} Week ${game.week} vs ${game.opponentManagerId ?? "unknown"}`;

const entry = (game: Game, value: number): StatEntry => ({
  value,
  subject: game.managerId ?? String(game.rosterId),
  href: matchupHref(game),
  detail: versus(game),
  year: game.year,
  week: game.week,
});

/**
 * Each game appears twice in the flattened list, once per team. For a stat
 * about the game rather than the team — a margin, a combined total — keep one
 * half, or every record shows up as a duplicate pair.
 */
const oneSidePerGame = (games: Game[]) =>
  games.filter((game) => game.rosterId < game.opponentRosterId);

export const biggestMargin = defineStat({
  id: "biggest-margin",
  label: "Biggest blowout",
  description: "The largest winning margin in league history.",
  scope: "league",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "win")
      .map((game) => entry(game, Math.round(game.margin * 100) / 100)),
});

export const closestMargin = defineStat({
  id: "closest-margin",
  label: "Closest game",
  description:
    "The narrowest winning margin. Ties are excluded — they are their own thing.",
  scope: "league",
  format: "points",
  direction: "low",
  // The WINNER's half, not `oneSidePerGame`'s lower roster id: the entry's
  // subject is who holds the record, and the narrative engine calls this "the
  // narrowest win". Keeping the lower id credited hadkiss with the narrowest
  // win in league history — 116.10 to 116.14, which hadkiss lost.
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "win")
      .map((game) => entry(game, Math.round(game.margin * 100) / 100)),
});

export const highestScoringLoss = defineStat({
  id: "highest-scoring-loss",
  // Not "Unluckiest loss": that name belongs to `beat-almost-everyone`, which
  // judges a loss against the whole week, as the week recap's line does.
  label: "Highest-scoring loss",
  description:
    "The most points anyone has ever scored and still lost. Any other week it would have won.",
  scope: "league",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "loss")
      .map((game) => entry(game, game.points)),
});

export const lowestScoringWin = defineStat({
  id: "lowest-scoring-win",
  label: "Lowest-scoring win",
  description:
    "The fewest points anyone has ever scored and still won. The opposite of the highest-scoring loss.",
  scope: "league",
  format: "points",
  direction: "low",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "win")
      .map((game) => entry(game, game.points)),
});

/* ------------------------------------------------------------------ C3c–C3f */

const round2 = (value: number) => Math.round(value * 100) / 100;

const managerHref = (managerId: string) => `/managers/${managerId}`;

const name = (managerId: string | null) => managerId ?? "unknown";

/**
 * Chronological order, across seasons.
 *
 * The flattened list is built season by season, but nothing in the traversal
 * promises an order and nothing else depends on one. Any stat that walks
 * history forwards — a streak, a rematch — has to sort first, or it silently
 * computes a streak over whatever order the seasons happened to load in.
 */
const chronological = (games: Game[]): Game[] =>
  [...games].sort((a, b) => a.year - b.year || a.week - b.week);

/** Every manager's games, chronological. Games with no known owner are dropped. */
const gamesByManager = (games: Game[]): Map<string, Game[]> => {
  const byManager = new Map<string, Game[]>();
  for (const game of games) {
    if (!game.managerId) continue;
    const played = byManager.get(game.managerId);
    if (played) played.push(game);
    else byManager.set(game.managerId, [game]);
  }
  for (const [managerId, played] of byManager) {
    byManager.set(managerId, chronological(played));
  }
  return byManager;
};

/* ----------------------------------------------------- C3c: beat almost everyone */

export const beatAlmostEveryone = defineStat({
  id: "beat-almost-everyone",
  // The same idea as the week recap's "Unluckiest loss" — a loss measured
  // against every score that week — so the same name.
  label: "Unluckiest loss",
  description:
    "Losses that would have been wins against nearly the whole league, ranked by how many of the week's other scores the losing score beat. Topping ten of eleven and still losing — outscored only by the one team you happened to play — is the worst luck the schedule can hand out. Where two losses beat as many, the higher score ranks first.",
  scope: "league",
  format: "count",
  direction: "high",
  compute: ({ games }) => {
    const byWeek = new Map<string, Game[]>();
    for (const game of games) {
      const key = `${game.year}|${game.week}`;
      const week = byWeek.get(key);
      if (week) week.push(game);
      else byWeek.set(key, [game]);
    }

    const losses = games
      .filter((game) => game.result === "loss")
      .map((game) => {
        // Every other team that played that week, the opponent included.
        const others = (byWeek.get(`${game.year}|${game.week}`) ?? []).filter(
          (other) => other.rosterId !== game.rosterId
        );
        const beaten = others.filter(
          (other) => other.points < game.points
        ).length;
        return { game, beaten, fieldSize: others.length };
      });

    // Two entries can beat the same number of teams; the higher score is the
    // better story. The registry sorts by value with a stable sort, so this
    // secondary order survives.
    losses.sort(
      (a, b) => b.beaten - a.beaten || b.game.points - a.game.points
    );

    return losses.map(({ game, beaten, fieldSize }) => ({
      ...entry(game, beaten),
      detail: `${round2(game.points)} points in ${game.year} Week ${
        game.week
      } — better than ${beaten} of the other ${fieldSize}, but lost to ${name(
        game.opponentManagerId
      )} by ${round2(Math.abs(game.margin))}`,
    }));
  },
});

/* --------------------------------------------------------------- C3d: streaks */

interface Streak {
  managerId: string;
  length: number;
  start: Game;
  end: Game;
}

/**
 * The longest run of one result per manager, walked in chronological order.
 *
 * Playoff games count: a win is a win, and a run that carries through a title
 * game is the run people actually talk about. A tie ends a streak — it is
 * neither the result being counted nor a break in the other direction, and
 * there are few enough of them that either choice is defensible.
 */
const longestStreaks = (games: Game[], kind: "win" | "loss"): Streak[] => {
  const best: Streak[] = [];

  for (const [managerId, played] of gamesByManager(games)) {
    let current: Streak | null = null;
    let longest: Streak | null = null;

    for (const game of played) {
      if (game.result !== kind) {
        current = null;
        continue;
      }
      const extended: Streak = current
        ? {
            managerId,
            length: current.length + 1,
            start: current.start,
            end: game,
          }
        : { managerId, length: 1, start: game, end: game };

      current = extended;
      if (!longest || extended.length > longest.length) longest = extended;
    }

    if (longest) best.push(longest);
  }

  return best;
};

const streakDetail = (streak: Streak) =>
  `${streak.start.year} Week ${streak.start.week} – ${streak.end.year} Week ${streak.end.week}`;

const streakEntry = (streak: Streak): StatEntry => ({
  value: streak.length,
  subject: streak.managerId,
  href: managerHref(streak.managerId),
  detail: streakDetail(streak),
  year: streak.end.year,
  week: streak.end.week,
});

export const longestWinStreak = defineStat({
  id: "longest-win-streak",
  label: "Longest win streak",
  description:
    "The longest run of wins any manager has put together, counted straight through the playoffs and on into the next season. A tie ends a streak.",
  scope: "manager",
  format: "count",
  direction: "high",
  compute: ({ games }) => longestStreaks(games, "win").map(streakEntry),
});

export const longestLossStreak = defineStat({
  id: "longest-loss-streak",
  label: "Longest losing streak",
  description:
    "The longest run of losses any manager has endured, counted straight through the playoffs and on into the next season. A tie ends a streak.",
  scope: "manager",
  format: "count",
  direction: "high",
  compute: ({ games }) => longestStreaks(games, "loss").map(streakEntry),
});

/* ------------------------------------------------------ C3e: rivalry intensity */

/**
 * Two managers have to have met this often to be a rivalry. Below it, a pair
 * that happened to play two one-point games would sit permanently at the top.
 */
const MIN_RIVALRY_MEETINGS = 12;

export const rivalryIntensity = defineStat({
  id: "rivalry-intensity",
  label: "Closest rivalry",
  description: `The head-to-head pairing with the smallest average margin — the two managers whose games are always tight. Pairings with fewer than ${MIN_RIVALRY_MEETINGS} meetings are left out, because two flukey games would otherwise top the list forever.`,
  scope: "manager",
  format: "points",
  direction: "low",
  compute: ({ games }) => {
    interface Pairing {
      a: string;
      b: string;
      meetings: number;
      totalMargin: number;
      aWins: number;
      bWins: number;
      ties: number;
      firstYear: number;
    }

    const pairings = new Map<string, Pairing>();

    // One row per game, not one per team, or every margin is counted twice —
    // harmless for the average, but the meeting count would double.
    for (const game of oneSidePerGame(games)) {
      const self = game.managerId;
      const other = game.opponentManagerId;
      if (!self || !other || self === other) continue;

      const [a, b] = self < other ? [self, other] : [other, self];
      const key = `${a}|${b}`;
      const pairing = pairings.get(key) ?? {
        a,
        b,
        meetings: 0,
        totalMargin: 0,
        aWins: 0,
        bWins: 0,
        ties: 0,
        firstYear: game.year,
      };

      pairing.meetings += 1;
      pairing.totalMargin += Math.abs(game.margin);
      pairing.firstYear = Math.min(pairing.firstYear, game.year);
      if (game.result === "tie") pairing.ties += 1;
      else {
        const winner = game.result === "win" ? self : other;
        if (winner === a) pairing.aWins += 1;
        else pairing.bWins += 1;
      }

      pairings.set(key, pairing);
    }

    return [...pairings.values()]
      .filter((pairing) => pairing.meetings >= MIN_RIVALRY_MEETINGS)
      .map((pairing) => {
        // The ledger reads from whoever is ahead — "fin leads 6–14" is not
        // something anyone would say.
        const [leader, ahead, behind] =
          pairing.aWins >= pairing.bWins
            ? [pairing.a, pairing.aWins, pairing.bWins]
            : [pairing.b, pairing.bWins, pairing.aWins];
        const ledger =
          ahead === behind
            ? `dead even at ${ahead}–${behind}`
            : `${leader} leads ${ahead}–${behind}`;
        const ties =
          pairing.ties === 0
            ? ""
            : pairing.ties === 1
            ? " with a tie"
            : ` with ${pairing.ties} ties`;

        return {
          value: round2(pairing.totalMargin / pairing.meetings),
          subject: `${pairing.a} vs ${pairing.b}`,
          href: `/h2h/${pairing.a}/${pairing.b}`,
          detail: `${pairing.meetings} meetings since ${pairing.firstYear}, ${ledger}${ties}`,
        };
      });
  },
});

/* ---------------------------------------------------------- C3f: revenge games */

/** A loss by this much is a blowout, and the next meeting is a revenge game. */
const BLOWOUT_MARGIN = 40;

/** Fewer revenge games than this and the percentage is noise, not a trait. */
const MIN_REVENGE_GAMES = 5;

export const revengeGames = defineStat({
  id: "revenge-games",
  label: "Revenge games",
  description: `How managers do in the rematch. Take every loss by ${BLOWOUT_MARGIN} points or more, then look at the very next meeting with that same opponent — whenever it comes, even a season later. The number is the win percentage in those rematches, for managers with at least ${MIN_REVENGE_GAMES} of them.`,
  scope: "manager",
  format: "percent",
  direction: "high",
  compute: ({ games }) => {
    interface Revenge {
      wins: number;
      losses: number;
      ties: number;
    }

    const records = new Map<string, Revenge>();

    for (const [managerId, played] of gamesByManager(games)) {
      // Chronological meetings with each opponent, so "the rematch" is simply
      // the next element.
      const byOpponent = new Map<string, Game[]>();
      for (const game of played) {
        if (!game.opponentManagerId) continue;
        const meetings = byOpponent.get(game.opponentManagerId);
        if (meetings) meetings.push(game);
        else byOpponent.set(game.opponentManagerId, [game]);
      }

      const record: Revenge = { wins: 0, losses: 0, ties: 0 };

      for (const meetings of byOpponent.values()) {
        for (let i = 0; i < meetings.length - 1; i++) {
          const beating = meetings[i];
          if (
            beating.result !== "loss" ||
            Math.abs(beating.margin) < BLOWOUT_MARGIN
          ) {
            continue;
          }
          const rematch = meetings[i + 1];
          if (rematch.result === "win") record.wins += 1;
          else if (rematch.result === "loss") record.losses += 1;
          else record.ties += 1;
        }
      }

      records.set(managerId, record);
    }

    const ranked = [...records.entries()]
      .map(([managerId, record]) => ({
        managerId,
        record,
        played: record.wins + record.losses + record.ties,
      }))
      .filter(({ played }) => played >= MIN_REVENGE_GAMES)
      // More rematches is the better evidence, so it breaks ties on percentage.
      .sort((a, b) => b.played - a.played);

    return ranked.map(({ managerId, record, played }) => ({
      value: round2((100 * record.wins) / played),
      subject: managerId,
      href: managerHref(managerId),
      detail: `${record.wins}–${record.losses}${
        record.ties ? `–${record.ties}` : ""
      } in rematches after a ${BLOWOUT_MARGIN}+ point loss`,
    }));
  },
});

/* --------------------------------------------- seasons and careers (J3) */

/**
 * The three totals the league quotes at each other, which the registry did
 * not have until the records watch needed something to watch (J3).
 *
 * All three are **regular season only**, and say so. Playoff games are not
 * available to everyone — a team that missed the playoffs cannot add to them —
 * so a career total that counted them would rank partly on how often somebody
 * made the cut, and a season total would be comparing thirteen games with
 * sixteen. It is also the basis K1's previews already use ("their 100th
 * regular-season win"), and two numbers for one fact is how a site starts
 * disagreeing with itself.
 */
export const seasonTotals = (games: Game[]) => {
  const byTeam = new Map<
    string,
    { year: number; managerId: string | null; rosterId: number; points: number; played: number }
  >();
  for (const game of games) {
    if (!game.isRegularSeason) continue;
    const key = `${game.year}|${game.rosterId}`;
    const team = byTeam.get(key);
    if (team) {
      team.points = round2(team.points + game.points);
      team.played += 1;
    } else {
      byTeam.set(key, {
        year: game.year,
        managerId: game.managerId,
        rosterId: game.rosterId,
        points: round2(game.points),
        played: 1,
      });
    }
  }
  return [...byTeam.values()];
};

/**
 * How long a season's regular season was, as it was actually played: the most
 * games any team in it played. It is 13 in 2014–2020 and 14 elsewhere, which
 * is why the list prints it — 1,534.9 in thirteen games is the better season
 * than the same total in fourteen, and a bare list of totals hides that.
 */
export const seasonLengths = (totals: ReturnType<typeof seasonTotals>) => {
  const length = new Map<number, number>();
  for (const team of totals) {
    length.set(team.year, Math.max(length.get(team.year) ?? 0, team.played));
  }
  return length;
};

/**
 * Season totals from seasons that finished their regular season.
 *
 * A season in progress is not a season: its totals belong to the records
 * watch (J3), which is about what might still happen, not to a list of what
 * has. Shared with the watch so the record it names and the list it links to
 * are the same number.
 */
export const completeSeasonTotals = (games: Game[]) => {
  const totals = seasonTotals(games);
  const lengths = seasonLengths(totals);
  return totals.filter((team) => team.played === lengths.get(team.year));
};

export const mostPointsSeason = defineStat({
  id: "most-points-season",
  label: "Most points in a season",
  description:
    "The highest regular-season total anyone has scored. The number of games is given with each one: the league played thirteen from 2014 to 2020 and fourteen either side of that, so the totals are not all over the same distance.",
  scope: "season",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    completeSeasonTotals(games).map((team) => ({
    value: team.points,
    subject: team.managerId ?? String(team.rosterId),
    href: `/seasons/${team.year}/standings`,
    detail: `${team.year}, ${team.played} games`,
    year: team.year,
  })),
});

/** Every manager's regular-season games, for the two career lists. */
export const careerTotals = (games: Game[]) => {
  const byManager = new Map<
    string,
    { wins: number; losses: number; ties: number; points: number; played: number; years: Set<number> }
  >();
  for (const game of games) {
    if (!game.isRegularSeason || !game.managerId) continue;
    const career =
      byManager.get(game.managerId) ??
      { wins: 0, losses: 0, ties: 0, points: 0, played: 0, years: new Set<number>() };
    career[game.result === "win" ? "wins" : game.result === "loss" ? "losses" : "ties"] += 1;
    career.points = round2(career.points + game.points);
    career.played += 1;
    career.years.add(game.year);
    byManager.set(game.managerId, career);
  }
  return byManager;
};

const span = (years: Set<number>) => {
  const sorted = [...years].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? `${first}` : `${first}–${last}`;
};

export const careerPoints = defineStat({
  id: "career-points",
  label: "Most points, ever",
  description:
    "Every point a manager has scored in a regular season, across every season they have played.",
  scope: "manager",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    [...careerTotals(games)].map(([managerId, career]) => ({
      value: career.points,
      subject: managerId,
      href: managerHref(managerId),
      detail: `${span(career.years)} · ${career.played} games, ${round2(
        career.points / career.played
      )} a game`,
    })),
});

export const careerWins = defineStat({
  id: "career-wins",
  label: "Most wins, ever",
  description:
    "Regular-season wins, across every season a manager has played. The league has had managers for one season and for all fifteen, so the record and the win percentage are different questions.",
  scope: "manager",
  format: "count",
  direction: "high",
  compute: ({ games }) =>
    [...careerTotals(games)].map(([managerId, career]) => ({
      value: career.wins,
      subject: managerId,
      href: managerHref(managerId),
      detail: `${career.wins}–${career.losses}${
        career.ties ? `–${career.ties}` : ""
      } across ${span(career.years)}`,
    })),
});

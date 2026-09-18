import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { hasApproximateLineups } from "@/domain/dataQuality";
import type { ExtendedMatchup } from "@/types/matchup";
import { getOptimalLineup } from "@/utils/lineupAnalysis";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { getTeamName } from "@/utils/teamName";
import { isWeekCompleted } from "@/utils/weekUtils";

/**
 * "Week N in the Chumbo" (J2): what happened in one week, worked out from that
 * season's matchups alone.
 *
 * Only the week's own facts live here — top and bottom score, the closest game
 * and the biggest beating, the worst benching, the luckiest win and the
 * unluckiest loss, and the streaks that week started or ended. Whether any of
 * it is an all-time record is the narrative engine's job (E7), which already
 * reads the precomputed registry for exactly that, so a recap and a records
 * page cannot disagree about what is notable.
 *
 * One season is all it reads, deliberately: the matchups tab has that season
 * loaded, and a recap that needed the archive would make every week page
 * download fifteen seasons of matchups.
 */

export interface RecapTeam {
  rosterId: number;
  ownerId: string;
  managerId: string | null;
  /** The manager's name — what the league calls each other — else the team name. */
  name: string;
  points: number;
}

export interface RecapGame {
  matchupId: number;
  /** The higher score. In a tie, the first team in the file. */
  winner: RecapTeam;
  loser: RecapTeam;
  margin: number;
  tied: boolean;
  href: string;
}

export interface RecapBenching {
  team: RecapTeam;
  game: RecapGame;
  /** Points the best possible lineup would have added. */
  benched: number;
  /** Lost, by less than it left on the bench. */
  costTheGame: boolean;
}

export interface RecapLuck {
  team: RecapTeam;
  game: RecapGame;
  /** Where the score ranked in the week, 1 = highest. */
  rank: number;
  /** How many of the week's other scores it beat, and out of how many. */
  beat: number;
  of: number;
}

export interface RecapStreak {
  team: RecapTeam;
  kind: "W" | "L";
  /** The length after this week, or the length that just ended. */
  count: number;
  ended: boolean;
}

export interface WeekRecap {
  year: number;
  week: number;
  playoffs: boolean;
  games: RecapGame[];
  top: { team: RecapTeam; game: RecapGame };
  bottom: { team: RecapTeam; game: RecapGame };
  closest: RecapGame;
  blowout: RecapGame;
  /** Absent for 2019, whose lineups are reconstructed (`dataQuality.ts`). */
  benching?: RecapBenching;
  /** Only when the winner's score was in the bottom half of the week. */
  luckiest?: RecapLuck;
  /** Only when the loser's score was in the week's top three. */
  unluckiest?: RecapLuck;
  streaks: RecapStreak[];
}

/** A streak shorter than this is not worth a sentence. Same bar as H2H. */
export const RECAP_MIN_STREAK = 3;

/** One week's sides. The season type keys weeks by literal "1".."17". */
const weekSides = (matchups: object | undefined, week: number): ExtendedMatchup[] =>
  (matchups as Record<string, ExtendedMatchup[] | undefined> | undefined)?.[
    String(week)
  ] ?? [];

const managerNames = new Map(managers.map((m) => [m.id, m.name]));

const pairsIn = (sides: ExtendedMatchup[] | undefined) => {
  const byId = new Map<number, ExtendedMatchup[]>();
  for (const side of sides ?? []) {
    // A null matchup id is a team with no game — never pair two of them.
    if (side.matchup_id === null || side.matchup_id === undefined) continue;
    byId.set(side.matchup_id, [...(byId.get(side.matchup_id) ?? []), side]);
  }
  return [...byId.values()].filter((pair) => pair.length === 2);
};

/** Every week of `year` Sleeper has finished scoring, in order. */
export const completedWeeks = (year: number): number[] => {
  const season = seasons[year];
  if (!season) return [];
  return Object.keys(season.matchups ?? {})
    .map(Number)
    .filter((week) => isWeekCompleted(week, season.league))
    .filter((week) => pairsIn(weekSides(season.matchups, week)).length > 0)
    .sort((a, b) => a - b);
};

export const buildWeekRecap = (year: number, week: number): WeekRecap | null => {
  const season = seasons[year];
  if (!season || !isWeekCompleted(week, season.league)) return null;

  const pairs = pairsIn(weekSides(season.matchups, week));
  if (pairs.length === 0) return null;

  const playoffWeekStart = getPlayoffWeekStart(season);
  const playoffs = week >= playoffWeekStart;

  const team = (side: ExtendedMatchup): RecapTeam => {
    const ownerId =
      season.rosters.find((r) => r.roster_id === side.roster_id)?.owner_id ?? "";
    const managerId = getManagerIdBySleeperOwnerId(ownerId) ?? null;
    return {
      rosterId: side.roster_id,
      ownerId,
      managerId,
      name:
        (managerId && managerNames.get(managerId)) ||
        getTeamName(ownerId, season.users),
      points: side.points ?? 0,
    };
  };

  const games: RecapGame[] = pairs.map(([a, b]) => {
    const [winner, loser] = (b.points ?? 0) > (a.points ?? 0) ? [b, a] : [a, b];
    return {
      matchupId: a.matchup_id as number,
      winner: team(winner),
      loser: team(loser),
      margin: (winner.points ?? 0) - (loser.points ?? 0),
      tied: (a.points ?? 0) === (b.points ?? 0),
      href: `/seasons/${year}/matchups/${week}/${a.matchup_id}`,
    };
  });

  const sides = games.flatMap((game) => [
    { team: game.winner, game },
    { team: game.loser, game },
  ]);
  // Ties go to the lower roster id, so the same week always reads the same way.
  const byScore = [...sides].sort(
    (a, b) => b.team.points - a.team.points || a.team.rosterId - b.team.rosterId
  );
  const byMargin = [...games].sort(
    (a, b) => a.margin - b.margin || a.matchupId - b.matchupId
  );

  return {
    year,
    week,
    playoffs,
    games,
    top: byScore[0],
    bottom: byScore[byScore.length - 1],
    closest: byMargin[0],
    blowout: byMargin[byMargin.length - 1],
    benching: worstBenching(year, week, games),
    // All-play luck and season streaks are regular-season ideas: a playoff
    // week is half consolation games, and "the luckiest win" among those is
    // not a thing anyone wants to read.
    luckiest: playoffs ? undefined : luck(byScore, "luckiest"),
    unluckiest: playoffs ? undefined : luck(byScore, "unluckiest"),
    streaks: playoffs ? [] : streaksThrough(year, week, games),
  };
};

const worstBenching = (
  year: number,
  week: number,
  games: RecapGame[]
): RecapBenching | undefined => {
  if (hasApproximateLineups(year)) return undefined;
  const sides = weekSides(seasons[year].matchups, week);

  let worst: RecapBenching | undefined;
  for (const game of games) {
    for (const [recapTeam, opponent] of [
      [game.winner, game.loser],
      [game.loser, game.winner],
    ] as const) {
      const side = sides.find((s) => s.roster_id === recapTeam.rosterId);
      if (!side) continue;
      const { pointsLeftOnBench } = getOptimalLineup(side, year);
      const benched = Math.max(0, pointsLeftOnBench);
      if (worst && benched <= worst.benched) continue;
      const lost = recapTeam.points < opponent.points;
      worst = {
        team: recapTeam,
        game,
        benched,
        costTheGame: lost && recapTeam.points + benched > opponent.points,
      };
    }
  }
  return worst && worst.benched > 0 ? worst : undefined;
};

const luck = (
  byScore: { team: RecapTeam; game: RecapGame }[],
  which: "luckiest" | "unluckiest"
): RecapLuck | undefined => {
  const of = byScore.length - 1;
  const ranked = byScore.map((side, index) => ({
    ...side,
    rank: index + 1,
    beat: byScore.filter((other) => other.team.points < side.team.points).length,
    of,
  }));

  if (which === "luckiest") {
    // The winner with the lowest score, if it was in the bottom half.
    const winners = ranked.filter(
      (s) => !s.game.tied && s.game.winner.rosterId === s.team.rosterId
    );
    const pick = winners[winners.length - 1];
    return pick && pick.rank > byScore.length / 2 ? pick : undefined;
  }
  // The loser with the highest score, if it was in the week's top three.
  const pick = ranked.find(
    (s) => !s.game.tied && s.game.loser.rosterId === s.team.rosterId
  );
  return pick && pick.rank <= 3 ? pick : undefined;
};

/**
 * Regular-season streaks this week extended past the bar, or ended after
 * reaching it. Longest first.
 */
const streaksThrough = (
  year: number,
  week: number,
  games: RecapGame[]
): RecapStreak[] => {
  const season = seasons[year];
  const playoffWeekStart = getPlayoffWeekStart(season);
  const weeks = Object.keys(season.matchups ?? {})
    .map(Number)
    .filter((w) => w <= week && w < playoffWeekStart)
    .sort((a, b) => a - b);

  const streaks: RecapStreak[] = [];
  for (const recapTeam of games.flatMap((g) => [g.winner, g.loser])) {
    const results: ("W" | "L" | "T")[] = [];
    for (const w of weeks) {
      const pair = pairsIn(weekSides(season.matchups, w)).find((p) =>
        p.some((s) => s.roster_id === recapTeam.rosterId)
      );
      if (!pair) continue;
      const mine = pair.find((s) => s.roster_id === recapTeam.rosterId)!;
      const theirs = pair.find((s) => s.roster_id !== recapTeam.rosterId)!;
      results.push(
        mine.points > theirs.points ? "W" : mine.points < theirs.points ? "L" : "T"
      );
    }
    const latest = results[results.length - 1];
    const run = (end: number) => {
      const kind = results[end];
      let count = 0;
      for (let i = end; i >= 0 && results[i] === kind; i--) count++;
      return { kind, count };
    };

    const now = run(results.length - 1);
    if (latest !== "T" && now.count >= RECAP_MIN_STREAK) {
      streaks.push({
        team: recapTeam,
        kind: latest,
        count: now.count,
        ended: false,
      });
      continue;
    }
    if (results.length < 2) continue;
    const before = run(results.length - 2);
    if (
      before.kind !== "T" &&
      before.kind !== latest &&
      before.count >= RECAP_MIN_STREAK
    ) {
      streaks.push({
        team: recapTeam,
        kind: before.kind,
        count: before.count,
        ended: true,
      });
    }
  }
  return streaks.sort(
    (a, b) => b.count - a.count || a.team.name.localeCompare(b.team.name)
  );
};

/* ----------------------------------------------------------------- the words */

export interface RecapLine {
  /** Short, for a card's left column: "Top score". */
  label: string;
  text: string;
  href?: string;
}

const pts = (points: number) => points.toFixed(1);

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** "best" for 1st, else "5th-best". */
const bestRank = (rank: number) => (rank === 1 ? "best" : `${ordinal(rank)}-best`);

const scoreline = (game: RecapGame) =>
  `${game.winner.name} ${pts(game.winner.points)}–${pts(game.loser.points)} ${game.loser.name}`;

const COUNT_WORDS = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
];
const count = (n: number) => COUNT_WORDS[n] ?? String(n);

/**
 * The recap as sentences, most important first. One list for the page, the
 * share card and the link preview, so the three cannot word the same week
 * three ways.
 */
export const recapLines = (recap: WeekRecap): RecapLine[] => {
  const lines: RecapLine[] = [];
  const { top, bottom, closest, blowout } = recap;

  lines.push({
    label: "Top score",
    text: `${top.team.name} ${pts(top.team.points)}${
      top.game.tied
        ? ", and still only tied"
        : top.game.winner.rosterId === top.team.rosterId
          ? ""
          : `, and still lost to ${top.game.winner.name}`
    }`,
    href: top.game.href,
  });

  lines.push({
    label: "Closest game",
    text: closest.tied
      ? `${closest.winner.name} and ${closest.loser.name} tied at ${pts(closest.winner.points)}`
      : `${scoreline(closest)}, by ${closest.margin.toFixed(2)}`,
    href: closest.href,
  });

  if (blowout.matchupId !== closest.matchupId) {
    lines.push({
      label: "Biggest beating",
      text: `${blowout.winner.name} by ${pts(blowout.margin)} over ${blowout.loser.name}`,
      href: blowout.href,
    });
  }

  if (recap.luckiest) {
    const { team, rank, beat, of } = recap.luckiest;
    lines.push({
      label: "Luckiest win",
      text: `${team.name}, with the week's ${bestRank(rank)} score (beat ${beat} of ${of})`,
      href: recap.luckiest.game.href,
    });
  }

  if (recap.unluckiest) {
    const { team, rank } = recap.unluckiest;
    lines.push({
      label: "Unluckiest loss",
      text: `${team.name}, with the week's ${bestRank(rank)} score`,
      href: recap.unluckiest.game.href,
    });
  }

  if (recap.benching) {
    const { team, benched, costTheGame } = recap.benching;
    lines.push({
      label: "Worst benching",
      text: `${team.name} left ${pts(benched)} on the bench${
        costTheGame ? " — enough to have won" : ""
      }`,
      href: recap.benching.game.href,
    });
  }

  lines.push({
    label: "Low score",
    text: `${bottom.team.name} ${pts(bottom.team.points)}${
      bottom.game.winner.rosterId === bottom.team.rosterId && !bottom.game.tied
        ? `, and still won`
        : ""
    }`,
    href: bottom.game.href,
  });

  // The longest four: a week that ends six streaks is not six stories.
  for (const streak of recap.streaks.slice(0, 4)) {
    const verb = streak.kind === "W" ? "winning" : "losing";
    lines.push({
      label: streak.ended ? "Streak over" : "On a run",
      text: streak.ended
        ? `${streak.team.name}'s ${streak.count}-game ${verb} streak is over`
        : `${streak.team.name} has ${streak.kind === "W" ? "won" : "lost"} ${count(
            streak.count
          )} straight`,
    });
  }

  return lines;
};

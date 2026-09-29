import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { determineMatchupResult, roundToTwoDecimals } from "@/utils/recordUtils";

/**
 * How much the schedule decided a season, week by week.
 *
 * Every week a manager's score is a fact and their opponent is a draw. The
 * all-play share — the fraction of the league they outscored — is what the
 * score was worth before the draw was made: beat ten of eleven and a random
 * opponent is a 91% win. The schedule's contribution to that week is the
 * result minus the share:
 *
 *       week luck = result (1, ½ or 0) − all-play share
 *
 * so a win with the week's second-worst score is +0.82, and a loss with its
 * second-best is −0.91. Summed over a season it is D7's luck (actual wins
 * minus expected), and it nets to zero across the league every week — the
 * schedule only moves wins from one team to another.
 *
 * Why this and not points against. Points against is a sum, so one opponent's
 * 160 weighs as much as two others' 80s — a manager can have the league's
 * highest points against and a kind schedule. Luck is bounded per week (one
 * game is worth at most one win of luck), and the opponent's strength is
 * measured by their RANK that week, which a single outlier cannot inflate.
 *
 * And one step further than D7: the shares are a probability for each week, so
 * together they give the whole distribution of records a random schedule would
 * have handed a team (a Poisson binomial) — not just "two wins lucky" but
 * "luckier than 96% of schedules".
 */

export interface LuckWeek {
  week: number;
  opponentId: number;
  points: number;
  opponentPoints: number;
  result: "W" | "L" | "T";
  /** The share of the rest of the league outscored that week, ties half. */
  share: number;
  /** 1 = the week's top score. Tied scores share the higher rank. */
  rank: number;
  opponentRank: number;
  /** Teams that scored that week, so a rank can be read "of 12". */
  teams: number;
  /** result − share. Positive is a schedule that flattered them. */
  luck: number;
}

export interface TeamLuck {
  rosterId: number;
  weeks: LuckWeek[];
  wins: number;
  losses: number;
  ties: number;
  /** Head-to-head wins, a tie counting half. */
  actualWins: number;
  /** Sum of the weekly all-play shares. */
  expectedWins: number;
  luck: number;
  /**
   * `distribution[k]` is the chance a random opponent each week would have
   * left them with exactly k wins. Sums to 1; its mean is `expectedWins`.
   */
  distribution: number[];
  /**
   * Where the actual record sits among those schedules, 0-1: the share giving
   * fewer wins, plus half the share giving the same. 0.5 is exactly what the
   * scores deserved; 0.97 is luckier than 97% of schedules.
   */
  percentile: number;
  /** The average weekly rank of the opponents faced. Lower is tougher. */
  opponentRank: number;
  pointsAgainst: number;
  /** Weeks the opponent put up the league's top score. */
  facedTopScore: number;
}

/** One pairing per matchup id, a bye or a broken week dropped. */
export const pairsOf = (
  fixtures: readonly ScheduledMatchup[]
): [number, number][] => {
  const byId = new Map<number, number[]>();
  for (const { matchup_id, roster_id } of fixtures) {
    if (matchup_id == null) continue;
    byId.set(matchup_id, [...(byId.get(matchup_id) ?? []), roster_id]);
  }
  return [...byId.values()]
    .filter((pair): pair is [number, number] => pair.length === 2)
    .map(([a, b]) => [a, b]);
};

/**
 * The chance of each number of successes from independent trials with the
 * given probabilities. Exact, by building it up one trial at a time.
 */
export const poissonBinomial = (probabilities: readonly number[]): number[] => {
  let distribution = [1];
  for (const p of probabilities) {
    const next = new Array(distribution.length + 1).fill(0);
    distribution.forEach((chance, k) => {
      next[k] += chance * (1 - p);
      next[k + 1] += chance * p;
    });
    distribution = next;
  }
  return distribution;
};

const percentileOf = (distribution: readonly number[], actual: number) => {
  let below = 0;
  let equal = 0;
  distribution.forEach((chance, k) => {
    if (k < actual) below += chance;
    else if (k === actual) equal += chance;
  });
  return below + equal / 2;
};

/**
 * Each team's season, week by week, over the given regular-season weeks.
 *
 * The caller chooses the weeks (the playoff cut-off, and how much of a live
 * season has finished), as with `seasonLuck`, so this stays a pure function of
 * the scores. Only paired games count, so expected and actual wins accrue over
 * the same set of games.
 */
export const scheduleLuck = (
  rosters: readonly ExtendedRoster[],
  matchups: Record<string, ExtendedMatchup[]>,
  weeks: readonly number[]
): TeamLuck[] => {
  const byRoster = new Map<number, LuckWeek[]>(
    rosters.map((roster) => [roster.roster_id, []])
  );

  for (const week of weeks) {
    const weekMatchups = matchups[String(week)];
    if (!weekMatchups?.length) continue;

    const scores = new Map(
      weekMatchups.map((m) => [m.roster_id, roundToTwoDecimals(m.points)])
    );
    const field = [...scores.values()];
    const rankOf = (points: number) =>
      1 + field.filter((other) => other > points).length;

    for (const [a, b] of pairsOf(weekMatchups)) {
      for (const [team, opponent] of [
        [a, b],
        [b, a],
      ]) {
        const points = scores.get(team)!;
        const opponentPoints = scores.get(opponent)!;
        const others = field.length - 1;
        const beaten = field.filter((other) => other < points).length;
        const tied = field.filter((other) => other === points).length - 1;
        const share = others > 0 ? (beaten + tied / 2) / others : 0;
        const result = determineMatchupResult(points, opponentPoints);
        const actual = result === "W" ? 1 : result === "T" ? 0.5 : 0;

        byRoster.get(team)?.push({
          week,
          opponentId: opponent,
          points,
          opponentPoints,
          result,
          share,
          rank: rankOf(points),
          opponentRank: rankOf(opponentPoints),
          teams: field.length,
          luck: actual - share,
        });
      }
    }
  }

  return [...byRoster].map(([rosterId, teamWeeks]) => {
    const count = (result: LuckWeek["result"]) =>
      teamWeeks.filter((w) => w.result === result).length;
    const wins = count("W");
    const ties = count("T");
    const actualWins = wins + ties / 2;
    const expectedWins = teamWeeks.reduce((sum, w) => sum + w.share, 0);
    const distribution = poissonBinomial(teamWeeks.map((w) => w.share));

    return {
      rosterId,
      weeks: teamWeeks,
      wins,
      losses: count("L"),
      ties,
      actualWins,
      expectedWins,
      luck: actualWins - expectedWins,
      distribution,
      percentile: percentileOf(distribution, actualWins),
      opponentRank:
        teamWeeks.length > 0
          ? teamWeeks.reduce((sum, w) => sum + w.opponentRank, 0) /
            teamWeeks.length
          : 0,
      pointsAgainst: roundToTwoDecimals(
        teamWeeks.reduce((sum, w) => sum + w.opponentPoints, 0)
      ),
      facedTopScore: teamWeeks.filter((w) => w.opponentRank === 1).length,
    };
  });
};

/**
 * The standard normal CDF (Abramowitz and Stegun 7.1.26, good to 1e-7), for
 * the chance one normally distributed score beats another.
 */
export const normalCdf = (x: number): number => {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf =
    1 -
    t *
      (0.254829592 +
        t *
          (-0.284496736 +
            t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

export interface ScoringModel {
  rosterId: number;
  mean: number;
  stdDev: number;
}

/** The chance `a` outscores `b` when both score normally and independently. */
export const winProbability = (a: ScoringModel, b: ScoringModel): number => {
  const spread = Math.sqrt(a.stdDev ** 2 + b.stdDev ** 2);
  if (spread === 0) return a.mean > b.mean ? 1 : a.mean < b.mean ? 0 : 0.5;
  return normalCdf((a.mean - b.mean) / spread);
};

export interface RemainingGame {
  week: number;
  opponentId: number;
  /** Against this opponent, from both teams' scoring so far. */
  winProbability: number;
}

export interface RemainingSchedule {
  rosterId: number;
  games: RemainingGame[];
  /** Wins expected from the games actually scheduled. */
  expectedWins: number;
  /**
   * Wins expected from the same number of games against an average draw —
   * each game the mean of their chances against everybody else.
   */
  neutralWins: number;
  /** neutral − expected: the wins the fixture list is costing them. */
  difficulty: number;
}

/**
 * Every team's regular-season games still to play, each priced with the same
 * scoring model the playoff odds simulate (`calculateTeamStats`, shrunk
 * towards the league), and the whole run against an average one.
 *
 * Measured in wins, not in opponents' points per game, because a hard
 * schedule is hard in proportion to how good the team facing it is: a
 * strong opponent costs a middling team more than it costs the best team.
 */
export const remainingSchedule = (
  fixtures: Record<string, ScheduledMatchup[]>,
  remainingWeeks: readonly number[],
  models: readonly ScoringModel[]
): RemainingSchedule[] => {
  const model = new Map(models.map((m) => [m.rosterId, m]));

  const averageChance = (team: ScoringModel) => {
    const others = models.filter((m) => m.rosterId !== team.rosterId);
    return others.length > 0
      ? others.reduce((sum, other) => sum + winProbability(team, other), 0) /
          others.length
      : 0.5;
  };

  return models.map((team) => {
    const games: RemainingGame[] = [];
    for (const week of remainingWeeks) {
      for (const [a, b] of pairsOf(fixtures[String(week)] ?? [])) {
        const opponentId =
          a === team.rosterId ? b : b === team.rosterId ? a : null;
        const opponent = opponentId === null ? undefined : model.get(opponentId);
        if (!opponent) continue;
        games.push({
          week,
          opponentId: opponent.rosterId,
          winProbability: winProbability(team, opponent),
        });
      }
    }
    const expectedWins = games.reduce((sum, g) => sum + g.winProbability, 0);
    const neutralWins = games.length * averageChance(team);
    return {
      rosterId: team.rosterId,
      games,
      expectedWins,
      neutralWins,
      difficulty: neutralWins - expectedWins,
    };
  });
};

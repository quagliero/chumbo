import type { ExtendedMatchup } from "@/types/matchup";
import { YEARS } from "@/domain/constants";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { describeH2HStreak, getAllTimeH2HRecord } from "@/utils/h2h";
import { getManagerStats } from "@/utils/managerStats";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  calculateWeekStakes,
  type WeekStakes,
} from "@/utils/playoffOdds";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
// The same round numbers the records watch (J3) counts down to, so a preview
// and the watch cannot disagree about the milestone they are both naming.
import { nextPointsMilestone, nextWinMilestone } from "@/utils/recordsWatch";
import { mergeScheduledMatchups } from "@/utils/scheduleUtils";
import { getStatContext } from "@/utils/stats/traverse";
import type { Game } from "@/utils/stats/types";
import { getTeamName } from "@/utils/teamName";
import { seriesTidbits } from "@/utils/previewTidbits";
import { getCompletedWeek, isWeekCompleted } from "@/utils/weekUtils";

/**
 * Matchup previews (K1): the build-up to a game not yet played.
 *
 * For each fixture in `schedule.json`: the head-to-head record and its streak,
 * the last time they met, both managers' form, what the game is worth in
 * playoff odds, and what is on the line — a series that can be levelled, a
 * career milestone one result away.
 *
 * Unlike the recap this reads the archive, because a rivalry is fifteen
 * seasons long: the caller loads every season's `core` and `matchups` first.
 *
 * Regular season only. The playoffs are not in `schedule.json` — their
 * fixtures are the bracket's — and "what is at stake" in a semi-final is the
 * season, which needs no simulation to say.
 */

export type Result = "W" | "L" | "T";

export interface PreviewSide {
  rosterId: number;
  ownerId: string;
  managerId: string | null;
  /** What the preview calls the side: its team name that season. */
  name: string;
  teamName: string;
  /** The manager behind it, or the team name when the owner is unknown. */
  managerName: string;
  /** This season, before the game. */
  wins: number;
  losses: number;
  ties: number;
  /** Points per game this season, 0 before the first. */
  average: number;
  /** The last five results this season, oldest first. */
  form: Result[];
  /** Playoff odds now, with a win and with a loss. */
  stakes?: WeekStakes;
}

export interface PreviewMeeting {
  year: number;
  week: number;
  /** From side A's point of view. */
  result: Result;
  pointsA: number;
  pointsB: number;
  playoffs: boolean;
  href: string;
}

export interface MatchupPreview {
  year: number;
  week: number;
  matchupId: number;
  sides: [PreviewSide, PreviewSide];
  /** All time, regular season, from side A's point of view. */
  h2h: { wins: number; losses: number; ties: number; streak?: string };
  lastMeeting?: PreviewMeeting;
  /** Sentences about what this game could change. */
  onTheLine: string[];
  /** The series in sentences, most notable first (`previewTidbits.ts`). */
  tidbits: string[];
}

/** One week's sides. The season type keys weeks by literal "1".."17". */
const weekSides = (matchups: object | undefined, week: number): ExtendedMatchup[] =>
  (matchups as Record<string, ExtendedMatchup[] | undefined> | undefined)?.[
    String(week)
  ] ?? [];

const managerNames = new Map(managers.map((m) => [m.id, m.name]));

/**
 * The week to preview: the first one after the last Sleeper scored, if it is
 * a regular-season week with fixtures. Null for a finished season, and during
 * the playoffs.
 */
export const previewWeek = (year: number): number | null => {
  const season = seasons[year];
  if (!season?.schedule || season.league?.status === "complete") return null;
  const completed = getCompletedWeek(season.league) ?? 0;
  const next = completed + 1;
  if (next >= getPlayoffWeekStart(season)) return null;
  return season.schedule[String(next)]?.length ? next : null;
};

/** The pairs in a week's fixtures, as [matchupId, rosterA, rosterB]. */
export const fixturesFor = (
  year: number,
  week: number
): [number, number, number][] => {
  const byId = new Map<number, number[]>();
  for (const { matchup_id, roster_id } of seasons[year]?.schedule?.[String(week)] ?? []) {
    if (matchup_id === null || matchup_id === undefined) continue;
    byId.set(matchup_id, [...(byId.get(matchup_id) ?? []), roster_id]);
  }
  return [...byId]
    .filter(([, ids]) => ids.length === 2)
    .map(([id, [a, b]]) => [id, a, b] as [number, number, number])
    .sort((x, y) => x[0] - y[0]);
};

/** A team's results this season before `week`, oldest first. */
const resultsBefore = (year: number, week: number, rosterId: number) => {
  const season = seasons[year];
  const results: { result: Result; points: number }[] = [];
  const weeks = Object.keys(season.matchups ?? {})
    .map(Number)
    .filter((w) => w < week && isWeekCompleted(w, season.league))
    .sort((a, b) => a - b);
  for (const w of weeks) {
    const sides = weekSides(season.matchups, w);
    const mine = sides.find((s) => s.roster_id === rosterId);
    if (!mine || mine.matchup_id === null || mine.matchup_id === undefined) continue;
    const theirs = sides.find(
      (s) => s.matchup_id === mine.matchup_id && s.roster_id !== rosterId
    );
    if (!theirs) continue;
    results.push({
      result:
        mine.points > theirs.points ? "W" : mine.points < theirs.points ? "L" : "T",
      points: mine.points,
    });
  }
  return results;
};

/**
 * The most recent game between two owners, playoffs included — a final is the
 * meeting everybody remembers, and the all-time record (regular season only)
 * would skip it.
 */
const lastMeetingOf = (ownerA: string, ownerB: string): PreviewMeeting | undefined => {
  for (const year of [...YEARS].sort((a, b) => b - a)) {
    const season = seasons[year];
    const rosterA = season?.rosters?.find((r) => r.owner_id === ownerA);
    const rosterB = season?.rosters?.find((r) => r.owner_id === ownerB);
    if (!rosterA || !rosterB) continue;
    const weeks = Object.keys(season.matchups ?? {})
      .map(Number)
      .filter((w) => isWeekCompleted(w, season.league))
      .sort((a, b) => b - a);
    for (const week of weeks) {
      const sides = weekSides(season.matchups, week);
      const a = sides.find((s) => s.roster_id === rosterA.roster_id);
      const b = sides.find((s) => s.roster_id === rosterB.roster_id);
      if (!a || !b || a.matchup_id === null || a.matchup_id !== b.matchup_id) continue;
      return {
        year,
        week,
        result: a.points > b.points ? "W" : a.points < b.points ? "L" : "T",
        pointsA: a.points,
        pointsB: b.points,
        playoffs: week >= getPlayoffWeekStart(season),
        href: `/seasons/${year}/matchups/${week}/${a.matchup_id}`,
      };
    }
  }
  return undefined;
};

const COUNT_WORDS = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
];
const count = (n: number) => COUNT_WORDS[n] ?? String(n);

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/**
 * Every manager's current run and the league's longest, by the records page's
 * rules (`longest-win-streak` in `utils/stats/matchupStats.ts`): straight
 * through the playoffs and into the next season, and a tie ends it. Worked out
 * from the same stat context; `matchupPreview.test.ts` checks the record
 * against the precomputed file, so the two cannot quietly disagree.
 */
export const streakRecords = () => {
  const byManager = new Map<string, Game[]>();
  for (const game of getStatContext().games) {
    if (!game.managerId) continue;
    byManager.set(game.managerId, [...(byManager.get(game.managerId) ?? []), game]);
  }

  const current = new Map<string, { kind: "win" | "loss"; count: number }>();
  const longest = {
    win: { count: 0, managerId: "" },
    loss: { count: 0, managerId: "" },
  };
  for (const [managerId, games] of byManager) {
    games.sort((a, b) => a.year - b.year || a.week - b.week);
    let run: { kind: Game["result"]; count: number } = { kind: "tie", count: 0 };
    for (const game of games) {
      run = game.result === run.kind ? { kind: run.kind, count: run.count + 1 } : { kind: game.result, count: 1 };
      if (run.kind !== "tie" && run.count > longest[run.kind].count) {
        longest[run.kind] = { count: run.count, managerId };
      }
    }
    if (run.kind !== "tie") current.set(managerId, { kind: run.kind, count: run.count });
  }
  return { current, longest };
};


/**
 * What a result would change, as sentences. Only facts one game can decide:
 * a series that can be levelled or taken, a league-record streak one result
 * away, a round number of career wins one win away, a round number of career
 * points inside a normal week's score.
 */
const onTheLineFor = (
  a: PreviewSide,
  b: PreviewSide,
  h2h: MatchupPreview["h2h"],
  meetings: number
): string[] => {
  const lines: string[] = [];

  if (meetings === 0) {
    lines.push(`${a.name} and ${b.name} have never met in the regular season.`);
  } else if (h2h.wins === h2h.losses) {
    lines.push(
      `Level at ${h2h.wins}–${h2h.losses} all time: the winner takes the lead.`
    );
  } else if (Math.abs(h2h.wins - h2h.losses) === 1) {
    const [leader, trailer] = h2h.wins > h2h.losses ? [a, b] : [b, a];
    const high = Math.max(h2h.wins, h2h.losses);
    lines.push(
      `${leader.name} leads ${high}–${high - 1}; a ${trailer.name} win levels it at ${high}–${high}.`
    );
  }

  const { current, longest } = streakRecords();
  for (const side of [a, b]) {
    const run = side.managerId ? current.get(side.managerId) : undefined;
    if (!run || run.count < 3) continue;
    const record = longest[run.kind];
    const next = run.count + 1;
    if (next < record.count) continue;
    const result = run.kind === "win" ? "A win" : "A loss";
    const kind = run.kind === "win" ? "winning" : "losing";
    const holder = managerNames.get(record.managerId) ?? record.managerId;
    lines.push(
      record.managerId === side.managerId && run.count === record.count
        ? `${result} would stretch ${side.name}'s own record ${kind} run to ${next}.`
        : next === record.count
          ? `${result} would make it ${next} straight for ${side.name}, equalling ${holder}'s record ${kind} run.`
          : `${result} would make it ${next} straight for ${side.name}, the longest ${kind} run in Chumbo history (${holder}'s ${record.count}).`
    );
  }

  for (const side of [a, b]) {
    if (!side.managerId) continue;
    const career = getManagerStats(side.managerId, "regular");
    if (!career) continue;

    const nextWins = career.totalWins + 1;
    if (nextWins === nextWinMilestone(career.totalWins)) {
      lines.push(
        `A win would be ${side.name}'s ${ordinal(nextWins)} regular-season win.`
      );
    }

    const nextPoints = nextPointsMilestone(career.totalPointsFor);
    const short = nextPoints - career.totalPointsFor;
    // Within an ordinary week's reach: less than their average this season,
    // or the league's usual 100 before they have one.
    if (short <= (side.average || 100)) {
      lines.push(
        `${side.name} is ${short.toFixed(1)} points short of ${nextPoints.toLocaleString(
          "en-GB"
        )} regular-season points.`
      );
    }
  }

  return lines;
};

/** The form guide, as a streak worth saying: "won three straight". */
export const formStreak = (form: readonly Result[]): string | undefined => {
  const last = form[form.length - 1];
  if (!last || last === "T") return undefined;
  let run = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) run++;
  if (run < 2) return undefined;
  return `${last === "W" ? "won" : "lost"} ${count(run)} straight`;
};

/**
 * Stakes for every fixture in a week, in one simulation. Exported so the week
 * view runs it once rather than once per card.
 */
export const stakesFor = (year: number, week: number): Map<number, WeekStakes> => {
  const season = seasons[year];
  const matchups = mergeScheduledMatchups(season.matchups, season.schedule);
  if (!matchups) return new Map();
  const stakes = calculateWeekStakes(
    { matchups, rosters: season.rosters, league: season.league },
    week,
    { seed: year * 100 + week }
  );
  return new Map(stakes.map((s) => [s.rosterId, s]));
};

export const buildMatchupPreview = (
  year: number,
  week: number,
  matchupId: number,
  stakes: Map<number, WeekStakes> = stakesFor(year, week)
): MatchupPreview | null => {
  const season = seasons[year];
  const fixture = fixturesFor(year, week).find(([id]) => id === matchupId);
  if (!season || !fixture || isWeekCompleted(week, season.league)) return null;

  const side = (rosterId: number): PreviewSide => {
    const ownerId =
      season.rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? "";
    const managerId = getManagerIdBySleeperOwnerId(ownerId) ?? null;
    const teamName = getTeamName(ownerId, season.users);
    const results = resultsBefore(year, week, rosterId);
    const tally = (r: Result) => results.filter((x) => x.result === r).length;
    return {
      rosterId,
      ownerId,
      managerId,
      name: teamName,
      teamName,
      managerName: (managerId && managerNames.get(managerId)) || teamName,
      wins: tally("W"),
      losses: tally("L"),
      ties: tally("T"),
      average: results.length
        ? results.reduce((sum, r) => sum + r.points, 0) / results.length
        : 0,
      form: results.slice(-5).map((r) => r.result),
      stakes: stakes.get(rosterId),
    };
  };

  const [, rosterA, rosterB] = fixture;
  const a = side(rosterA);
  const b = side(rosterB);
  const record = getAllTimeH2HRecord(a.ownerId, b.ownerId);
  const h2h = {
    wins: record.team1Wins,
    losses: record.team2Wins,
    ties: record.ties,
    streak: describeH2HStreak(record.games, a.name, b.name),
  };

  return {
    year,
    week,
    matchupId,
    sides: [a, b],
    h2h,
    lastMeeting: lastMeetingOf(a.ownerId, b.ownerId),
    onTheLine: onTheLineFor(a, b, h2h, record.games.length),
    tidbits: seriesTidbits(a, b, week).map((tidbit) => tidbit.text),
  };
};

/** "71%", or "<1%" and ">99%" rather than a certainty the simulation cannot claim. */
export const formatOdds = (percent: number): string =>
  percent > 99.5 && percent < 100
    ? ">99%"
    : percent < 0.5 && percent > 0
      ? "<1%"
      : `${Math.round(percent)}%`;

/** "win 71% · lose 38%" — the stakes as the card and the page both print them. */
export const stakesText = (stakes: WeekStakes | undefined): string | undefined =>
  stakes
    ? `win ${formatOdds(stakes.ifWin)} · lose ${formatOdds(stakes.ifLose)}`
    : undefined;

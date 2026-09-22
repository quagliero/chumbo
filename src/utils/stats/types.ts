import type { ExtendedMatchup } from "@/types/matchup";
import type { GameFlow } from "@/utils/gameFlow";

/**
 * One team's half of one game, flattened.
 *
 * Most of the stats worth having are questions about a team-week: the biggest
 * margin, the highest-scoring loss, the worst start/sit, the longest streak.
 * Walking fifteen seasons of nested season -> week -> matchup for each of them
 * separately is both slow and repetitive, so history is flattened once into
 * this shape and every stat reads the same list.
 */
export interface Game {
  year: number;
  week: number;
  matchupId: number;

  rosterId: number;
  ownerId: string;
  /** The internal manager id (`thd`), or null when the owner is unknown. */
  managerId: string | null;
  points: number;

  opponentRosterId: number;
  opponentOwnerId: string;
  opponentManagerId: string | null;
  opponentPoints: number;

  /** Positive when this team won. */
  margin: number;
  result: "win" | "loss" | "tie";

  isPlayoff: boolean;
  isRegularSeason: boolean;

  /** The lineup, for the stats that need it. */
  starters: string[];
  startersPoints: number[];
  playersPoints: Record<string, number>;
  players: string[];

  /**
   * True where the BENCH scores are incomplete (2019 — see
   * `src/domain/dataQuality.ts`). Scores, results, starters and starters'
   * points are all correct. Any stat that reads a bench player's points — a
   * `playersPoints` entry that is not in `starters` — must set `requiresBench`
   * or `allowsIncompleteBench`, or a missing score can win a league record.
   */
  benchIncomplete: boolean;

  /**
   * False for a team-week with no opponent — an eliminated team in a playoff
   * week. Such entries appear only in `teamWeeks`, never in `games`, so this
   * is always true for anything read from `games`.
   */
  hasOpponent: boolean;

  /** The raw matchup, for anything this shape does not carry. */
  raw: ExtendedMatchup;
}

/**
 * One game as it unfolded through the NFL week (L2).
 *
 * `game` is the WINNER's half, and the flow is built with the winner as side
 * 0 — so `flow.comeback` is the deficit the winner came back from and
 * `flow.decided` is the moment they went ahead for good, with no stat having
 * to work out which side is which. A tie is here too (the league has had one),
 * as the lower roster id's half, with `flow.decided` undefined: a stat about
 * who won skips it by skipping games with nothing decided.
 */
export interface FlowGame {
  game: Game;
  flow: GameFlow;
}

/**
 * Everything a stat is given. Built once, shared by all of them.
 *
 * There are two lists because the stats genuinely want different things, and
 * conflating them silently loses data (found by C5):
 *
 *   `games`      Paired matchups only — both halves present, so there is a
 *                real opponent, margin and result. Anything about winning,
 *                losing, margins or streaks belongs here.
 *   `teamWeeks`  EVERY team-week that scored, paired or not. Once the playoff
 *                brackets are set, eliminated teams have `matchup_id: null`
 *                for the remaining weeks — they have no opponent, so they are
 *                absent from `games` — but they still set a lineup and still
 *                scored. There are 48 such team-weeks worth 4,287 points.
 *                Anything about lineups or player points belongs here, or a
 *                player's season is silently shortened by whether his owner
 *                made the playoffs.
 *
 * A `teamWeek` with no opponent has `opponentRosterId: -1`, `opponentPoints:
 * 0` and `result: "tie"`; those fields are meaningless for it, which is
 * exactly why result-shaped questions should use `games`.
 */
export interface StatContext {
  games: Game[];
  teamWeeks: Game[];
  years: number[];
  /**
   * Every game whose week has a committed timeline, or an empty list
   * where none have been provided (`provideTimelines` in `./traverse`). A stat
   * that reads this must declare `requiresTimelines`, which makes the empty
   * case throw rather than quietly answer with no records at all.
   */
  flows: FlowGame[];
}

/**
 * One row of a stat's answer.
 *
 * A record ("biggest margin ever") and an aggregate ("bench points per
 * manager") are the same shape — a ranked list of entries — so one type serves
 * the records pages, the Explorer, the narrative engine (E7) and the share
 * cards (G4) without each needing its own adapter. A single-value stat is a
 * list of one.
 */
export interface StatEntry {
  /** The number the stat ranks on. */
  value: number;
  /** Who or what this entry is about — a manager id, a player name, a team. */
  subject: string;
  /** Where to go to see it. Omitted when there is nothing to link to. */
  href?: string;
  /** The context that makes it a story: "2019 Week 6 vs htc". */
  detail?: string;
  /**
   * True when this entry's value rests on 2019's incomplete bench scores — set
   * by the registry for stats that declare `allowsIncompleteBench`. The UI
   * should mark these rather than hide them.
   */
  approximate?: boolean;
  year?: number;
  week?: number;
}

export type StatScope = "league" | "manager" | "season" | "player";
export type StatFormat = "points" | "count" | "percent" | "record";

export interface StatDefinition {
  /** Stable, kebab-case. Used in URLs and as the registry key. */
  id: string;
  label: string;
  /** One sentence, shown under the label. Write it for a league member. */
  description: string;
  scope: StatScope;
  format: StatFormat;
  /** Whether a bigger number is the more notable one. Drives default sorting. */
  direction: "high" | "low";
  /**
   * Set when the stat reads bench players' points. Seasons whose bench scores
   * are incomplete are then excluded before `compute` sees them, so a missing
   * score cannot win "worst start/sit in Chumbo history". A stat that reads
   * only starters does not need it: 2019's starters are right.
   */
  requiresBench?: boolean;
  /**
   * Set when the stat reads bench points but an incomplete bench is good enough
   * for what it measures. Those seasons are included, and every entry from one
   * is marked `approximate` so the UI can caveat it.
   *
   * The distinction is what the stat ranks. "Worst start/sit" ranks a single
   * bench decision, so one missing score decides the record and 2019 must sit
   * out. The draft stats rank a player's whole season on a roster, where 2019
   * is within the normal spread of every season around it, and excluding it
   * loses a whole draft to protect a number it would not have changed.
   *
   * Mutually exclusive with `requiresBench`.
   */
  allowsIncompleteBench?: boolean;
  /**
   * Set when the stat reads `flows` — the week's play-by-play timelines, which
   * are not part of the season data and have to be provided (`provideTimelines`).
   * The registry then refuses to answer with an empty list when they are
   * absent, which would otherwise look exactly like a league with no comebacks.
   */
  requiresTimelines?: boolean;
  /**
   * Keep EVERY entry in `all-time.json`, not the top 25. For a stat whose page
   * picks by something the build cannot know — `on-this-day` picks by the
   * reader's date, and the file is built three times a week — the top 25 is
   * the wrong 25 on most days.
   */
  precomputeAll?: boolean;
  compute: (context: StatContext) => StatEntry[];
}

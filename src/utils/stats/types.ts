import type { ExtendedMatchup } from "@/types/matchup";

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
   * True where the per-player data is a reconstruction rather than a record
   * (2019 — see `src/domain/dataQuality.ts`). Team scores are still correct;
   * it is only the lineup breakdown that is inferred. Any stat that reads
   * `starters` or `playersPoints` must set `requiresLineups` so these are
   * excluded, or an inferred score can win a league record.
   */
  lineupsApproximate: boolean;

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
   * True when this entry's value rests on reconstructed per-player data — set
   * by the registry for stats that declare `allowsApproximateLineups`. The UI
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
   * Set when the stat reads `starters` or `playersPoints`. Seasons whose lineup
   * data is a reconstruction are then excluded before `compute` sees them, so
   * an inferred score cannot win "worst start/sit in Chumbo history".
   */
  requiresLineups?: boolean;
  /**
   * Set when the stat reads lineup data but a reconstruction is good enough for
   * what it measures. Those seasons are included, and every entry from one is
   * marked `approximate` so the UI can caveat it.
   *
   * The distinction is what the stat ranks. "Worst start/sit" ranks a single
   * lineup decision, so one inferred score decides the record and 2019 must sit
   * out. The draft stats rank a player's whole season on a roster, where 2019
   * is within the normal spread of every season around it, and excluding it
   * loses a whole draft to protect a number it would not have changed.
   *
   * Mutually exclusive with `requiresLineups`.
   */
  allowsApproximateLineups?: boolean;
  compute: (context: StatContext) => StatEntry[];
}

/**
 * Shared types for the manager stats calculation.
 *
 * The public shapes (`ManagerStats` and everything it contains) are re-exported
 * from `index.ts`, so `@/utils/managerStats` keeps exporting exactly what it
 * always has.
 */

export type DataMode = "regular" | "playoffs" | "combined";

/**
 * A season's raw JSON as it comes off `seasons[year]`.
 *
 * `src/data/index.ts` does not export its `SeasonData` type yet (H3), so these
 * helpers keep the `any` the original file used — but behind one named alias
 * instead of a fresh `eslint-disable` at every signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SeasonData = any;

export interface AllStarSlot {
  position: string;
  player?: {
    playerId: string;
    playerName: string;
    totalPoints: number;
    averagePoints: number;
    games: number;
  };
}

export interface MostDraftedPlayer {
  playerId: string;
  playerName: string;
  timesDrafted: number;
  years: number[];
  bestPick: {
    year: number;
    round: number;
    pick: number;
  };
}

export interface MostCappedPlayer {
  playerId: string;
  playerName: string;
  starts: number;
  years: number[];
  averageScore: number;
}

export interface TopPerformance {
  playerId: string;
  playerName: string;
  year: number;
  week: number;
  points: number;
  result: "W" | "L" | "T";
  opponentName: string;
  matchup_id: number;
}

export interface ManagerStats {
  managerId: string;
  managerName: string;
  teamName: string;

  // Overall records
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPointsFor: number;
  totalPointsAgainst: number;

  // League-wide performance (vs everyone each week)
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;

  // Per-season breakdown
  seasonStats: SeasonStats[];

  // H2H records against other managers
  h2hRecords: Record<string, ManagerH2HRecord>;

  // Achievements
  championships: number;
  runnerUps: number;
  thirdPlace: number;
  scoringCrowns: number;
  firstPlaceStandings: number;
  playoffs: number;

  // Best seasons
  bestWinsSeason: { year: number; wins: number };
  bestPointsSeason: { year: number; points: number };

  // Player stats
  allStarLineup: AllStarSlot[];
  mostDraftedPlayers: MostDraftedPlayer[];
  mostCappedPlayers: MostCappedPlayer[];
  topPerformances: TopPerformance[];
}

export interface SeasonStats {
  year: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;
  finalStanding: number;
  pointsStanding: number;
  championshipResult?: "champion" | "runner-up" | "third-place";
  scoringCrown?: boolean;
  madePlayoffs?: boolean;
}

export interface ManagerH2HRecord {
  managerId: string;
  managerName: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  currentStreak: {
    type: "W" | "L" | "T";
    count: number;
  };
  mostRecent: {
    year: number;
    week: number;
    result: "W" | "L" | "T";
    pointsFor: number;
    pointsAgainst: number;
  } | null;
}

/** A single completed game against one opponent, kept for streak calculation. */
export interface H2HGame {
  opponentId: string;
  year: number;
  week: number;
  result: "W" | "L" | "T";
  pointsFor: number;
  pointsAgainst: number;
}

/** One started appearance by a player, in the manager's lineup. */
export interface PlayerScore {
  score: number;
  year: number;
  week: number;
  result: string;
  opponentName: string;
  matchup_id: number;
}

/** Every start this manager has given one player, accumulated across seasons. */
export interface PlayerPerformance {
  playerId: string;
  playerName: string;
  totalPoints: number;
  games: number;
  allScores: PlayerScore[];
}

/** One draft pick the manager used on a player. */
export interface DraftPick {
  year: number;
  round: number;
  pick: number;
}

/**
 * The per-player history accumulated while walking the seasons: who the manager
 * started (keyed by player id) and who they drafted.
 *
 * Both maps are order-sensitive — the "most capped" and "top performance" lists
 * are sorted with `Array#sort`, which is stable, so insertion order is the
 * tiebreak. Insertion order is season-ascending, then week order within a
 * season, then lineup slot order.
 */
export interface PlayerHistory {
  playerPerformances: Map<string, PlayerPerformance>;
  draftHistory: Map<string, DraftPick[]>;
}

/**
 * The three kinds of top score the page ranks, one per sub-tab. Shared by the
 * computation (`rankings.ts` and the three per-mode modules) and the cards.
 */

export type ScoreMode = "team-score" | "match-total" | "player-score";
export type SortOrder = "high-to-low" | "low-to-high";

export interface TopScore {
  owner_id: string;
  manager_name: string;
  team_name: string;
  year: number;
  week: number;
  score: number;
  opponent_id: string;
  opponent_name: string;
  matchup_id: number;
}

export interface MatchTotal {
  year: number;
  week: number;
  matchup_id: number;
  team1_id: string;
  team1_name: string;
  team1_score: number;
  team2_id: string;
  team2_name: string;
  team2_score: number;
  total_score: number;
}

export interface PlayerScore {
  player_id: string;
  player_name: string;
  position: string;
  year: number;
  week: number;
  score: number;
  owner_id: string;
  manager_name: string;
  team_name: string;
  matchup_id: number;
  was_started: boolean;
  is_playoff: boolean;
  is_championship: boolean;
}

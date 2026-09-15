export interface Matchup {
  matchup_id: number;
  roster_id: number;
  points: number;
  starters: string[];
  players: (string | number)[];
  user_id: string;
}

// A regular season pairing from schedule.json (who plays whom, before scores exist)
export type ScheduledMatchup = Pick<Matchup, "matchup_id" | "roster_id">;

export interface ExtendedMatchup extends Matchup {
  custom_points: number | null;
  starters_points: number[];
  players_points: {
    [key: string]: number;
  };
  unmatched_players?: {
    [key: string]: string;
  };
}

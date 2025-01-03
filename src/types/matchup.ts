export interface Matchup {
  matchup_id: number;
  roster_id: number;
  points: number;
  starters: string[];
  players: (string | number)[];
  user_id: string;
}

export interface ExtendedMatchup extends Matchup {
  custom_points: number | null;
  starters_points: number[];
  players_points: {
    [key: string]: number;
  };
}

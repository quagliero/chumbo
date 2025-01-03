export interface Roster {
  league_id: string;
  owner_id: string;
  roster_id: number;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
    total_moves: number;
  };
  players: (string | number)[];
  metadata: {
    record: string;
  };
  starters: (string | number)[];
}

export interface ExtendedRoster extends Roster {
  co_owners: string[] | null;
  keepers: string[] | null;
  metadata: Roster["metadata"] & {
    [key: string]: string | undefined;
    allow_pn_player_injury_status?: string;
    allow_pn_scoring?: string;
    restrict_pn_scoring_starters_only?: string;
    allow_pn_news?: string;
    allow_pn_inactive_starters?: string;
    streak?: string;
  };
}

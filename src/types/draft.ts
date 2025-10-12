export interface Draft {
  type: string;
  status: string;
  start_time: number;
  sport: string;
  season_type: string;
  season: string;
  metadata: {
    scoring_type: string;
    name: string;
  };
  league_id: string;
  settings: {
    teams: number;
    rounds: number;
    slots_wr: number;
    slots_te: number;
    slots_rb: number;
    slots_qb: number;
    slots_k: number;
    slots_flex: number;
    slots_def: number;
    slots_bn: number;
    reversal_round: number;
  };
  draft_order: {
    [key: string]: number;
  };
  slot_to_roster_id: {
    [key: string]: number;
  };
}

export interface ExtendedDraft extends Draft {
  created: number;
  creators: string[];
  draft_id: string;
  last_message_id: string;
  last_message_time: number;
  last_picked: number;
  settings: Draft["settings"] & {
    alpha_sort: number;
    cpu_autopick: number;
    pick_timer: number;
    player_type: number;
    rounds: number;
    slots_bn: number;
    slots_def: number;
    slots_flex: number;
    slots_k: number;
    slots_qb: number;
    slots_rb: number;
    slots_te: number;
    slots_wr: number;
    teams: number;
  };
}

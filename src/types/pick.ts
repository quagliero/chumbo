export interface Pick {
  round: number;
  pick_no: number;
  picked_by: string;
  draft_slot: number;
  player_id: string;
  roster_id: number;
  position?: string;
}

export interface ExtendedPick extends Pick {
  draft_id: string;
  is_keeper: boolean | null;
  metadata: {
    first_name: string;
    injury_status: string;
    last_name: string;
    news_updated: string;
    number: string;
    player_id: string;
    position: string;
    sport: string;
    status: string;
    team: string;
    years_exp: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reactions: any | null;
}

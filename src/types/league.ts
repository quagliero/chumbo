export type RosterPosition =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "FLEX"
  | "K"
  | "DEF"
  | "BN";

export interface League {
  status: string;
  sport: string;
  season_type: string;
  season: string;
  name: string;
  draft_id: string;
  league_id: string;
  previous_league_id: string | null;
  bracket_id: string;
  loser_bracket_id: string;
  settings: {
    playoff_type: number;
    daily_waivers: number;
    playoff_seed_type: number;
    start_week: number;
    divisions: number;
    playoff_teams: number;
    num_teams: number;
    playoff_week_start?: number;
  };
  total_rosters: number;
  roster_positions: RosterPosition[];
  metadata?: {
    [key: string]: string | undefined;
    division_1?: string;
    division_2?: string;
    division_3?: string;
    division_4?: string;
    division_1_avatar?: string;
    division_2_avatar?: string;
    division_3_avatar?: string;
    division_4_avatar?: string;
  };
  scoring_settings: {
    blk_kick: number;
    def_2pt: number;
    def_kr_td: number;
    def_pr_td: number;
    def_st_ff: number;
    def_st_fum_rec: number;
    def_st_td: number;
    def_td: number;
    ff: number;
    fgm_0_19: number;
    fgm_20_29: number;
    fgm_30_39: number;
    fgm_40_49: number;
    fgm_50p: number;
    fgmiss_0_19: number;
    fgmiss_20_29: number;
    fgmiss: number;
    fum_lost: number;
    fum_rec: number;
    fum: number;
    int: number;
    pass_2pt: number;
    pass_int: number;
    pass_td: number;
    pass_yd: number;
    pts_allow_0: number;
    pts_allow_1_6: number;
    pts_allow_14_20: number;
    pts_allow_21_27: number;
    pts_allow_28_34: number;
    pts_allow_35p: number;
    pts_allow_7_13: number;
    rec_2pt: number;
    rec_td: number;
    rec_yd: number;
    rec: number;
    rush_2pt: number;
    rush_td: number;
    rush_yd: number;
    sack: number;
    safe: number;
    st_ff: number;
    st_fum_rec: number;
    st_td: number;
    xpm: number;
    xpmiss: number;
  };
}

export interface ExtendedLeague extends League {
  shard: number;
  settings: League["settings"] & {
    max_keepers: number;
    draft_rounds: number;
    trade_review_days: number;
    reserve_allow_dnr: number;
    capacity_override: number;
    pick_trading: number;
    taxi_years: number;
    taxi_allow_vets: number;
    last_report: number;
    disable_adds: number;
    waiver_type: number;
    bench_lock: number;
    reserve_allow_sus: number;
    type: number;
    reserve_allow_cov: number;
    waiver_clear_days: number;
    daily_waivers_last_ran: number;
    waiver_day_of_week: number;
    reserve_slots: number;
    playoff_round_type: number;
    daily_waivers_hour: number;
    waiver_budget: number;
    reserve_allow_out: number;
    offseason_adds: number;
    last_scored_leg: number;
    playoff_week_start: number;
    daily_waivers_days: number;
    league_average_match: number;
    leg: number;
    trade_deadline: number;
    reserve_allow_doubtful: number;
    taxi_deadline: number;
    reserve_allow_na: number;
    taxi_slots: number;
  };
  scoring_settings: League["scoring_settings"] & {
    tkl_loss: number;
    fgm_yds: number;
    pts_allow: number;
  };
}

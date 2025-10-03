export interface Player {
  player_id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  team?: string | null;
  position?: string;
  fantasy_positions?: string[];
  number?: number;
  age?: number;
  height?: string;
  weight?: string;
  college?: string;
  high_school?: string;
  birth_date?: string;
  years_exp?: number;
  status?: string;
  injury_status?: string | null;
  depth_chart_position?: string | null;
  depth_chart_order?: number | null;
  team_abbr?: string | null;
  sport?: string;
  active?: boolean;
  // Additional metadata fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

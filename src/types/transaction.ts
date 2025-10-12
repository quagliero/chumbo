export interface DraftPickTransaction {
  round: number;
  season: string;
  league_id: string | null;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export interface WaiverBudgetTransaction {
  amount: number;
  receiver: number;
  sender: number;
}

export interface Transaction {
  status: "complete" | "failed" | string;
  type: "trade" | "waiver" | "free_agent" | string;
  metadata: { notes?: string } | null;
  created: number; // timestamp
  settings: { expires_at?: number; seq?: number; waiver_bid?: number } | null;
  leg: number; // week number
  draft_picks: DraftPickTransaction[];
  creator: string;
  transaction_id: string;
  adds: Record<string, number> | null; // player_id -> roster_id
  consenter_ids: number[];
  drops: Record<string, number> | null; // player_id -> roster_id
  roster_ids: number[];
  status_updated: number; // timestamp
  waiver_budget: WaiverBudgetTransaction[];
}

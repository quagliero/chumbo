import { Transaction } from "@/types/transaction";
import { Player } from "@/types/player";
import { getPlayer } from "@/data";
import { getPlayerPosition } from "@/utils/playerDataUtils";

export interface TradeAssets {
  players: Array<{
    playerId: string;
    player: Player | undefined;
    rosterId: number;
  }>;
  draftPicks: Array<{
    round: number;
    season: string;
    rosterId: number;
    pickNumber: number;
    overallPickNumber: number;
  }>;
  waiverBudget: Array<{
    amount: number;
    rosterId: number;
  }>;
}

export interface TradeSummary {
  transaction: Transaction;
  teams: Array<{
    rosterId: number;
    gives: TradeAssets;
    receives: TradeAssets;
  }>;
  isDraftPickTrade: boolean;
  formattedDate: string;
}

/**
 * Filter completed trade transactions
 */
export function getCompletedTrades(transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (transaction) =>
      transaction.status === "complete" && transaction.type === "trade"
  );
}

/**
 * Check if a trade involves draft picks
 */
export function isDraftPickTrade(transaction: Transaction): boolean {
  return transaction.draft_picks.length > 0;
}

/**
 * Format trade date based on type
 */
export function formatTradeDate(
  transaction: Transaction,
  draftStartTime?: number
): string {
  const date = new Date(transaction.created);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (isDraftPickTrade(transaction)) {
    if (!draftStartTime) {
      return `Pre-Draft, ${formattedDate}`;
    }

    const draftStartDate = new Date(draftStartTime);
    const tradeDate = new Date(transaction.created);

    // Check if same day
    const isSameDay =
      tradeDate.getFullYear() === draftStartDate.getFullYear() &&
      tradeDate.getMonth() === draftStartDate.getMonth() &&
      tradeDate.getDate() === draftStartDate.getDate();

    if (tradeDate < draftStartDate) {
      if (isSameDay) {
        return `Draft Day, ${formattedDate}`;
      } else {
        return `Pre-Draft, ${formattedDate}`;
      }
    } else {
      if (isSameDay) {
        return `During Draft, ${formattedDate}`;
      } else {
        return `Post-Draft, ${formattedDate}`;
      }
    }
  } else {
    return `Week ${transaction.leg}`;
  }
}

/**
 * Calculate pick number from round and roster_id
 */
function calculatePickNumber(
  round: number,
  rosterId: number,
  slotToRosterId: Record<string, number>
): number {
  // Find the slot number for this roster_id
  const slotNumber = Object.entries(slotToRosterId).find(
    ([, slotRosterId]) => slotRosterId === rosterId
  )?.[0];
  if (!slotNumber) return round * 100; // Fallback for unknown roster

  const slot = parseInt(slotNumber);
  const totalTeams = Object.keys(slotToRosterId).length;

  // Snake draft calculation
  if (round % 2 === 1) {
    // Odd rounds: slot order is 1, 2, 3, ..., 12
    return slot;
  } else {
    // Even rounds: slot order is reversed 12, 11, 10, ..., 1
    return totalTeams - slot + 1;
  }
}

/**
 * Calculate overall pick number from round and slot
 */
function calculateOverallPickNumber(
  round: number,
  slot: number,
  totalTeams: number
): number {
  if (round === 1) {
    return slot;
  }

  // For subsequent rounds, calculate based on snake draft
  let overallPick = 0;
  for (let r = 1; r < round; r++) {
    overallPick += totalTeams;
  }

  if (round % 2 === 1) {
    // Odd rounds: slot order is 1, 2, 3, ..., 12
    overallPick += slot;
  } else {
    // Even rounds: slot order is reversed 12, 11, 10, ..., 1
    overallPick += totalTeams - slot + 1;
  }

  return overallPick;
}

/**
 * Group trade assets by team
 */
export function groupTradeAssetsByTeam(
  transaction: Transaction,
  year: number,
  slotToRosterId?: Record<string, number>,
  draftStartTime?: number
): TradeSummary {
  const isDraftPickTrade = transaction.draft_picks.length > 0;

  // Get all teams involved
  const rosterIds = transaction.roster_ids;

  // Initialize teams array
  const teams = rosterIds.map((rosterId) => ({
    rosterId,
    gives: {
      players: [],
      draftPicks: [],
      waiverBudget: [],
    } as TradeAssets,
    receives: {
      players: [],
      draftPicks: [],
      waiverBudget: [],
    } as TradeAssets,
  }));

  // Helper to get player with fallback to unmatched_players
  const getPlayerWithFallback = (playerId: string) => {
    // Get unmatched_players (either at root or in metadata)
    // Check metadata first (for 2012 data), then root level
    const unmatchedPlayers =
      transaction.metadata &&
      typeof transaction.metadata === "object" &&
      "unmatched_players" in transaction.metadata &&
      transaction.metadata.unmatched_players
        ? (transaction.metadata.unmatched_players as Record<string, string>)
        : transaction.unmatched_players;

    // Get player using standard lookup
    let player = getPlayer(playerId, year);

    // Get position using shared utility that handles unmatched_players
    const position = getPlayerPosition(
      playerId,
      year,
      undefined,
      unmatchedPlayers
    );

    // If player not found but we have position from unmatched_players, create player object
    if (!player && position && position !== "UNK") {
      const nameParts = playerId.includes(" ")
        ? playerId.split(" ")
        : [playerId, ""];

      player = {
        player_id: playerId,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(" ") || "",
        full_name: playerId,
        position: position,
        team: null,
        active: false,
        sport: "nfl",
        fantasy_positions: [position],
        injury_status: null,
        weight: undefined,
        height: undefined,
        age: undefined,
        years_exp: undefined,
        birth_date: undefined,
        college: undefined,
        hashtag: undefined,
        depth_chart_order: null,
        number: undefined,
        search_full_name: playerId.toLowerCase(),
        search_first_name: nameParts[0].toLowerCase(),
        search_last_name: nameParts.slice(1).join(" ").toLowerCase(),
        search_rank: undefined,
        injury_notes: undefined,
        practice_participation: undefined,
        injury_body_part: undefined,
        injury_start_date: undefined,
        injury_notes_id: undefined,
        practice_description: undefined,
        news_updated: undefined,
        stats_id: undefined,
        swish_id: undefined,
        gsis_id: undefined,
        espn_id: undefined,
        yahoo_id: undefined,
        rotowire_id: undefined,
        rotoworld_id: undefined,
        fantasy_data_id: undefined,
        sleeper_id: undefined,
        pff_id: undefined,
        pfr_id: undefined,
        fantasypros_id: undefined,
        team_abbr: null,
        oddsjam_id: undefined,
        sportradar_id: undefined,
        high_school: undefined,
        birth_city: undefined,
        birth_state: undefined,
        birth_country: undefined,
        team_changed_at: undefined,
        competitions: [],
        metadata: null,
      };
    } else if (
      player &&
      position &&
      position !== "UNK" &&
      player.position === "UNK"
    ) {
      // Update existing player with position from unmatched_players
      player = {
        ...player,
        position: position,
        fantasy_positions: [position],
      };
    }

    return player;
  };

  // Process player trades (adds/drops)
  if (transaction.adds) {
    Object.entries(transaction.adds).forEach(([playerId, rosterId]) => {
      const player = getPlayerWithFallback(playerId);

      if (transaction.drops && transaction.drops[playerId]) {
        const previousRosterId = transaction.drops[playerId];

        // Find teams involved
        const givingTeam = teams.find((t) => t.rosterId === previousRosterId);
        const receivingTeam = teams.find((t) => t.rosterId === rosterId);

        if (givingTeam) {
          givingTeam.gives.players.push({
            playerId,
            player,
            rosterId: previousRosterId,
          });
        }
        if (receivingTeam) {
          receivingTeam.receives.players.push({ playerId, player, rosterId });
        }
      }
    });
  }

  if (transaction.drops) {
    Object.entries(transaction.drops).forEach(([playerId, rosterId]) => {
      const player = getPlayerWithFallback(playerId);

      if (!transaction.adds || !transaction.adds[playerId]) {
        // Player was dropped but not picked up (shouldn't happen in trades)
        const givingTeam = teams.find((t) => t.rosterId === rosterId);
        if (givingTeam) {
          givingTeam.gives.players.push({ playerId, player, rosterId });
        }
      }
    });
  }

  // Process draft pick trades
  transaction.draft_picks.forEach((pick) => {
    const pickNumber = slotToRosterId
      ? calculatePickNumber(pick.round, pick.roster_id, slotToRosterId)
      : pick.round * 100;

    const slotNumber = slotToRosterId
      ? Object.entries(slotToRosterId).find(
          ([, slotRosterId]) => slotRosterId === pick.roster_id
        )?.[0]
      : "1";
    const slot = slotNumber ? parseInt(slotNumber) : 1;
    const totalTeams = slotToRosterId ? Object.keys(slotToRosterId).length : 12;
    const overallPickNumber = calculateOverallPickNumber(
      pick.round,
      slot,
      totalTeams
    );

    const pickData = {
      round: pick.round,
      season: pick.season,
      rosterId: pick.roster_id,
      pickNumber,
      overallPickNumber,
    };

    // Find teams involved in draft pick trade
    const givingTeam = teams.find((t) => t.rosterId === pick.previous_owner_id);
    const receivingTeam = teams.find((t) => t.rosterId === pick.owner_id);

    if (givingTeam) {
      givingTeam.gives.draftPicks.push(pickData);
    }
    if (receivingTeam) {
      receivingTeam.receives.draftPicks.push(pickData);
    }
  });

  // Process waiver budget trades
  transaction.waiver_budget.forEach((budget) => {
    const budgetData = {
      amount: budget.amount,
      rosterId: budget.receiver,
    };

    // Find teams involved in waiver budget trade
    const givingTeam = teams.find((t) => t.rosterId === budget.sender);
    const receivingTeam = teams.find((t) => t.rosterId === budget.receiver);

    if (givingTeam) {
      givingTeam.gives.waiverBudget.push(budgetData);
    }
    if (receivingTeam) {
      receivingTeam.receives.waiverBudget.push(budgetData);
    }
  });

  return {
    transaction,
    teams,
    isDraftPickTrade,
    formattedDate: formatTradeDate(transaction, draftStartTime),
  };
}

/**
 * Get all trades for a season with filtering options
 */
export function getSeasonTrades(
  transactions: Record<string, Transaction[]> | undefined,
  filters?: {
    tradeType?: "all" | "player" | "draft";
    teamIds?: number[];
  },
  slotToRosterId?: Record<string, number>,
  draftStartTime?: number,
  year?: number
): TradeSummary[] {
  if (!transactions) return [];

  const allTrades: TradeSummary[] = [];

  // Collect all trades from all weeks
  Object.entries(transactions).forEach(([, weekTransactions]) => {
    const completedTrades = getCompletedTrades(weekTransactions);

    completedTrades.forEach((transaction) => {
      const tradeSummary = groupTradeAssetsByTeam(
        transaction,
        year || 0,
        slotToRosterId,
        draftStartTime
      );

      // Apply filters
      if (filters) {
        if (filters.tradeType === "player" && tradeSummary.isDraftPickTrade) {
          return;
        }
        if (filters.tradeType === "draft" && !tradeSummary.isDraftPickTrade) {
          return;
        }
        if (filters.teamIds && filters.teamIds.length > 0) {
          const involvedTeams = tradeSummary.teams.map((team) => team.rosterId);
          if (
            !filters.teamIds.every((teamId) => involvedTeams.includes(teamId))
          ) {
            return;
          }
        }
      }

      allTrades.push(tradeSummary);
    });
  });

  // Sort by date (most recent first)
  return allTrades.sort(
    (a, b) => b.transaction.created - a.transaction.created
  );
}

/**
 * Get trades for a specific week
 */
export function getWeekTrades(
  weekTransactions: Transaction[] | undefined,
  year: number,
  slotToRosterId?: Record<string, number>,
  draftStartTime?: number
): TradeSummary[] {
  if (!weekTransactions) return [];

  const completedTrades = getCompletedTrades(weekTransactions);

  return completedTrades
    .map((transaction) =>
      groupTradeAssetsByTeam(transaction, year, slotToRosterId, draftStartTime)
    )
    .sort((a, b) => b.transaction.created - a.transaction.created);
}

import { Transaction } from "@/types/transaction";
import { Player } from "@/types/player";
import { getPlayer } from "@/data";

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

  // Process player trades (adds/drops)
  if (transaction.adds) {
    Object.entries(transaction.adds).forEach(([playerId, rosterId]) => {
      const player = getPlayer(playerId, year);

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
      const player = getPlayer(playerId, year);

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
  draftStartTime?: number
): TradeSummary[] {
  if (!transactions) return [];

  const allTrades: TradeSummary[] = [];

  // Collect all trades from all weeks
  Object.entries(transactions).forEach(([, weekTransactions]) => {
    const completedTrades = getCompletedTrades(weekTransactions);

    completedTrades.forEach((transaction) => {
      const tradeSummary = groupTradeAssetsByTeam(
        transaction,
        0,
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

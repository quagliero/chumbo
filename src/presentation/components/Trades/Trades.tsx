import { useState, useMemo } from "react";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { Transaction } from "@/types/transaction";
import { getSeasonTrades } from "@/utils/transactionUtils";
import TradeCard from "@/presentation/components/TradeCard";

interface TradesProps {
  transactions: Record<string, Transaction[]> | undefined;
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  year: number;
  users?: ExtendedUser[];
  slotToRosterId?: Record<string, number>;
  draftStartTime?: number;
}

const Trades = ({
  transactions,
  rosters,
  getTeamName,
  users,
  slotToRosterId,
  draftStartTime,
}: TradesProps) => {
  const [tradeTypeFilter, setTradeTypeFilter] = useState<
    "all" | "player" | "draft"
  >("all");
  const [selectedTeams, setSelectedTeams] = useState<number[]>([]);

  // Get all trades with current filters
  const filteredTrades = useMemo(() => {
    return getSeasonTrades(
      transactions,
      {
        tradeType: tradeTypeFilter,
        teamIds: selectedTeams.length > 0 ? selectedTeams : undefined,
      },
      slotToRosterId,
      draftStartTime
    );
  }, [
    transactions,
    tradeTypeFilter,
    selectedTeams,
    slotToRosterId,
    draftStartTime,
  ]);

  // Get unique team IDs for filter
  const availableTeams = useMemo(() => {
    const teamIds = new Set<number>();
    if (transactions) {
      Object.values(transactions).forEach((weekTransactions) => {
        weekTransactions.forEach((transaction) => {
          if (
            transaction.status === "complete" &&
            transaction.type === "trade"
          ) {
            transaction.roster_ids.forEach((rosterId) => teamIds.add(rosterId));
          }
        });
      });
    }
    return Array.from(teamIds).sort();
  }, [transactions]);

  const handleTeamToggle = (rosterId: number) => {
    setSelectedTeams((prev) =>
      prev.includes(rosterId)
        ? prev.filter((id) => id !== rosterId)
        : [...prev, rosterId]
    );
  };

  const clearTeamFilters = () => {
    setSelectedTeams([]);
  };

  return (
    <div className="space-y-6 container mx-auto">
      {/* Filters */}
      <div className="space-y-4">
        {/* Trade Type Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Trade Type
          </label>
          <div className="flex gap-2">
            {[
              { value: "all", label: "All Trades" },
              { value: "player", label: "Player Trades" },
              { value: "draft", label: "Draft Pick Trades" },
            ].map(({ value, label }) => (
              <button
                key={value}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  tradeTypeFilter === value
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
                onClick={() =>
                  setTradeTypeFilter(value as "all" | "player" | "draft")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Team Filter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Teams ({selectedTeams.length} selected)
            </label>
            {selectedTeams.length > 0 && (
              <button
                onClick={clearTeamFilters}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTeams.map((rosterId) => {
              const roster = rosters.find((r) => r.roster_id === rosterId);
              const teamName = roster
                ? getTeamName(roster.owner_id)
                : `Team ${rosterId}`;
              const isSelected = selectedTeams.includes(rosterId);

              return (
                <button
                  key={rosterId}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-blue-800 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                  onClick={() => handleTeamToggle(rosterId)}
                >
                  {teamName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredTrades.length} trade
        {filteredTrades.length !== 1 ? "s" : ""}
        {tradeTypeFilter !== "all" && ` (${tradeTypeFilter} trades only)`}
        {selectedTeams.length > 0 && ` involving selected teams`}
      </div>

      {/* Trades Grid */}
      {filteredTrades.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrades.map((trade, index) => (
            <TradeCard
              key={`${trade.transaction.transaction_id}-${index}`}
              trade={trade}
              rosters={rosters}
              users={users}
              getTeamName={getTeamName}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-2">No trades found</div>
          <div className="text-gray-400 text-sm">
            {tradeTypeFilter !== "all" || selectedTeams.length > 0
              ? "Try adjusting your filters to see more trades"
              : "No trades have been recorded for this season"}
          </div>
        </div>
      )}
    </div>
  );
};

export default Trades;

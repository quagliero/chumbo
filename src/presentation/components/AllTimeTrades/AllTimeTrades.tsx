import { useState, useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { seasons, managers } from "@/data";
import { getSeasonTrades, TradeSummary } from "@/utils/transactionUtils";
import { getTeamName } from "@/utils/teamName";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../Table";
import { getPlayerName } from "@/utils/playerDataUtils";

// Get the most recent season's active teams
const mostRecentSeason = Object.entries(seasons).sort(
  (a, b) => Number(b[0]) - Number(a[0])
)[0][1];
const activeTeamIds = new Set(
  mostRecentSeason.rosters.map((roster) => roster.owner_id.toString())
);

interface TeamTradeStats {
  owner_id: string;
  team_name: string;
  totalTrades: number;
  playerTrades: number;
  draftTrades: number;
}

interface PlayerTradeStats {
  playerId: string;
  playerName: string;
  tradeCount: number;
  yearsTraded: string;
}

interface ManagerTradePair {
  manager1Id: string;
  manager1Name: string;
  manager1TeamName: string;
  manager2Id: string;
  manager2Name: string;
  manager2TeamName: string;
  tradeCount: number;
  years: string;
}

const AllTimeTrades = () => {
  const [showOnlyActiveTeams, setShowOnlyActiveTeams] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [view, setView] = useState<"teams" | "players" | "managers">("teams");
  const [selectedManager, setSelectedManager] = useState<string | null>(null);

  // Memoize all available years to avoid recreating the array
  const allAvailableYears = useMemo(
    () => Object.keys(seasons).map((year) => Number(year)),
    []
  );

  const years = useMemo(() => {
    return selectedYears.length === 0 ? allAvailableYears : selectedYears;
  }, [selectedYears, allAvailableYears]);

  // Collect all trades across all years with year tracking
  const allTrades = useMemo(() => {
    const trades: Array<TradeSummary & { year: number }> = [];

    years.forEach((year) => {
      const seasonData = seasons[year];
      if (!seasonData?.transactions) return;

      const seasonTrades = getSeasonTrades(
        seasonData.transactions,
        undefined,
        seasonData.draft?.slot_to_roster_id,
        seasonData.draft?.start_time,
        year
      );

      trades.push(...seasonTrades.map((trade) => ({ ...trade, year })));
    });

    return trades;
  }, [years]);

  // Calculate team trade stats
  const teamStats = useMemo(() => {
    const stats = new Map<string, TeamTradeStats>();

    allTrades.forEach((trade) => {
      const tradeYear = trade.year;
      const seasonData = seasons[tradeYear];
      if (!seasonData?.rosters) return;

      trade.teams.forEach((team) => {
        const roster = seasonData.rosters.find(
          (r) => r.roster_id === team.rosterId
        );
        const ownerId = roster?.owner_id;
        if (!ownerId) return;

        const managerId = getManagerIdBySleeperOwnerId(ownerId);
        if (!managerId) return;

        if (!stats.has(managerId)) {
          stats.set(managerId, {
            owner_id: ownerId,
            team_name: getTeamName(ownerId),
            totalTrades: 0,
            playerTrades: 0,
            draftTrades: 0,
          });
        }

        const teamStat = stats.get(managerId)!;
        teamStat.totalTrades++;
        if (trade.isDraftPickTrade) {
          teamStat.draftTrades++;
        } else {
          teamStat.playerTrades++;
        }
      });
    });

    let results = Array.from(stats.values());

    if (showOnlyActiveTeams) {
      results = results.filter((stat) => activeTeamIds.has(stat.owner_id));
    }

    // Create a new sorted array (don't mutate)
    return [...results].sort((a, b) => b.totalTrades - a.totalTrades);
  }, [allTrades, showOnlyActiveTeams]);

  // Calculate player trade stats
  const playerStats = useMemo(() => {
    const stats = new Map<
      string,
      { count: number; years: Set<number>; yearCounts: Map<number, number> }
    >();

    allTrades.forEach((trade) => {
      const tradeYear = trade.year;

      // Collect all unique players involved in this trade (from both gives and receives)
      // to avoid double counting - each player should only be counted once per trade
      const playersInTrade = new Set<string>();

      trade.teams.forEach((team) => {
        // Collect players from both gives and receives
        team.gives.players.forEach((p) => {
          if (p.playerId) {
            playersInTrade.add(p.playerId.toString());
          }
        });
        team.receives.players.forEach((p) => {
          if (p.playerId) {
            playersInTrade.add(p.playerId.toString());
          }
        });
      });

      // Count each unique player once for this trade
      playersInTrade.forEach((playerId) => {
        if (!stats.has(playerId)) {
          stats.set(playerId, {
            count: 0,
            years: new Set(),
            yearCounts: new Map(),
          });
        }
        const stat = stats.get(playerId)!;
        stat.count++;
        if (tradeYear) {
          stat.years.add(tradeYear);
          stat.yearCounts.set(
            tradeYear,
            (stat.yearCounts.get(tradeYear) || 0) + 1
          );
        }
      });
    });

    const results: PlayerTradeStats[] = Array.from(stats.entries()).map(
      ([playerId, stat]) => {
        const yearsArray = Array.from(stat.years)
          .sort((a, b) => b - a)
          .map((year) => {
            const count = stat.yearCounts.get(year) || 0;
            return `${year} (${count}x)`;
          });
        return {
          playerId,
          playerName: getPlayerName(playerId),
          tradeCount: stat.count,
          yearsTraded: yearsArray.join(", "),
        };
      }
    );

    // Create a new sorted array (don't mutate)
    return [...results].sort((a, b) => b.tradeCount - a.tradeCount);
  }, [allTrades]);

  // Calculate manager-to-manager trade stats
  const managerPairs = useMemo(() => {
    const pairs = new Map<
      string,
      Omit<ManagerTradePair, "years"> & { yearsSet: Set<number> }
    >();

    allTrades.forEach((trade) => {
      const tradeYear = trade.year;

      // Get all manager IDs involved in this trade (using the year the trade occurred)
      const seasonData = seasons[tradeYear];
      if (!seasonData?.rosters) return;

      const managerIds: string[] = [];
      trade.teams.forEach((team) => {
        const roster = seasonData.rosters.find(
          (r) => r.roster_id === team.rosterId
        );
        const ownerId = roster?.owner_id;
        if (ownerId) {
          const managerId = getManagerIdBySleeperOwnerId(ownerId);
          if (managerId && !managerIds.includes(managerId)) {
            managerIds.push(managerId);
          }
        }
      });

      // Create pairs for all combinations (for multi-team trades)
      for (let i = 0; i < managerIds.length; i++) {
        for (let j = i + 1; j < managerIds.length; j++) {
          const manager1Id = managerIds[i];
          const manager2Id = managerIds[j];
          const key = [manager1Id, manager2Id].sort().join("-");

          if (!pairs.has(key)) {
            const manager1 = managers.find((m) => m.id === manager1Id);
            const manager2 = managers.find((m) => m.id === manager2Id);
            pairs.set(key, {
              manager1Id,
              manager1Name: manager1?.name || "Unknown",
              manager1TeamName: manager1?.sleeper?.id
                ? getTeamName(manager1.sleeper.id)
                : "Unknown",
              manager2Id,
              manager2Name: manager2?.name || "Unknown",
              manager2TeamName: manager2?.sleeper?.id
                ? getTeamName(manager2.sleeper.id)
                : "Unknown",
              tradeCount: 0,
              yearsSet: new Set(),
            });
          }

          const pair = pairs.get(key)!;
          pair.tradeCount++;
          if (tradeYear) {
            pair.yearsSet.add(tradeYear);
          }
        }
      }
    });

    let results: ManagerTradePair[] = Array.from(pairs.values()).map((pair) => {
      const yearsArray = Array.from(pair.yearsSet).sort((a, b) => b - a);
      return {
        manager1Id: pair.manager1Id,
        manager1Name: pair.manager1Name,
        manager1TeamName: pair.manager1TeamName,
        manager2Id: pair.manager2Id,
        manager2Name: pair.manager2Name,
        manager2TeamName: pair.manager2TeamName,
        tradeCount: pair.tradeCount,
        years: yearsArray.join(", ") || "",
      };
    });

    // Filter by selected manager if set
    if (selectedManager) {
      results = results.filter(
        (pair) =>
          pair.manager1Id === selectedManager ||
          pair.manager2Id === selectedManager
      );
    }

    // Create a new sorted array (don't mutate)
    return [...results].sort((a, b) => b.tradeCount - a.tradeCount);
  }, [allTrades, selectedManager]);

  // Team stats table
  const teamColumns = useMemo(() => {
    const columnHelper = createColumnHelper<TeamTradeStats>();
    return [
      columnHelper.accessor("team_name", {
        header: "Team",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("totalTrades", {
        header: "Total Trades",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("playerTrades", {
        header: "Player Trades",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("draftTrades", {
        header: "Draft Trades",
        cell: (info) => info.getValue(),
      }),
    ];
  }, []);

  // Player stats table
  const playerColumns = useMemo(() => {
    const columnHelper = createColumnHelper<PlayerTradeStats>();
    return [
      columnHelper.accessor("playerName", {
        header: "Player",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("tradeCount", {
        header: "Times Traded",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("yearsTraded", {
        header: "Years",
        cell: (info) => info.getValue(),
      }),
    ];
  }, []);

  // Manager pairs table
  const managerColumns = useMemo(() => {
    const columnHelper = createColumnHelper<ManagerTradePair>();
    return [
      columnHelper.accessor("manager1TeamName", {
        header: "Team 1",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("manager2TeamName", {
        header: "Team 2",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("tradeCount", {
        header: "Trades",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("years", {
        header: "Years",
        cell: (info) => info.getValue(),
      }),
    ];
  }, []);

  // Memoize the sliced player stats to avoid recreating array
  const displayedPlayerStats = useMemo(
    () => playerStats.slice(0, 100),
    [playerStats]
  );

  const teamTable = useReactTable({
    data: teamStats,
    columns: teamColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const playerTable = useReactTable({
    data: displayedPlayerStats,
    columns: playerColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const managerTable = useReactTable({
    data: managerPairs,
    columns: managerColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6 container mx-auto">
      {/* View Selector */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => setView("teams")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            view === "teams"
              ? "bg-blue-800 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Teams
        </button>
        <button
          onClick={() => setView("players")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            view === "players"
              ? "bg-blue-800 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Players
        </button>
        <button
          onClick={() => setView("managers")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            view === "managers"
              ? "bg-blue-800 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Manager Pairs
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOnlyActiveTeams}
            onChange={(e) => setShowOnlyActiveTeams(e.target.checked)}
            className="rounded"
          />
          <span>Show only active teams</span>
        </label>

        <div className="flex gap-2 items-center">
          <span>Years:</span>
          <select
            multiple
            value={selectedYears.map(String)}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (opt) =>
                Number(opt.value)
              );
              setSelectedYears(selected);
            }}
            className="border rounded px-2 py-1 min-w-48"
            size={5}
          >
            {Object.keys(seasons)
              .map(Number)
              .sort((a, b) => b - a)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
          <button
            onClick={() => setSelectedYears([])}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            Clear
          </button>
        </div>

        {view === "managers" && (
          <div className="flex gap-2 items-center">
            <span>Filter by Team:</span>
            <select
              value={selectedManager || ""}
              onChange={(e) => setSelectedManager(e.target.value || null)}
              className="border rounded px-2 py-1"
            >
              <option value="">All Teams</option>
              {managers
                .filter((m) =>
                  showOnlyActiveTeams ? activeTeamIds.has(m.sleeper.id) : true
                )
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {getTeamName(manager.sleeper.id)}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Tables */}
      {view === "teams" && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {teamTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHeaderCell key={header.id}>
                      <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <SortIcon
                          sortDirection={
                            header.column.getIsSorted() === "asc"
                              ? "asc"
                              : header.column.getIsSorted() === "desc"
                              ? "desc"
                              : false
                          }
                        />
                      </div>
                    </TableHeaderCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {teamTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "players" && (
        <div className="overflow-x-auto">
          <div className="mb-2 text-sm text-gray-600">
            Showing top 100 most traded players
          </div>
          <Table>
            <TableHeader>
              {playerTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHeaderCell key={header.id}>
                      <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <SortIcon
                          sortDirection={
                            header.column.getIsSorted() === "asc"
                              ? "asc"
                              : header.column.getIsSorted() === "desc"
                              ? "desc"
                              : false
                          }
                        />
                      </div>
                    </TableHeaderCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {playerTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "managers" && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {managerTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHeaderCell key={header.id}>
                      <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <SortIcon
                          sortDirection={
                            header.column.getIsSorted() === "asc"
                              ? "asc"
                              : header.column.getIsSorted() === "desc"
                              ? "desc"
                              : false
                          }
                        />
                      </div>
                    </TableHeaderCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {managerTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AllTimeTrades;

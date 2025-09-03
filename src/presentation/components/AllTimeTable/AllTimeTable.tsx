import { useFormatter } from "use-intl";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { seasons } from "../../../data";
import { getCumulativeStandings, TeamStats } from "../../../utils/standings";

// Get the most recent season's active teams
const mostRecentSeason = Object.entries(seasons).sort(
  (a, b) => Number(b[0]) - Number(a[0])
)[0][1];
const activeTeamIds = new Set(
  mostRecentSeason.rosters.map((roster) => roster.owner_id)
);

const AllTimeTable = () => {
  const [showOnlyActiveTeams, setShowOnlyActiveTeams] = useState(false);
  const [years, setYears] = useState<number[]>(
    Object.keys(seasons).map((year) => Number(year))
  );
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<TeamStats>();

  const stats = useMemo(() => {
    return getCumulativeStandings(years);
  }, [years]);

  const filteredData = useMemo(
    () =>
      showOnlyActiveTeams
        ? stats.filter((team) => activeTeamIds.has(team.owner_id))
        : stats,
    [showOnlyActiveTeams, stats]
  );

  const columns = [
    columnHelper.accessor("team_name", {
      cell: (info) => <div className="text-left">{info.getValue()}</div>,
      header: () => <span className="mr-auto">Team</span>,
      enableSorting: false,
    }),
    columnHelper.accessor("wins", {
      header: () => "Wins",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("losses", {
      header: () => "Losses",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("ties", {
      header: () => "Ties",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("winPerc", {
      header: () => "Win %",
      cell: (info) =>
        number(info.getValue(), {
          maximumFractionDigits: 2,
        }),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_for", {
      header: () => "For",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_for_avg", {
      header: () => "Avg.",
      cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_against", {
      header: () => "Against",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_against_avg", {
      header: () => "Avg.",
      cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("champion", {
      header: () => "Trophies",
      cell: (info) => {
        const row = info.row.original;
        const accolades = [];

        if (row.champion?.length > 0)
          accolades.push(row.champion.map(() => "🏆"));
        if (row.runnerUp?.length > 0)
          accolades.push(row.runnerUp.map(() => "🥈"));
        if (row.scoringCrown?.length > 0)
          accolades.push(row.scoringCrown.map(() => "🎯"));

        return accolades.flat().join("");
      },
      enableSorting: false,
    }),
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div>
      <table className="w-full text-right">
        <thead className="text-sm font-medium">
          <tr>
            <th colSpan={columns.length} className="text-left pb-2">
              {"All Time Standings"}
              {years.length !== Object.keys(seasons).length && (
                <span className="text-xs text-gray-500 ml-1">
                  ({years.join(", ")})
                </span>
              )}
            </th>
          </tr>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={
                    header.column.getCanSort()
                      ? "cursor-pointer select-none"
                      : ""
                  }
                >
                  <span className="flex justify-end">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanSort()
                      ? {
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? " ↕️"
                      : ""}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="text-xs divide-y divide-gray-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200">
          <tr>
            <td colSpan={columns.length} className="py-2 text-left text-xs">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 select-none cursor-pointer">
                  <input
                    id="showOnlyActiveTeams"
                    type="checkbox"
                    checked={showOnlyActiveTeams}
                    onChange={() =>
                      setShowOnlyActiveTeams(!showOnlyActiveTeams)
                    }
                  />
                  <span>Show only active teams</span>
                </label>
                <div className="flex gap-1">
                  {Object.keys(seasons).map((year) => (
                    <button
                      key={year}
                      className={`text-xs border rounded-md px-2 py-1 hover:bg-opacity-80 ${
                        years.includes(Number(year))
                          ? "bg-blue-800 text-white border-white/50"
                          : "border-gray-200 "
                      }`}
                      onClick={() =>
                        setYears(
                          years.includes(Number(year))
                            ? years.filter((y) => y !== Number(year))
                            : [...years, Number(year)]
                        )
                      }
                    >
                      {year}
                    </button>
                  ))}
                  <button
                    className="text-xs underline rounded-md px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() =>
                      setYears(Object.keys(seasons).map((year) => Number(year)))
                    }
                    disabled={years.length === Object.keys(seasons).length}
                  >
                    {"Reset"}
                  </button>
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default AllTimeTable;

import { useFormatter } from "use-intl";
import { seasons } from "../../../data";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

interface TeamStats {
  owner_id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  winPerc: number;
  points_for: number;
  points_for_avg: number;
  points_against: number;
  points_against_avg: number;
}

const teamStats: Record<string, TeamStats> = {};
Object.entries(seasons).forEach(([, season]) => {
  season.rosters.forEach((roster) => {
    const { owner_id, settings } = roster;
    const user = season.users.find((user) => user.user_id === owner_id);

    if (!user) return;

    if (!teamStats[owner_id]) {
      teamStats[owner_id] = {
        owner_id,
        team_name: user.metadata.team_name,
        wins: settings.wins,
        losses: settings.losses,
        ties: settings.ties,
        winPerc: 0,
        points_for: settings.fpts + settings.fpts_decimal / 100,
        points_for_avg: 0,
        points_against:
          settings.fpts_against + settings.fpts_against_decimal / 100,
        points_against_avg: 0,
      };
    } else {
      teamStats[owner_id].team_name = user.metadata.team_name;
      teamStats[owner_id].wins += settings.wins;
      teamStats[owner_id].losses += settings.losses;
      teamStats[owner_id].ties += settings.ties;
      teamStats[owner_id].points_for +=
        settings.fpts + settings.fpts_decimal / 100;
      teamStats[owner_id].points_against +=
        settings.fpts_against + settings.fpts_against_decimal / 100;
    }
  });
});

const sortedStats = Object.values(teamStats)
  .map((t) => ({
    ...t,
    winPerc: (t.wins / (t.wins + t.losses + t.ties)) * 100,
    points_for_avg: t.points_for / (t.wins + t.losses + t.ties),
    points_against_avg: t.points_against / (t.wins + t.losses + t.ties),
  }))
  .sort((a, b) => {
    if (a.winPerc !== b.winPerc) return b.winPerc - a.winPerc;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.points_for !== b.points_for) return b.points_for - a.points_for;
    return a.points_against - b.points_against;
  });

const AllTimeTable = () => {
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<TeamStats>();

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
  ];

  const table = useReactTable({
    data: sortedStats,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="container mx-auto">
      <table className="w-full text-right">
        <thead className="text-sm font-medium">
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
      </table>
    </div>
  );
};

export default AllTimeTable;

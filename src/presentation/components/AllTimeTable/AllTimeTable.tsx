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
  points_against: number;
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
        points_against:
          settings.fpts_against + settings.fpts_against_decimal / 100,
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
      header: () => <div className="text-left">Team</div>,
      enableSorting: true,
      sortingFn: "alphanumeric",
    }),
    columnHelper.accessor("wins", {
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("losses", {
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("ties", {
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("winPerc", {
      cell: (info) =>
        number(info.getValue(), {
          maximumFractionDigits: 2,
        }),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_for", {
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("points_against", {
      cell: (info) => number(info.getValue()),
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
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
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

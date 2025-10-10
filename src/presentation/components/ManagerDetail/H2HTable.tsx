import { useNavigate, Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "@/presentation/components/Table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
} from "@tanstack/react-table";
import { getTeamName } from "@/utils";

export interface H2HRecordWithOpponent {
  opponentId: string;
  opponentName: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    avgPointsFor: number;
    avgPointsAgainst: number;
    currentStreak?: {
      type: "W" | "L" | "T";
      count: number;
    };
    mostRecent?: {
      year: number;
      week: number;
      result: "W" | "L" | "T";
      pointsFor: number;
      pointsAgainst: number;
    } | null;
  };
}

interface H2HTableProps {
  h2hRecords: H2HRecordWithOpponent[];
  managerId: string;
}

const H2HTable = ({ h2hRecords, managerId }: H2HTableProps) => {
  const navigate = useNavigate();
  const { number } = useFormatter();

  const columns: ColumnDef<H2HRecordWithOpponent>[] = [
    {
      accessorKey: "opponentName",
      header: "Manager",
      cell: ({ getValue, row }) => {
        const opponentManagerId = getManagerIdBySleeperOwnerId(
          row.original.opponentId
        );

        const opponentManagerName = getTeamName(row.original.opponentId);
        return (
          <Link
            to={`/h2h/${managerId}/${opponentManagerId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {opponentManagerName}
            <br />
            <span className="text-xs text-gray-500">
              {getValue() as string}
            </span>
          </Link>
        );
      },
    },
    {
      accessorKey: "record",
      header: "Record",
      cell: ({ getValue }) => {
        const record = getValue() as H2HRecordWithOpponent["record"];
        return `${record.wins}-${record.losses}${
          record.ties > 0 ? `-${record.ties}` : ""
        }`;
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.wins;
        const b = rowB.original.record.wins;
        return a - b;
      },
    },
    {
      accessorKey: "record",
      id: "currentStreak",
      header: "Current Streak",
      cell: ({ getValue }) => {
        const record = getValue() as H2HRecordWithOpponent["record"];
        if (!record.currentStreak) return null;
        return (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              record.currentStreak.type === "W"
                ? "bg-green-100 text-green-800"
                : record.currentStreak.type === "L"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {record.currentStreak.type}
            {record.currentStreak.count}
          </span>
        );
      },
    },
    {
      accessorKey: "record",
      id: "mostRecent",
      header: "Most Recent",
      cell: ({ getValue }) => {
        const record = getValue() as H2HRecordWithOpponent["record"];
        if (!record.mostRecent) return null;
        return (
          <div className="text-sm">
            <div className="font-medium">
              {record.mostRecent.year}, Week {record.mostRecent.week}
            </div>
            <div className="text-gray-500">
              {record.mostRecent.result === "W"
                ? "W"
                : record.mostRecent.result === "L"
                ? "L"
                : "T"}{" "}
              {number(record.mostRecent.pointsFor, {
                maximumFractionDigits: 2,
              })}{" "}
              -{" "}
              {number(record.mostRecent.pointsAgainst, {
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "record",
      id: "avgPointsFor",
      header: "Avg Points For",
      cell: ({ getValue }) => {
        const record = getValue() as H2HRecordWithOpponent["record"];
        return number(record.avgPointsFor, {
          maximumFractionDigits: 2,
        });
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.avgPointsFor;
        const b = rowB.original.record.avgPointsFor;
        return a - b;
      },
    },
    {
      accessorKey: "record",
      id: "avgPointsAgainst",
      header: "Avg Against",
      cell: ({ getValue }) => {
        const record = getValue() as H2HRecordWithOpponent["record"];
        return number(record.avgPointsAgainst, {
          maximumFractionDigits: 2,
        });
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.avgPointsAgainst;
        const b = rowB.original.record.avgPointsAgainst;
        return a - b;
      },
    },
  ];

  const table = useReactTable({
    data: h2hRecords,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: "record", desc: true }],
    },
  });

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <h3 className="text-lg font-semibold text-gray-900 py-4 px-6">
        Head-to-Head Records
      </h3>
      <Table className="border-t border-neutral-200">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHeaderCell
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={`${
                    header.column.getCanSort()
                      ? "cursor-pointer hover:bg-gray-100"
                      : ""
                  }`}
                  isSorted={!!header.column.getIsSorted()}
                >
                  <div className="flex items-center justify-between">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanSort() && (
                      <SortIcon
                        sortDirection={
                          header.column.getIsSorted() === "asc"
                            ? "asc"
                            : header.column.getIsSorted() === "desc"
                            ? "desc"
                            : false
                        }
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() =>
                navigate(`/h2h/${managerId}/${row.original.opponentId}`)
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default H2HTable;

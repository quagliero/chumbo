import { useMemo } from "react";
import { useFormatter } from "use-intl";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../Table";

export interface OwnerStats {
  ownerId: string;
  teamName: string;
  gamesPlayed: number;
  totalPoints: number;
  averagePoints: number;
  starts: number;
  bench: number;
}

interface OwnershipTableProps {
  data: OwnerStats[];
}

const OwnershipTable = ({ data }: OwnershipTableProps) => {
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<OwnerStats>();
  const columns = useMemo(
    () => [
      columnHelper.accessor("teamName", {
        header: "Team",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("gamesPlayed", {
        header: "Games",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("starts", {
        header: "Starts",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("bench", {
        header: "Bench",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("totalPoints", {
        header: "Total Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 1 }),
        sortingFn: "basic",
      }),
      columnHelper.accessor("averagePoints", {
        header: "Avg Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "basic",
      }),
    ],
    [columnHelper, number]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: "gamesPlayed", desc: true }],
    },
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHeaderCell
                key={header.id}
                className={`${
                  header.column.getCanSort() ? "cursor-pointer select-none" : ""
                } ${header.id === "teamName" ? "text-left" : "text-right"}`}
                onClick={header.column.getToggleSortingHandler()}
                isSorted={!!header.column.getIsSorted()}
              >
                <div className="inline-flex items-center gap-1">
                  {flexRender(
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
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={`${
                  cell.column.id === "teamName"
                    ? "text-left font-medium"
                    : "text-right"
                }`}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default OwnershipTable;

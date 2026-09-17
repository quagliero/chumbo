import { useMemo } from "react";
import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { ManagerIdentity } from "@/presentation/components/ManagerIdentity";

export interface OwnerStats {
  ownerId: string;
  teamName: string;
  gamesPlayed: number;
  totalPoints: number;
  averagePoints: number;
  starts: number;
  bench: number;
  /** NFL teams the player was on across the seasons this manager rostered him. */
  nflTeams: string[];
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
        cell: (info) => (
          <ManagerIdentity
            ownerId={info.row.original.ownerId}
            teamName={String(info.getValue())}
            showAvatar={false}
          />
        ),
        meta: {
          kind: "manager",
          ownerId: (row) => row.ownerId,
          cellClassName: "font-medium",
        },
      }),
      columnHelper.accessor("nflTeams", {
        header: "NFL",
        // Resolved per season, so a player traded mid-tenure shows both teams
        // rather than only the one he plays for today (A1b).
        cell: (info) => info.getValue().join(", ") || "—",
        enableSorting: false,
        meta: { cellClassName: "text-ink-muted" },
      }),
      columnHelper.accessor("gamesPlayed", {
        header: "Games",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
        meta: { kind: "numeric" },
      }),
      columnHelper.accessor("starts", {
        header: "Starts",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
        meta: { kind: "numeric" },
      }),
      columnHelper.accessor("bench", {
        header: "Bench",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
        meta: { kind: "numeric" },
      }),
      columnHelper.accessor("totalPoints", {
        header: "Total Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 1 }),
        sortingFn: "basic",
        meta: { kind: "points" },
      }),
      columnHelper.accessor("averagePoints", {
        header: "Avg Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "basic",
        meta: { kind: "points" },
      }),
    ],
    [columnHelper, number]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      initialSorting={[{ id: "gamesPlayed", desc: true }]}
      // E8, namespaced: the player page shows several tables, so this one's
      // sort is `?owners.sort=` and cannot be confused with a neighbour's.
      urlState="owners"
      emptyMessage="No manager has rostered this player."
    />
  );
};

export default OwnershipTable;

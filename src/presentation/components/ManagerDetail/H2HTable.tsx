import { useNavigate, Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { DataTable } from "@/presentation/components/Table";
import type { AnyColumnDef } from "@/presentation/components/Table";
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

  const columns: AnyColumnDef<H2HRecordWithOpponent>[] = [
    {
      accessorKey: "opponentName",
      header: "Manager",
      cell: ({ getValue, row }) => {
        const opponentManagerId = getManagerIdBySleeperOwnerId(
          row.original.opponentId
        );

        const opponentManagerName = getTeamName(row.original.opponentId);
        return (
          // Not a ManagerLink: this goes to the pairwise H2H page, not to the
          // opponent's manager page.
          <Link
            to={`/h2h/${managerId}/${opponentManagerId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {opponentManagerName}
            <br />
            <span className="text-xs text-ink-muted">
              {getValue() as string}
            </span>
          </Link>
        );
      },
      meta: { cellClassName: "font-medium" },
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
      meta: { kind: "record" },
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
            className={`px-2 py-1 rounded text-xs font-medium text-white ${
              record.currentStreak.type === "W"
                ? "bg-result-win"
                : record.currentStreak.type === "L"
                ? "bg-result-loss"
                : "bg-result-tie"
            }`}
          >
            {record.currentStreak.type}
            {record.currentStreak.count}
          </span>
        );
      },
      meta: { align: "center" },
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
            <div className="text-ink-muted tabular-nums">
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
      meta: { kind: "points" },
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
      meta: { kind: "points" },
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <h3 className="text-lg font-semibold text-gray-900 py-4 px-6">
        Head-to-Head Records
      </h3>
      <DataTable
        columns={columns}
        data={h2hRecords}
        initialSorting={[{ id: "record", desc: true }]}
        // E8. `/managers/:id/h2h` names this table exactly — no local filter
        // above it to go missing — so the link restores the whole view.
        urlState
        onRowClick={(row) => navigate(`/h2h/${managerId}/${row.opponentId}`)}
        emptyMessage="No head-to-head games yet."
      />
    </div>
  );
};

export default H2HTable;

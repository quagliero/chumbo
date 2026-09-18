import { createColumnHelper } from "@tanstack/react-table";
import { Card } from "@/presentation/components/Card";
import { DataTable } from "../Table";
import {
  AllTimeScheduleComparisonStats,
  ComparisonRow,
  differenceClass,
  formatWinPercentage,
  isEmptyRecord,
} from "./scheduleComparison";

const comparisonColumnHelper = createColumnHelper<ComparisonRow>();

const comparisonColumns = [
  comparisonColumnHelper.accessor("teamName", {
    header: "Team",
    cell: (info) => info.getValue(),
    sortDescFirst: true,
    meta: {
      kind: "manager" as const,
      // The selected team's own row is the baseline being compared against,
      // and links to the page you are already on.
      ownerId: (row: ComparisonRow) =>
        row.isSelectedTeam ? undefined : row.ownerId,
      cellClassName: "font-medium",
    },
  }),
  comparisonColumnHelper.display({
    id: "actual",
    header: "",
    cell: ({ row }) =>
      row.original.isSelectedTeam ? (
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
          Actual
        </span>
      ) : null,
    meta: { headerClassName: "w-0" },
  }),
  comparisonColumnHelper.accessor((row) => row.record.wins, {
    id: "wins",
    header: "W",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.losses, {
    id: "losses",
    header: "L",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.ties, {
    id: "ties",
    header: "T",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.winPercentage, {
    id: "winPercentage",
    header: "Win %",
    cell: (info) => formatWinPercentage(info.getValue()),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.display({
    id: "vsSchedule",
    header: "Vs Schedule",
    cell: ({ row }) => {
      const { isSelectedTeam, record, recordDifference } = row.original;
      if (isSelectedTeam || isEmptyRecord(record)) {
        return <span className="text-ink-muted">—</span>;
      }

      return (
        <span className={`font-medium ${differenceClass(recordDifference)}`}>
          {recordDifference > 0 && "+"}
          {recordDifference.toFixed(2)}%
        </span>
      );
    },
    meta: { kind: "numeric" as const },
  }),
];

/**
 * The "By Team" view: what one team's all-time record would have been on each
 * other team's schedule, with its own actual record as the baseline row.
 */
const TeamComparisonTable = ({
  selectedTeamStats,
  comparisonRows,
}: {
  selectedTeamStats: AllTimeScheduleComparisonStats;
  comparisonRows: ComparisonRow[];
}) => (
  <Card padding="none">
    <div className="px-6 py-4 border-b border-gray-200">
      <h2 className="text-xl font-bold text-gray-900">
        {selectedTeamStats.teamName} - Schedule Comparison
      </h2>
      <p className="text-sm text-gray-600 mt-1">
        What {selectedTeamStats.teamName}'s all-time record would be if
        they played each team's schedule
      </p>
    </div>

    <DataTable
      columns={comparisonColumns}
      data={comparisonRows}
      initialSorting={[{ id: "winPercentage", desc: true }]}
      getRowBackground={(row) =>
        row.original.isSelectedTeam ? "bg-blue-50" : undefined
      }
      emptyMessage="No schedules to compare against."
    />
  </Card>
);

export default TeamComparisonTable;

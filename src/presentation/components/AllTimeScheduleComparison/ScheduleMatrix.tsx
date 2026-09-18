import { createColumnHelper } from "@tanstack/react-table";
import { roundToTwoDecimals } from "@/utils/recordUtils";
import { Card } from "@/presentation/components/Card";
import { DataTable } from "../Table";
import {
  AllTimeScheduleComparisonStats,
  differenceClass,
  formatWinPercentage,
  isEmptyRecord,
} from "./scheduleComparison";

const matrixColumnHelper =
  createColumnHelper<AllTimeScheduleComparisonStats>();

/**
 * The "League" view: every team against every schedule, the row team's record
 * on the column team's schedule in each cell.
 */
const ScheduleMatrix = ({
  allTimeStats,
}: {
  allTimeStats: AllTimeScheduleComparisonStats[];
}) => {
  // One column per team's schedule. A matrix is read across and down rather
  // than sorted, so every column is fixed.
  const matrixColumns = [
    matrixColumnHelper.accessor("teamName", {
      header: "Team",
      cell: (info) => info.getValue(),
      enableSorting: false,
      meta: {
        kind: "manager" as const,
        ownerId: (row: AllTimeScheduleComparisonStats) => row.ownerId,
        cellClassName: "font-medium",
      },
    }),
    ...allTimeStats.map((colTeam) =>
      matrixColumnHelper.display({
        id: `vs-${colTeam.ownerId}`,
        header: () => (
          <span className="break-words leading-tight">{colTeam.teamName}</span>
        ),
        cell: ({ row }) => {
          const rowTeam = row.original;
          const isSameTeam = rowTeam.ownerId === colTeam.ownerId;
          const record = isSameTeam
            ? rowTeam.actualRecord
            : rowTeam.crossScheduleRecords[colTeam.ownerId];

          if (!record) return null;

          const recordDifference = isSameTeam
            ? 0
            : roundToTwoDecimals(
                (record.winPercentage - rowTeam.actualRecord.winPercentage) *
                  100
              );

          return (
            <div className="space-y-1 text-xs">
              <div className="font-medium">
                {record.wins}-{record.losses}-{record.ties}
              </div>
              <div className="text-ink-muted">
                {formatWinPercentage(record.winPercentage)}
              </div>
              {isSameTeam ? (
                <div className="text-blue-600 font-medium">Actual</div>
              ) : isEmptyRecord(record) ? (
                <div className="text-ink-muted">—</div>
              ) : (
                <div className={`font-medium ${differenceClass(recordDifference)}`}>
                  {recordDifference > 0 && "+"}
                  {recordDifference.toFixed(2)}%
                </div>
              )}
            </div>
          );
        },
        meta: {
          kind: "record" as const,
          headerClassName: "min-w-24 max-w-32",
          // The diagonal — a team against its own schedule, which is just its
          // actual record.
          rowCellClassName: (row: AllTimeScheduleComparisonStats) =>
            row.ownerId === colTeam.ownerId ? "bg-surface-sunk" : undefined,
        },
      })
    ),
  ];

  return (
    <Card padding="none">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">
          All-Time Schedule Comparison Matrix
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Each cell shows what the row team's record would be if they played
          the column team's schedule
        </p>
      </div>

      {/* Zebra would fight the diagonal, which is the one thing the
          matrix marks out. */}
      <DataTable
        columns={matrixColumns}
        data={allTimeStats}
        // Same as the season view: a shaded diagonal and coloured cells.
    // Striping a matrix implies the row is the unit, and it is not.
    zebra={false}
      />
    </Card>
  );
};

export default ScheduleMatrix;

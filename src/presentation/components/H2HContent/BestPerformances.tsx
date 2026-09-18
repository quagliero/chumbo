import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { Manager } from "@/types/manager";
import { DataTable } from "../Table";
import { Card } from "@/presentation/components/Card";
import { H2HBestPerformance } from "./h2hData";
import PlayerAvatar from "./PlayerAvatar";
import Pill from "./Pill";

/** Each side's five best single-game scores against the other. */
const BestPerformances = ({
  managerAData,
  managerBData,
  managerABestPerformances,
  managerBBestPerformances,
}: {
  managerAData: Manager;
  managerBData: Manager;
  managerABestPerformances: H2HBestPerformance[];
  managerBBestPerformances: H2HBestPerformance[];
}) => {
  const { number } = useFormatter();
  const performanceColumnHelper = createColumnHelper<H2HBestPerformance>();

  // Already the top five by score; sorting the five would misrepresent them.
  const bestPerformanceColumns = [
    performanceColumnHelper.accessor("playerName", {
      header: "Player",
      cell: (info) => (
        <div className="flex items-center gap-2">
          <PlayerAvatar
            playerId={info.row.original.playerId}
            playerName={info.getValue()}
          />
          {info.getValue()}
        </div>
      ),
      enableSorting: false,
      meta: {
        kind: "player" as const,
        playerId: (row: H2HBestPerformance) => row.playerId,
        cellClassName: "font-medium",
      },
    }),
    performanceColumnHelper.display({
      id: "yearWeek",
      header: "Year/Week",
      cell: ({ row }) => `${row.original.year} W${row.original.week}`,
    }),
    performanceColumnHelper.accessor("score", {
      header: "Points",
      cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
      enableSorting: false,
      meta: { kind: "points" as const },
    }),
    performanceColumnHelper.display({
      id: "result",
      header: "Result",
      cell: ({ row }) => (
        <Pill
          className={
            row.original.result === "W"
              ? "bg-green-100 text-green-800"
              : row.original.result === "L"
              ? "bg-red-100 text-red-800"
              : "bg-gray-100 text-gray-800"
          }
        >
          {row.original.result}
        </Pill>
      ),
    }),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
      {[
        {
          teamName: managerAData?.teamName,
          performances: managerABestPerformances,
          opponentName: managerBData?.teamName,
        },
        {
          teamName: managerBData?.teamName,
          performances: managerBBestPerformances,
          opponentName: managerAData?.teamName,
        },
      ].map(({ teamName, performances, opponentName }) => (
        <Card key={teamName} padding="none">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              {teamName} Best Performances
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Top 5 individual game scores against {opponentName}
            </p>
          </div>
          <DataTable
            columns={bestPerformanceColumns}
            data={performances}
            emptyMessage="No games between these two yet."
          />
        </Card>
      ))}
    </div>
  );
};

export default BestPerformances;

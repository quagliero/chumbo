import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { Manager } from "@/types/manager";
import { DataTable } from "../Table";
import { Card } from "@/presentation/components/Card";
import { H2HLineupSlot } from "./h2hData";
import PlayerAvatar from "./PlayerAvatar";

/** Each side's best lineup from the players who started against the other. */
const AllStarLineups = ({
  managerAData,
  managerBData,
  managerALineup,
  managerBLineup,
}: {
  managerAData: Manager;
  managerBData: Manager;
  managerALineup: H2HLineupSlot[];
  managerBLineup: H2HLineupSlot[];
}) => {
  const { number } = useFormatter();
  const lineupColumnHelper = createColumnHelper<H2HLineupSlot>();

  // The rows ARE the lineup slots, in slot order; sorting them by points would
  // destroy the only thing the table says.
  const lineupColumns = [
    lineupColumnHelper.accessor("position", {
      header: "Pos",
      cell: (info) => info.getValue(),
      enableSorting: false,
      meta: { cellClassName: "pr-0", headerClassName: "pr-0" },
    }),
    lineupColumnHelper.display({
      id: "player",
      header: "Player",
      cell: ({ row }) => {
        const { position, player } = row.original;
        if (!player) return "—";

        return (
          <div className="flex items-center gap-2">
            <PlayerAvatar
              playerId={player.playerId}
              playerName={player.playerName}
              square={position === "DEF"}
            />
            {player.playerName}
          </div>
        );
      },
      meta: {
        kind: "player" as const,
        playerId: (row: H2HLineupSlot) => row.player?.playerId,
        cellClassName: "font-medium",
      },
    }),
    lineupColumnHelper.display({
      id: "games",
      header: "Games",
      cell: ({ row }) => row.original.player?.gamesPlayed ?? "—",
      meta: { kind: "numeric" as const },
    }),
    lineupColumnHelper.display({
      id: "points",
      header: "Points",
      cell: ({ row }) =>
        row.original.player
          ? number(row.original.player.totalPoints, {
              maximumFractionDigits: 2,
            })
          : "—",
      meta: { kind: "points" as const },
    }),
    lineupColumnHelper.display({
      id: "average",
      header: "Average",
      cell: ({ row }) =>
        row.original.player
          ? number(row.original.player.averagePoints, {
              maximumFractionDigits: 2,
            })
          : "—",
      meta: { kind: "points" as const },
    }),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {[
        {
          teamName: managerAData?.teamName,
          lineup: managerALineup,
          opponentName: managerBData?.teamName,
        },
        {
          teamName: managerBData?.teamName,
          lineup: managerBLineup,
          opponentName: managerAData?.teamName,
        },
      ].map(({ teamName, lineup, opponentName }) => (
        <Card key={teamName} padding="none">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              {teamName} All-Stars
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Top performers against {opponentName}
            </p>
          </div>
          <DataTable columns={lineupColumns} data={lineup} />
        </Card>
      ))}
    </div>
  );
};

export default AllStarLineups;

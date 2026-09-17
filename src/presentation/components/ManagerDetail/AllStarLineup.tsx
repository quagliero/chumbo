import { createColumnHelper } from "@tanstack/react-table";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { DataTable } from "@/presentation/components/Table";

export interface AllStarSlot {
  position: string;
  player?: {
    playerId: string;
    playerName: string;
    totalPoints: number;
    averagePoints: number;
    games: number;
  };
}

/** The player's photo, or his initial where there is no photo to show. */
const PlayerAvatar = ({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) => {
  const imageUrl = getPlayerImageUrl(playerId);

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={`${playerName} photo`}
      className="w-8 h-8 rounded-full object-cover mr-3"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-line flex items-center justify-center text-xs font-medium text-ink-muted mr-3">
      {(playerName || "?").charAt(0).toUpperCase()}
    </div>
  );
};

const columnHelper = createColumnHelper<AllStarSlot>();

// The rows ARE the lineup slots, in slot order — sorting them by points would
// destroy the only thing the table says.
const columns = [
  columnHelper.accessor("position", {
    header: "Position",
    cell: (info) => info.getValue(),
    enableSorting: false,
    meta: { cellClassName: "font-medium" },
  }),
  columnHelper.display({
    id: "player",
    header: "Player",
    cell: ({ row }) => {
      const player = row.original.player;
      if (!player) return <span className="text-ink-faint">—</span>;

      return (
        <div className="flex items-center">
          <PlayerAvatar
            playerId={player.playerId}
            playerName={player.playerName}
          />
          {player.playerName}
        </div>
      );
    },
    meta: {
      kind: "player" as const,
      playerId: (row: AllStarSlot) => row.player?.playerId,
    },
  }),
  columnHelper.display({
    id: "totalPoints",
    header: "Total Points",
    cell: ({ row }) =>
      row.original.player
        ? Number(row.original.player.totalPoints).toFixed(2)
        : "—",
    meta: { kind: "points" as const },
  }),
  columnHelper.display({
    id: "averagePoints",
    header: "Average",
    cell: ({ row }) =>
      row.original.player
        ? Number(row.original.player.averagePoints).toFixed(2)
        : "—",
    meta: { kind: "points" as const },
  }),
  columnHelper.display({
    id: "games",
    header: "Games",
    cell: ({ row }) => (row.original.player ? row.original.player.games : "—"),
    meta: { kind: "numeric" as const },
  }),
];

interface AllStarLineupProps {
  allStarLineup: AllStarSlot[];
}

const AllStarLineup = ({ allStarLineup }: AllStarLineupProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink mb-4 px-6">
        All-Star Lineup
      </h3>
      <DataTable
        columns={columns}
        data={allStarLineup}
        className="border-y border-line"
        emptyMessage="No all-star lineup to show."
      />
    </div>
  );
};

export default AllStarLineup;

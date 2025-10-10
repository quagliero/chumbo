import { Link } from "react-router-dom";
import { getPlayerImageUrl } from "@/utils/playerImage";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/presentation/components/Table";

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

interface AllStarLineupProps {
  allStarLineup: AllStarSlot[];
}

const AllStarLineup = ({ allStarLineup }: AllStarLineupProps) => {
  return (
    <div className="">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 px-6">
        All-Star Lineup
      </h3>
      <Table className="border-y border-gray-200">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Position</TableHeaderCell>
            <TableHeaderCell>Player</TableHeaderCell>
            <TableHeaderCell>Total Points</TableHeaderCell>
            <TableHeaderCell>Average</TableHeaderCell>
            <TableHeaderCell>Games</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allStarLineup.map((slot, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{slot.position}</TableCell>
              <TableCell>
                {slot.player ? (
                  <div className="flex items-center">
                    {(() => {
                      const imageUrl = getPlayerImageUrl(slot.player!.playerId);
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={`${slot.player!.playerName} photo`}
                          className="w-8 h-8 rounded-full object-cover mr-3"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-3">
                          {(slot.player!.playerName || "?")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      );
                    })()}
                    <Link
                      to={`/players/${slot.player!.playerId}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {slot.player!.playerName}
                    </Link>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              <TableCell>
                {slot.player
                  ? Number(slot.player!.totalPoints).toFixed(2)
                  : "—"}
              </TableCell>
              <TableCell>
                {slot.player
                  ? Number(slot.player!.averagePoints).toFixed(2)
                  : "—"}
              </TableCell>
              <TableCell>{slot.player ? slot.player!.games : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AllStarLineup;

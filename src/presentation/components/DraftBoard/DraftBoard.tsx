import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getPlayer } from "@/data";
import {
  LINK_CLASS,
  ManagerLink,
  hasPlayerPage,
} from "@/presentation/components/Links";
import { ExtendedDraft } from "@/types/draft";
import { ExtendedPick } from "@/types/pick";
import { ExtendedRoster } from "@/types/roster";
import { getManagerAbbr } from "@/utils/managerUtils";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { POSITION_COLORS } from "@/constants/fantasy";

interface DraftBoardProps {
  draft: ExtendedDraft;
  picks: ExtendedPick[];
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  year: number;
}

const DraftBoard = ({
  draft,
  picks,
  rosters,
  getTeamName,
  year,
}: DraftBoardProps) => {
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  // Build the snake draft grid
  const draftGrid = useMemo(() => {
    if (!draft?.slot_to_roster_id || !picks) return null;

    const numSlots = Object.keys(draft.slot_to_roster_id).length;
    const numRounds = draft.settings.rounds;

    // Create a map of slot -> roster_id
    const slotToRoster = draft.slot_to_roster_id;

    // Sort picks by pick_no
    const sortedPicks = [...picks].sort((a, b) => a.pick_no - b.pick_no);

    // Build grid structure
    const grid: Array<Array<ExtendedPick | null>> = [];
    let pickIndex = 0;

    for (let round = 1; round <= numRounds; round++) {
      const row: Array<ExtendedPick | null> = [];

      for (let slot = 1; slot <= numSlots; slot++) {
        const pick = sortedPicks[pickIndex] || null;
        row.push(pick);
        pickIndex++;
      }

      // Reverse even rounds for snake draft display
      const isEvenRound = round % 2 === 0;
      if (isEvenRound) {
        row.reverse();
      }

      grid.push(row);
    }

    return { grid, slotToRoster, numSlots };
  }, [draft, picks]);

  if (!draftGrid) {
    return <div>Draft data not available</div>;
  }

  const { grid, slotToRoster, numSlots } = draftGrid;

  // Get team names for header
  const slotHeaders = Array.from({ length: numSlots }, (_, i) => {
    const slot = i + 1;
    const rosterId = slotToRoster[slot];
    const roster = rosters.find((r) => r.roster_id === rosterId);
    const teamName = roster ? getTeamName(roster.owner_id) : "Unknown";
    const managerAbbr = roster ? getManagerAbbr(roster.owner_id) : "??";
    return { slot, teamName, rosterId, managerAbbr, ownerId: roster?.owner_id };
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        <table className="w-full border-separate gap-1">
          {/* Header row with team names */}
          <thead>
            <tr>
              {slotHeaders.map(
                ({ slot, teamName, rosterId, managerAbbr, ownerId }) => {
                  const isSelected = selectedRosterId === rosterId;

                  return (
                    <th
                      key={slot}
                      onClick={() =>
                        setSelectedRosterId(isSelected ? null : rosterId)
                      }
                      className={`p-2 text-xs font-semibold min-w-32 max-w-32 cursor-pointer transition-colors rounded-md ${
                        isSelected ? "bg-blue-600 text-white" : ""
                      }`}
                      title="Click to filter this team's picks"
                    >
                      {/* The header's own click filters the board, so the link
                          to the manager lives on the abbreviation and isolates
                          its click rather than doubling up on navigation. */}
                      <div className="truncate">{teamName}</div>
                      <div className="text-[8px]">
                        <ManagerLink
                          ownerId={ownerId}
                          isolate
                          className={
                            isSelected
                              ? "text-white hover:text-blue-100 underline"
                              : LINK_CLASS
                          }
                          fallbackClassName={
                            isSelected ? "text-white" : "text-gray-400"
                          }
                          title={`${teamName} — manager page`}
                        >
                          {managerAbbr}
                        </ManagerLink>
                      </div>
                    </th>
                  );
                }
              )}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, roundIndex) => {
              const round = roundIndex + 1;
              return (
                <tr key={round}>
                  {row.map((pick, slotIndex) => {
                    if (!pick) {
                      return (
                        <td
                          key={slotIndex}
                          className="p-2 bg-white min-w-32 max-w-32"
                        >
                          <div className="h-16"></div>
                        </td>
                      );
                    }

                    const player = getPlayer(pick.player_id, year);
                    const position =
                      pick?.position || player?.position || "UNK";
                    const bgColor = POSITION_COLORS[position] || "bg-white";

                    // Calculate position rank (e.g., WR5 means 5th WR taken)
                    const positionRank = picks
                      .filter((p) => p.pick_no <= pick.pick_no)
                      .filter((p) => {
                        const pPlayer = getPlayer(p.player_id, year);
                        const pPosition =
                          pPlayer?.fantasy_positions?.[0] || "UNK";
                        return pPosition === position;
                      }).length;

                    // Check if this was a traded pick
                    const expectedRosterId = slotToRoster[pick.draft_slot];
                    const isTraded = pick.roster_id !== expectedRosterId;

                    // A1e: every pick resolves in the dictionary, so the old
                    // pick.metadata fallback was unreachable and its 13 fields
                    // were 71% of picks.json.
                    const playerName = player
                      ? `${player.first_name || ""} ${
                          player.last_name || ""
                        }`.trim()
                      : pick.player_id;

                    // Get the actual picker
                    const pickerRoster = rosters.find(
                      (r) => r.roster_id === pick.roster_id
                    );
                    const pickerAbbr = pickerRoster
                      ? getManagerAbbr(pickerRoster.owner_id)
                      : "??";

                    // Check if this pick should be faded
                    const isFaded =
                      selectedRosterId !== null &&
                      pick.roster_id !== selectedRosterId;

                    // Pre-2016 picks store a bare name rather than a Sleeper
                    // id for a handful of players; those have no page, so the
                    // cell stays plain text rather than linking into a 404.
                    const isLinkable = hasPlayerPage(pick.player_id);

                    // The cell is one link target (the grid is tight, and a
                    // 128px cell is a better target than the name alone). The
                    // traded-pick badge is a second, separate link and so has
                    // to sit outside it — anchors cannot nest.
                    const cellBody = (
                      <>
                          {/* Pick number and position badge */}
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs text-gray-500 font-medium">
                              {roundIndex + 1}.
                              {pick.round % 2 === 0
                                ? numSlots - pick.draft_slot + 1
                                : pick.draft_slot}
                            </span>
                            <span className="text-xs font-bold text-gray-700 bg-white/50 px-1 rounded">
                              {position}
                            </span>
                          </div>

                          {/* Player name with image */}
                          <div className="text-xs font-medium leading-tight flex-1 truncate flex items-center gap-1">
                            <div
                              className={`flex-none w-5 h-5 ${
                                position === "DEF"
                                  ? ""
                                  : "rounded-full bg-gray-100"
                              }  flex items-center justify-center overflow-hidden`}
                            >
                              {(() => {
                                const imageUrl = getPlayerImageUrl(
                                  pick.player_id,
                                  position
                                );
                                if (!imageUrl) {
                                  return (
                                    <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[8px] text-gray-600 font-bold">
                                      ?
                                    </div>
                                  );
                                }
                                return (
                                  <img
                                    src={imageUrl}
                                    alt={playerName}
                                    className="w-5 h-5 object-cover flex-shrink-0"
                                    onError={(e) => {
                                      // Fallback to a gray circle if image fails to load
                                      const target =
                                        e.target as HTMLImageElement;
                                      target.style.display = "none";
                                      const fallback =
                                        target.nextElementSibling as HTMLElement;
                                      if (fallback)
                                        fallback.style.display = "block";
                                    }}
                                  />
                                );
                              })()}
                              <div
                                className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[8px] text-gray-600 font-bold"
                                style={{ display: "none" }}
                              >
                                ?
                              </div>
                            </div>
                            <span className="truncate group-hover:underline">
                              {playerName}
                            </span>
                          </div>

                          {/* Position number picked */}
                          <div className="text-xs text-gray-600 mt-1">
                            {position}
                            {positionRank}
                          </div>
                      </>
                    );

                    return (
                      <td
                        key={slotIndex}
                        className={`p-2 ${bgColor} min-w-32 max-w-32 relative transition-opacity rounded-md ${
                          isFaded ? "opacity-20" : "opacity-100"
                        }`}
                      >
                        {isLinkable ? (
                          <Link
                            to={`/players/${pick.player_id}`}
                            title={`${playerName} — player page`}
                            className="group flex flex-col h-full rounded-sm hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            {cellBody}
                          </Link>
                        ) : (
                          <div
                            className="flex flex-col h-full"
                            title={`${playerName} — no player page for this pick`}
                          >
                            {cellBody}
                          </div>
                        )}

                        {/* Traded pick indicator — links to whoever made the
                            pick, not to the slot's original owner. */}
                        {isTraded && (
                          <div className="absolute bottom-px right-px text-[8px] bg-white/80 px-1 py-0.5 rounded border border-gray-300">
                            <ManagerLink
                              ownerId={pickerRoster?.owner_id}
                              className={LINK_CLASS}
                              fallbackClassName="text-gray-600"
                              title={`Traded pick — ${pickerAbbr}`}
                            >
                              {pickerAbbr}
                            </ManagerLink>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend and Instructions */}
        <div className="mt-4 space-y-2">
          {selectedRosterId !== null && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              Showing picks for{" "}
              <ManagerLink
                ownerId={
                  rosters.find((r) => r.roster_id === selectedRosterId)
                    ?.owner_id
                }
                className={`font-bold ${LINK_CLASS}`}
                fallbackClassName="font-bold"
              >
                {getTeamName(
                  rosters.find((r) => r.roster_id === selectedRosterId)
                    ?.owner_id || ""
                )}
              </ManagerLink>
              . Click the team name again to show all picks.
            </div>
          )}
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">Legend</h4>
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(POSITION_COLORS).map(([pos, color]) => (
                <div key={pos} className="flex items-center gap-1">
                  <div
                    className={`w-4 h-4 ${color} border border-gray-300`}
                  ></div>
                  <span>{pos}</span>
                </div>
              ))}
              <div className="ml-4 text-gray-600">
                • Traded picks shown with team abbreviation in corner
              </div>
              <div className="ml-4 text-gray-600">
                • Click team name to filter their picks
              </div>
              <div className="ml-4 text-gray-600">
                • Click a pick for the player, or the initials under a team for
                the manager
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftBoard;

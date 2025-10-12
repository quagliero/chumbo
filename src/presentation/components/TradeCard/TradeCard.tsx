import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { TradeSummary, TradeAssets } from "@/utils/transactionUtils";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { Player } from "@/types/player";

interface TradeCardProps {
  trade: TradeSummary;
  rosters: ExtendedRoster[];
  users?: ExtendedUser[];
  getTeamName: (ownerId: string) => string;
}

const TradeCard = ({ trade, rosters, users, getTeamName }: TradeCardProps) => {
  // Get roster and user info for all teams
  const teamData = trade.teams.map((team) => {
    const roster = rosters.find((r) => r.roster_id === team.rosterId);
    const user = roster ? getUserByOwnerId(roster.owner_id, users) : undefined;
    const name = roster ? getTeamName(roster.owner_id) : "Unknown Team";

    return {
      ...team,
      roster,
      user,
      name,
    };
  });

  // Get avatar URLs for all teams
  const teamAvatars = teamData.map((team) => getUserAvatarUrl(team.user));

  const AssetList = ({ assets }: { assets: TradeAssets }) => (
    <div className="space-y-2">
      {/* Players */}
      {assets.players.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Players</div>
          <div className="space-y-1">
            {assets.players.map(
              ({
                playerId,
                player,
              }: {
                playerId: string;
                player: Player | undefined;
              }) => (
                <div
                  key={playerId}
                  className="flex items-center space-x-2 text-sm"
                >
                  {player && (
                    <>
                      <img
                        src={getPlayerImageUrl(playerId)}
                        alt={`${player.full_name}`}
                        className="w-6 h-6 rounded object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="font-medium">{player.full_name}</span>
                      <span className="text-gray-500 text-xs">
                        {player.position}
                      </span>
                    </>
                  )}
                  {!player && (
                    <span className="text-gray-500 text-sm">
                      Unknown Player ({playerId})
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Draft Picks */}
      {assets.draftPicks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">
            Draft Picks
          </div>
          <div className="space-y-1">
            {assets.draftPicks
              .sort(
                (
                  a: { round: number; pickNumber: number },
                  b: { round: number; pickNumber: number }
                ) => {
                  if (a.round !== b.round) return a.round - b.round;
                  return a.pickNumber - b.pickNumber;
                }
              )
              .map(
                (
                  pick: {
                    round: number;
                    pickNumber: number;
                    overallPickNumber: number;
                  },
                  index: number
                ) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium">
                      Pick {pick.round}.{pick.pickNumber}
                      <span className="text-gray-500 text-xs ml-1">
                        #{pick.overallPickNumber}
                      </span>
                    </span>
                  </div>
                )
              )}
          </div>
        </div>
      )}

      {/* Waiver Budget */}
      {assets.waiverBudget.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">
            Waiver Budget
          </div>
          <div className="space-y-1">
            {assets.waiverBudget.map(
              (budget: { amount: number }, index: number) => (
                <div key={index} className="text-sm">
                  <span className="font-medium">${budget.amount}</span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {assets.players.length === 0 &&
        assets.draftPicks.length === 0 &&
        assets.waiverBudget.length === 0 && (
          <div className="text-sm text-gray-400 italic">Nothing</div>
        )}
    </div>
  );

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Header with teams */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            {teamData.length === 2 ? "Trade" : `${teamData.length}-Team Trade`}
          </h3>
          <div className="text-xs text-gray-500">{trade.formattedDate}</div>
        </div>

        {/* Teams */}
        <div className="space-y-2">
          {teamData.map((team, index) => (
            <div key={team.rosterId} className="flex items-center space-x-2">
              {teamAvatars[index] ? (
                <img
                  src={teamAvatars[index]}
                  alt={`${team.name} avatar`}
                  className="w-6 h-6 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                  {team.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="font-medium text-sm">{team.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Exchange */}
      <div className="space-y-4 mb-4">
        {teamData.map((team) => (
          <div key={team.rosterId} className="border-l-2 border-gray-200 pl-3">
            <div className="text-xs font-medium text-gray-500 mb-2">
              {team.name}
            </div>

            {/* Gives */}
            {(team.gives.players.length > 0 ||
              team.gives.draftPicks.length > 0 ||
              team.gives.waiverBudget.length > 0) && (
              <div className="mb-3">
                <div className="text-xs font-medium text-red-600 mb-1">
                  Gives:
                </div>
                <AssetList assets={team.gives} />
              </div>
            )}

            {/* Receives - only show for multi-team trades */}
            {teamData.length > 2 &&
              (team.receives.players.length > 0 ||
                team.receives.draftPicks.length > 0 ||
                team.receives.waiverBudget.length > 0) && (
                <div>
                  <div className="text-xs font-medium text-green-600 mb-1">
                    Receives:
                  </div>
                  <AssetList assets={team.receives} />
                </div>
              )}

            {/* Nothing */}
            {team.gives.players.length === 0 &&
              team.gives.draftPicks.length === 0 &&
              team.gives.waiverBudget.length === 0 &&
              team.receives.players.length === 0 &&
              team.receives.draftPicks.length === 0 &&
              team.receives.waiverBudget.length === 0 && (
                <div className="text-sm text-gray-400 italic">No assets</div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeCard;

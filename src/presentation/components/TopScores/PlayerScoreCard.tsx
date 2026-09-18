import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons, getPlayer } from "@/data";
import { getUserByOwnerId, getUserAvatarUrl } from "@/utils/userAvatar";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { cardClassName } from "@/presentation/components/Card";
import { getMatchupUrl } from "./rankings";
import { PlayerScore } from "./types";

/** One player's score, ranked, with the team he scored it for. */
const PlayerScoreCard = ({
  player,
  index,
}: {
  player: PlayerScore;
  index: number;
}) => {
  const { number } = useFormatter();
  const user = getUserByOwnerId(player.owner_id, seasons[player.year]?.users);
  const avatarUrl = getUserAvatarUrl(user);
  const playerData = getPlayer(player.player_id, player.year);
  const playerImageUrl = getPlayerImageUrl(
    player.player_id,
    playerData?.position
  );

  return (
    // Same nesting as TopPerformances: the card goes to the matchup, the
    // player name goes to the player. A link inside a link is invalid HTML,
    // so this is a div with a stretched overlay anchor and the inner link
    // rises above it.
    <div
      className={
        cardClassName({
          padding: "sm",
          interactive: true,
          className: "block",
        }) + " relative"
      }
    >
      <Link
        to={getMatchupUrl(player)}
        className="absolute inset-0"
        aria-label={`View this ${player.year} week ${player.week} matchup`}
      />
      {/* Rank Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm">
            #{index + 1}
          </div>
          <div className="ml-3">
            <div className="text-lg font-bold text-gray-900">
              {number(player.score, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500">points</div>
          </div>
        </div>
      </div>

      {/* Player Info */}
      <div className="mb-3">
        <div className="flex items-center mb-2">
          {playerImageUrl ? (
            <img
              src={playerImageUrl}
              alt={`${player.player_name} photo`}
              className="w-8 h-8 rounded-full object-cover mr-2"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
              {player.player_name.charAt(0).toUpperCase()}
            </div>
          )}
          <Link
            to={`/players/${player.player_id}`}
            className="relative z-10 font-medium text-blue-600 hover:text-blue-800 hover:underline text-sm"
          >
            {player.player_name}
          </Link>
        </div>
        <div className="flex items-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${player.manager_name} avatar`}
              className="w-6 h-6 rounded-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
              {player.manager_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="ml-2">
            <div className="text-xs font-medium text-gray-700">
              {player.team_name}
            </div>
            <div className="text-xs text-gray-500">{player.manager_name}</div>
          </div>
        </div>
      </div>

      {/* Game Details */}
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Year:</span>
          <span className="font-medium">{player.year}</span>
        </div>
        <div className="flex justify-between">
          <span>Week:</span>
          <span className="font-medium">
            {player.week}
            {player.is_championship && " 🏆"}
            {player.is_playoff && !player.is_championship && " ⭐"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Started:</span>
          <span
            className={`font-medium ${
              player.was_started ? "text-green-600" : "text-red-600"
            }`}
          >
            {player.was_started ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {/* Hover Effect */}
      <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to view matchup →
      </div>
    </div>
  );
};

export default PlayerScoreCard;

import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons } from "@/data";
import { getUserByOwnerId, getUserAvatarUrl } from "@/utils/userAvatar";
import { cardClassName } from "@/presentation/components/Card";
import { getMatchupUrl } from "./rankings";
import { MatchTotal } from "./types";

/** One game's combined score, ranked, with both teams' halves of it. */
const MatchTotalCard = ({
  match,
  index,
}: {
  match: MatchTotal;
  index: number;
}) => {
  const { number } = useFormatter();
  const team1User = getUserByOwnerId(
    match.team1_id,
    seasons[match.year]?.users
  );
  const team2User = getUserByOwnerId(
    match.team2_id,
    seasons[match.year]?.users
  );
  const team1AvatarUrl = getUserAvatarUrl(team1User);
  const team2AvatarUrl = getUserAvatarUrl(team2User);

  return (
    <Link
      to={getMatchupUrl(match)}
      className={cardClassName({ padding: "sm", interactive: true, className: "block" })}
    >
      {/* Rank Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
            #{index + 1}
          </div>
          <div className="ml-3">
            <div className="text-lg font-bold text-gray-900">
              {number(match.total_score, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500">total points</div>
          </div>
        </div>
      </div>

      {/* Matchup Details */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            {team1AvatarUrl ? (
              <img
                src={team1AvatarUrl}
                alt={`${match.team1_name} avatar`}
                className="w-6 h-6 rounded-full object-cover mr-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                {match.team1_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="text-sm font-medium text-gray-900 truncate"
              title={match.team1_name}
            >
              {match.team1_name}
            </span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {number(match.team1_score, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="text-center text-xs text-gray-500">vs</div>
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            {team2AvatarUrl ? (
              <img
                src={team2AvatarUrl}
                alt={`${match.team2_name} avatar`}
                className="w-6 h-6 rounded-full object-cover mr-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                {match.team2_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="text-sm font-medium text-gray-900 truncate"
              title={match.team2_name}
            >
              {match.team2_name}
            </span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {number(match.team2_score, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Game Details */}
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Year:</span>
          <span className="font-medium">{match.year}</span>
        </div>
        <div className="flex justify-between">
          <span>Week:</span>
          <span className="font-medium">{match.week}</span>
        </div>
      </div>

      {/* Hover Effect */}
      <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to view matchup →
      </div>
    </Link>
  );
};

export default MatchTotalCard;

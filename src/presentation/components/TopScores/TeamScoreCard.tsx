import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons } from "@/data";
import { ExtendedMatchup } from "@/types/matchup";
import { getUserByOwnerId, getUserAvatarUrl } from "@/utils/userAvatar";
import { cardClassName } from "@/presentation/components/Card";
import { getMatchupUrl } from "./rankings";
import { TopScore } from "./types";

/** One team score, ranked: the manager, the game, and how the game went. */
const TeamScoreCard = ({
  score,
  index,
}: {
  score: TopScore;
  index: number;
}) => {
  const { number } = useFormatter();
  const user = getUserByOwnerId(score.owner_id, seasons[score.year]?.users);
  const avatarUrl = getUserAvatarUrl(user);

  return (
    <Link
      to={getMatchupUrl(score)}
      className={cardClassName({ padding: "sm", interactive: true, className: "block" })}
    >
      {/* Rank Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-sm">
            #{index + 1}
          </div>
          <div className="ml-3">
            <div className="text-lg font-bold text-gray-900">
              {number(score.score, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500">points</div>
          </div>
        </div>
      </div>

      {/* Manager Info */}
      <div className="flex items-center mb-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${score.manager_name} avatar`}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500">
            {score.manager_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="ml-3">
          <div className="font-medium text-gray-900 text-sm">
            {score.team_name}
          </div>
          <div className="text-xs text-gray-500">{score.manager_name}</div>
        </div>
      </div>

      {/* Game Details */}
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Year:</span>
          <span className="font-medium">{score.year}</span>
        </div>
        <div className="flex justify-between">
          <span>Week:</span>
          <span className="font-medium">{score.week}</span>
        </div>
        <div className="flex justify-between">
          <span>vs:</span>
          <div className="flex items-center">
            <span
              className="font-medium truncate ml-2"
              title={score.opponent_name}
            >
              {score.opponent_name}
            </span>
            <span className="ml-2 text-xs font-bold">
              {(() => {
                // Find the matchup data to determine win/loss/tie
                const seasonData = seasons[score.year];
                if (!seasonData?.matchups) return null;

                const weekMatchups =
                  seasonData.matchups[
                    score.week.toString() as keyof typeof seasonData.matchups
                  ];
                if (!weekMatchups) return null;

                const teamMatchup = weekMatchups.find(
                  (m: ExtendedMatchup) => {
                    const roster = seasonData.rosters?.find(
                      (r) => r.owner_id === score.owner_id
                    );
                    return roster && m.roster_id === roster.roster_id;
                  }
                );
                const opponentMatchup = weekMatchups.find(
                  (m: ExtendedMatchup) => {
                    const roster = seasonData.rosters?.find(
                      (r) => r.owner_id === score.opponent_id
                    );
                    return roster && m.roster_id === roster.roster_id;
                  }
                );

                if (!teamMatchup || !opponentMatchup) return null;

                if (teamMatchup.points > opponentMatchup.points) {
                  return <span className="text-green-600">(W)</span>;
                } else if (teamMatchup.points < opponentMatchup.points) {
                  return <span className="text-red-600">(L)</span>;
                } else {
                  return <span className="text-yellow-600">(T)</span>;
                }
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* Hover Effect */}
      <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to view matchup →
      </div>
    </Link>
  );
};

export default TeamScoreCard;

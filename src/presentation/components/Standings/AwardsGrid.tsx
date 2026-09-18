import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { getChampionshipHistory, getScumbo } from "./awards";

/**
 * The three cards under a completed season's standings: the Champion, the
 * Scoring Crown and the Scumbo.
 */
const AwardsGrid = ({
  standings,
  firstPlace,
  topScorer,
  scumbo,
  getTeamName,
  currentYear,
}: {
  standings: ExtendedRoster[];
  firstPlace: BracketMatch | undefined;
  topScorer: ExtendedRoster;
  scumbo: ReturnType<typeof getScumbo>;
  getTeamName: (ownerId: string) => string;
  currentYear?: number;
}) => {
  const { number } = useFormatter();

  return (
    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Champion */}
      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg border-2 border-yellow-200">
        <div className="text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h3 className="text-lg font-bold text-yellow-800 mb-2">
            Champion
          </h3>
          {(() => {
            const championRoster = standings.find(
              (r) => r.roster_id === firstPlace?.w
            );
            const championManagerId = championRoster
              ? getManagerIdBySleeperOwnerId(championRoster.owner_id)
              : null;
            const championName = championRoster
              ? getTeamName(championRoster.owner_id)
              : "TBD";

            // Calculate championship history
            const championshipHistory = () =>
              getChampionshipHistory(championRoster, currentYear);

            return championManagerId ? (
              <div>
                <Link
                  to={`/managers/${championManagerId}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                >
                  {championName}
                </Link>
                <div className="text-sm text-yellow-600 mt-1">
                  {championshipHistory()}
                </div>
              </div>
            ) : (
              <div>
                <span className="font-semibold">{championName}</span>
                <div className="text-sm text-yellow-600 mt-1">
                  {championshipHistory()}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Scoring Crown */}
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-200">
        <div className="text-center">
          <div className="text-4xl mb-2">👑</div>
          <h3 className="text-lg font-bold text-purple-800 mb-2">
            Scoring Crown
          </h3>
          {(() => {
            const scoringCrownManagerId = getManagerIdBySleeperOwnerId(
              topScorer.owner_id
            );
            const scoringCrownName = getTeamName(topScorer.owner_id);

            return scoringCrownManagerId ? (
              <Link
                to={`/managers/${scoringCrownManagerId}`}
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
              >
                {scoringCrownName}
              </Link>
            ) : (
              <span className="font-semibold">{scoringCrownName}</span>
            );
          })()}
          <div className="text-sm text-purple-600 mt-1">
            {number(
              (topScorer.settings.fpts +
                topScorer.settings.fpts_decimal / 100) /
                (topScorer.settings.wins +
                  topScorer.settings.losses +
                  topScorer.settings.ties),
              { maximumFractionDigits: 2 }
            )}{" "}
            points per game
          </div>
        </div>
      </div>

      {/* Scumbo */}
      <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-lg border-2 border-red-200">
        <div className="text-center">
          <div className="text-4xl mb-2">💩</div>
          <h3 className="text-lg font-bold text-red-800 mb-2">Scumbo</h3>
          {(() => {
            if (!scumbo?.roster) return <span className="font-semibold">—</span>;
            const scumboManagerId = getManagerIdBySleeperOwnerId(
              scumbo.roster.owner_id
            );
            const scumboName = getTeamName(scumbo.roster.owner_id);

            return scumboManagerId ? (
              <Link
                to={`/managers/${scumboManagerId}`}
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
              >
                {scumboName}
              </Link>
            ) : (
              <span className="font-semibold">{scumboName}</span>
            );
          })()}
          <div className="text-sm text-red-600 mt-1">
            {scumbo ? (
              <>
                {scumbo.leagueWins}-{scumbo.leagueLosses}
                {scumbo.leagueTies > 0 && `-${scumbo.leagueTies}`} league record
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AwardsGrid;

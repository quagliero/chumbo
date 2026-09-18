import { useMemo, useState } from "react";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getH2HData } from "./h2hData";
import OverallStats from "./OverallStats";
import MatchupTables from "./MatchupTables";
import AllStarLineups from "./AllStarLineups";
import BestPerformances from "./BestPerformances";

interface H2HContentProps {
  managerA: string;
  managerB: string;
}

export default function H2HContent({ managerA, managerB }: H2HContentProps) {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
  const [showAllRegularSeason, setShowAllRegularSeason] = useState(false);

  const h2hData = useMemo(
    () => getH2HData(managerA, managerB),
    [managerA, managerB]
  );

  if (!h2hData) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Matchup Not Found
        </h1>
        <p className="text-gray-600">
          The requested head-to-head matchup could not be found.
        </p>
      </div>
    );
  }

  const {
    managerA: managerAData,
    managerB: managerBData,
    regularSeasonMatchups,
    playoffMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
    stats,
  } = h2hData;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {managerAData?.teamName} vs {managerBData?.teamName}
          </h1>
          <p className="text-gray-600">
            Head-to-Head Record: {managerAData?.teamName} {stats.managerAWins}-
            {stats.managerBWins} {managerBData?.teamName}
            {stats.ties > 0 && ` (${stats.ties} ties)`}
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <OverallStats
        managerAData={managerAData}
        managerBData={managerBData}
        stats={stats}
      />

      {/* Regular Season and Playoff Matchups */}
      <MatchupTables
        managerAData={managerAData}
        managerBData={managerBData}
        regularSeasonMatchups={regularSeasonMatchups}
        playoffMatchups={playoffMatchups}
        showAllRegularSeason={showAllRegularSeason}
        setShowAllRegularSeason={setShowAllRegularSeason}
      />

      {/* All-Star Lineups */}
      <AllStarLineups
        managerAData={managerAData}
        managerBData={managerBData}
        managerALineup={managerALineup}
        managerBLineup={managerBLineup}
      />

      {/* Best Performances */}
      <BestPerformances
        managerAData={managerAData}
        managerBData={managerBData}
        managerABestPerformances={managerABestPerformances}
        managerBBestPerformances={managerBBestPerformances}
      />
    </div>
  );
}

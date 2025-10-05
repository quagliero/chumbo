import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { YEARS } from "../../domain/constants";
import { TabType } from "../../constants/fantasy";
import { useSeasonData } from "../../hooks/useSeasonData";
import { useTeamName } from "../../hooks/useTeamName";
import { ExtendedMatchup } from "../../types/matchup";
import DraftBoard from "../components/DraftBoard/DraftBoard";
import Standings from "../components/Standings/Standings";
import Matchups from "../components/Matchups/Matchups";
import PlayoffBracket from "../components/PlayoffBracket/PlayoffBracket";
import MatchupDetail from "../components/MatchupDetail/MatchupDetail";

const History = () => {
  const { year, tab, week, matchupId } = useParams<{
    year: string;
    tab: string;
    week: string;
    matchupId: string;
  }>();
  const navigate = useNavigate();

  // Parse URL params with fallbacks
  const initialYear = year ? parseInt(year) : YEARS[YEARS.length - 1];
  const initialTab = (tab as TabType) || "standings";

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // Redirect to default URL if no params provided
  useEffect(() => {
    if (!year || !tab) {
      navigate(`/history/${selectedYear}/${activeTab}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update state when URL params change
  useEffect(() => {
    if (year) {
      const parsedYear = parseInt(year);
      if (YEARS.includes(parsedYear)) {
        setSelectedYear(parsedYear);
      }
    }
    if (tab && ["standings", "matchups", "playoffs", "draft"].includes(tab)) {
      setActiveTab(tab as TabType);
    }
  }, [year, tab]);

  const seasonData = useSeasonData(selectedYear);
  const getTeamName = useTeamName(seasonData?.users);

  // Handle year change with URL update
  const handleYearChange = (newYear: number) => {
    setSelectedYear(newYear);
    navigate(`/history/${newYear}/${activeTab}`);
  };

  // Handle tab change with URL update
  const handleTabChange = (newTab: TabType) => {
    setActiveTab(newTab);
    navigate(`/history/${selectedYear}/${newTab}`);
  };

  // Get sorted standings
  const standings = useMemo(() => {
    if (!seasonData?.rosters) return [];
    return [...seasonData.rosters].sort((a, b) => {
      const aWinPerc =
        a.settings.wins /
        (a.settings.wins + a.settings.losses + a.settings.ties);
      const bWinPerc =
        b.settings.wins /
        (b.settings.wins + b.settings.losses + b.settings.ties);
      if (aWinPerc !== bWinPerc) return bWinPerc - aWinPerc;
      const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
      const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
      return bPoints - aPoints;
    });
  }, [seasonData]);

  // Get playoff seeds
  const getPlayoffSeed = (rosterId: number) => {
    if (!seasonData?.rosters || !seasonData?.league) return null;
    const playoffTeams = seasonData.league.settings?.playoff_teams || 6;
    const seedIndex = standings.findIndex((r) => r.roster_id === rosterId);
    return seedIndex < playoffTeams ? seedIndex + 1 : null;
  };

  // Get available weeks for the selected year
  const availableWeeks = useMemo(() => {
    if (!seasonData?.matchups) return [];
    return Object.keys(seasonData.matchups)
      .map(Number)
      .sort((a, b) => a - b);
  }, [seasonData]);

  // Get matchups for selected week
  const weekMatchups = useMemo(() => {
    if (!seasonData?.matchups || !selectedWeek) return [];
    const matchups =
      seasonData.matchups[
        selectedWeek.toString() as keyof typeof seasonData.matchups
      ];
    if (!matchups) return [];

    // Group matchups by matchup_id
    const grouped: { [key: number]: ExtendedMatchup[] } = {};
    matchups.forEach((m: ExtendedMatchup) => {
      if (!grouped[m.matchup_id]) {
        grouped[m.matchup_id] = [];
      }
      grouped[m.matchup_id].push(m);
    });

    return Object.values(grouped);
  }, [seasonData, selectedWeek]);

  return (
    <div className="space-y-6">
      {/* Year Selector */}
      <div className="container mx-auto space-y-2">
        <h1 className="text-2xl font-bold mr-4">League History</h1>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((year) => (
            <button
              key={year}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedYear === year
                  ? "bg-blue-800 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
              onClick={() => handleYearChange(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="container mx-auto">
          <nav className="flex gap-8">
            {["standings", "matchups", "playoffs", "draft"].map((tab) => (
              <button
                key={tab}
                className={`py-2 px-1 font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-blue-800 text-blue-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => handleTabChange(tab as TabType)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {/* Standings Tab */}
        {activeTab === "standings" && (
          <Standings
            standings={standings}
            getTeamName={getTeamName}
            league={seasonData?.league}
            winnersBracket={seasonData?.winners_bracket}
            users={seasonData?.users}
            matchups={seasonData?.matchups}
            currentYear={selectedYear}
          />
        )}

        {/* Matchups Tab */}
        {activeTab === "matchups" && (
          <>
            {week && matchupId ? (
              // Show matchup detail
              (() => {
                const weekNum = parseInt(week);
                const matchupIdNum = parseInt(matchupId);
                const weekMatchupsData =
                  seasonData.matchups?.[
                    weekNum.toString() as keyof typeof seasonData.matchups
                  ];

                if (!weekMatchupsData) return <div>Matchup not found</div>;

                // Find the specific matchup
                const matchup = weekMatchupsData.filter(
                  (m: ExtendedMatchup) => m.matchup_id === matchupIdNum
                );

                if (matchup.length !== 2)
                  return <div>Invalid matchup data</div>;

                return (
                  <MatchupDetail
                    matchup={matchup as [ExtendedMatchup, ExtendedMatchup]}
                    rosters={seasonData.rosters}
                    getTeamName={getTeamName}
                    week={weekNum}
                    year={selectedYear}
                    allMatchups={seasonData.matchups || {}}
                    users={seasonData?.users}
                  />
                );
              })()
            ) : (
              // Show matchups list
              <Matchups
                weekMatchups={weekMatchups}
                availableWeeks={availableWeeks}
                selectedWeek={selectedWeek}
                onWeekChange={setSelectedWeek}
                rosters={seasonData.rosters}
                getTeamName={getTeamName}
                year={selectedYear}
                allMatchups={seasonData.matchups || {}}
                users={seasonData?.users}
              />
            )}
          </>
        )}

        {/* Playoffs Tab */}
        {activeTab === "playoffs" && (
          <>
            {seasonData?.winners_bracket &&
            seasonData.winners_bracket.length > 0 ? (
              <PlayoffBracket
                winnersBracket={seasonData.winners_bracket}
                rosters={seasonData.rosters}
                getTeamName={getTeamName}
                getPlayoffSeed={getPlayoffSeed}
                matchups={seasonData.matchups}
                league={seasonData.league}
                year={selectedYear}
                users={seasonData?.users}
              />
            ) : (
              <div className="text-center text-gray-500 py-8">
                Playoff data not available for this season
              </div>
            )}
          </>
        )}

        {/* Draft Tab */}
        {activeTab === "draft" && (
          <div>
            {seasonData?.picks &&
            seasonData.picks.length > 0 &&
            seasonData?.draft ? (
              <DraftBoard
                draft={seasonData.draft}
                picks={seasonData.picks}
                rosters={seasonData.rosters}
                getTeamName={getTeamName}
                year={selectedYear}
              />
            ) : (
              <div className="text-center text-gray-500 py-8">
                Draft data not available for this season
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;

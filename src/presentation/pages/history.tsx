import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { YEARS } from "../../domain/constants";
import { TabType } from "../../constants/fantasy";
import { useSeasonData } from "../../hooks/useSeasonData";
import { useTeamName } from "../../hooks/useTeamName";
import { ExtendedMatchup } from "../../types/matchup";
import { ExtendedRoster } from "../../types/roster";
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

  // Calculate H2H record between two teams
  const getH2HRecord = (
    team1: ExtendedRoster,
    team2: ExtendedRoster,
    matchups: Record<string, ExtendedMatchup[]> | undefined,
    playoffWeekStart?: number
  ) => {
    if (!matchups) return { wins: 0, losses: 0, ties: 0 };

    let wins = 0;
    let losses = 0;
    let ties = 0;

    Object.keys(matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Skip playoff weeks if playoffWeekStart is provided
      if (playoffWeekStart && weekNum >= playoffWeekStart) return;

      const weekMatchups = matchups[weekKey];
      const team1Matchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === team1.roster_id
      );
      const team2Matchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === team2.roster_id
      );

      if (!team1Matchup || !team2Matchup) return;

      // Check if they played each other this week
      if (team1Matchup.matchup_id === team2Matchup.matchup_id) {
        const team1Score = team1Matchup.points;
        const team2Score = team2Matchup.points;

        if (team1Score > team2Score) {
          wins++;
        } else if (team1Score < team2Score) {
          losses++;
        } else {
          ties++;
        }
      }
    });

    return { wins, losses, ties };
  };

  // Get playoff seeds using bracket-based analysis
  const getPlayoffSeed = (rosterId: number) => {
    if (
      !seasonData?.winners_bracket ||
      !seasonData?.league?.settings?.playoff_teams
    )
      return null;

    const playoffTeams = new Set<number>();
    const playoffTeamSeeds: Record<number, number> = {};

    // Get all teams that appear in the winners bracket (these are the playoff teams)
    seasonData.winners_bracket.forEach((match) => {
      if (match.t1) playoffTeams.add(match.t1);
      if (match.t2) playoffTeams.add(match.t2);
    });

    if (!playoffTeams.has(rosterId)) return null;

    const hasDivisions = seasonData.league.settings.divisions > 0;

    if (hasDivisions) {
      // For division-based leagues, analyze bracket structure to determine seeds
      const firstRoundTeams = new Set<number>();
      const byeTeams = new Set<number>();

      // Find the first round (lowest round number)
      const firstRound = Math.min(
        ...seasonData.winners_bracket.map((m) => m.r)
      );

      seasonData.winners_bracket.forEach((match) => {
        if (match.r === firstRound) {
          if (match.t1) firstRoundTeams.add(match.t1);
          if (match.t2) firstRoundTeams.add(match.t2);
        }
      });

      // Teams with byes are playoff teams that don't appear in first round
      playoffTeams.forEach((teamId) => {
        if (!firstRoundTeams.has(teamId)) {
          byeTeams.add(teamId);
        }
      });

      // Assign seeds 1-2 to bye teams (sorted by their standings)
      const byeTeamRosters = [...seasonData.rosters]
        .filter((r) => byeTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      let seed = 1;
      byeTeamRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });

      // Assign seeds 3-6 to remaining playoff teams (first round participants)
      const firstRoundRosters = [...seasonData.rosters]
        .filter((r) => firstRoundTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      firstRoundRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });
    } else {
      // For non-division leagues, use H2H tiebreaking like standings
      const sortedStandings = [...seasonData.rosters].sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        // First tiebreaker: Win percentage
        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        // For non-division years, only use H2H for 2012
        if (year && parseInt(year) === 2012) {
          const h2hRecord = getH2HRecord(
            a,
            b,
            seasonData.matchups,
            seasonData.league?.settings?.playoff_week_start
          );
          const totalH2HGames =
            h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

          // Only use H2H if teams actually played each other
          if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
            return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
          }
        }

        // Final tiebreaker: Points
        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      });

      let seed = 1;
      sortedStandings.forEach((roster) => {
        if (playoffTeams.has(roster.roster_id)) {
          playoffTeamSeeds[roster.roster_id] = seed;
          seed++;
        }
      });
    }

    return playoffTeamSeeds[rosterId] || null;
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

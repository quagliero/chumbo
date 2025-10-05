import { useFormatter } from "use-intl";
import { useNavigate } from "react-router-dom";
import { ExtendedMatchup } from "../../../types/matchup";
import { ExtendedRoster } from "../../../types/roster";
import { getRecordUpToWeek } from "../../../utils/matchupStats";

interface MatchupsProps {
  weekMatchups: ExtendedMatchup[][];
  availableWeeks: number[];
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  year: number;
  allMatchups: Record<string, ExtendedMatchup[]>; // For record calculations
}

const Matchups = ({
  weekMatchups,
  availableWeeks,
  selectedWeek,
  onWeekChange,
  rosters,
  getTeamName,
  year,
  allMatchups,
}: MatchupsProps) => {
  const { number } = useFormatter();
  const navigate = useNavigate();

  return (
    <div className="space-y-4 container mx-auto">
      {/* Week Selector */}
      <div className="flex flex-wrap gap-2">
        {availableWeeks.map((week) => (
          <button
            key={week}
            className={`px-3 py-1 rounded text-sm font-medium ${
              selectedWeek === week
                ? "bg-blue-800 text-white"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            onClick={() => onWeekChange(week)}
          >
            Week {week}
          </button>
        ))}
      </div>

      {/* Matchups Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {weekMatchups.map((matchup, index) => {
          const [team1, team2] = matchup;
          if (!team1 || !team2) return null;

          const team1Name = getTeamName(
            rosters.find((r) => r.roster_id === team1.roster_id)?.owner_id || ""
          );
          const team2Name = getTeamName(
            rosters.find((r) => r.roster_id === team2.roster_id)?.owner_id || ""
          );

          // Calculate records up to and including this week
          const team1Record = getRecordUpToWeek(
            team1.roster_id,
            allMatchups,
            selectedWeek + 1
          );
          const team2Record = getRecordUpToWeek(
            team2.roster_id,
            allMatchups,
            selectedWeek + 1
          );

          const winner =
            team1.points > team2.points
              ? team1.roster_id
              : team2.points > team1.points
              ? team2.roster_id
              : null;

          return (
            <div
              key={index}
              className="border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() =>
                navigate(
                  `/history/${year}/matchups/${selectedWeek}/${team1.matchup_id}`
                )
              }
            >
              <div className="space-y-2">
                <div
                  className={`flex justify-between items-center p-2 rounded ${
                    winner === team1.roster_id ? "bg-green-50" : ""
                  }`}
                >
                  <div className="font-medium">
                    <div>{team1Name}</div>
                    <div className="text-xs text-gray-500">
                      ({team1Record.wins}-{team1Record.losses}
                      {team1Record.ties > 0 && `-${team1Record.ties}`})
                    </div>
                  </div>
                  <span className="text-lg font-bold">
                    {number(team1.points, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div
                  className={`flex justify-between items-center p-2 rounded ${
                    winner === team2.roster_id ? "bg-green-50" : ""
                  }`}
                >
                  <div className="font-medium">
                    <div>{team2Name}</div>
                    <div className="text-xs text-gray-500">
                      ({team2Record.wins}-{team2Record.losses}
                      {team2Record.ties > 0 && `-${team2Record.ties}`})
                    </div>
                  </div>
                  <span className="text-lg font-bold">
                    {number(team2.points, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Matchups;

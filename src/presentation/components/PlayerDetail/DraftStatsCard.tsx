import { StandardTable } from "../Table";

export interface DraftPick {
  year: number;
  round: number;
  pickNo: number;
  draftSlot: number;
  ownerId: string;
  teamName: string;
  managerName: string;
  position?: string;
}

export interface DraftRoundStats {
  earliestRound: number;
  latestRound: number;
  earliestDisplay: string;
  latestDisplay: string;
}

export interface MostDraftedBy {
  teams: string[];
  count: number;
}

interface DraftStatsCardProps {
  draftPicks: DraftPick[];
  mostDraftedBy: MostDraftedBy | null;
  draftRoundStats: DraftRoundStats | null;
}

const DraftStatsCard = ({
  draftPicks,
  mostDraftedBy,
  draftRoundStats,
}: DraftStatsCardProps) => {
  if (draftPicks.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <h2 className="text-xl font-bold text-gray-900 px-6 py-4 border-b border-gray-200">
        Draft Breakdown
      </h2>

      <StandardTable
        headers={[
          { key: "year", label: "Year" },
          { key: "round", label: "Round" },
          { key: "slot", label: "Pick" },
          { key: "pick", label: "Overall" },
          { key: "team", label: "Team" },
        ]}
        rows={draftPicks.map((pick) => ({
          key: `${pick.year}-${pick.pickNo}`,
          cells: [
            { content: pick.year, className: "font-medium" },
            { content: pick.round },
            { content: pick.draftSlot },
            { content: `#${pick.pickNo}` },
            { content: pick.teamName },
          ],
        }))}
      />

      {/* Draft Statistics */}
      <div className="border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Total Drafts</h3>
          <p className="text-2xl font-bold text-gray-900">
            {draftPicks.length}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Most Drafted By</h3>
          <p className="text-lg font-bold text-gray-900">
            {mostDraftedBy ? (
              <>
                {mostDraftedBy.teams.join(", ")}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({mostDraftedBy.count}x)
                </span>
              </>
            ) : (
              "N/A"
            )}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Earliest Round</h3>
          <p className="text-lg font-bold text-gray-900">
            {draftRoundStats ? (
              <>
                {draftRoundStats.earliestRound}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({draftRoundStats.earliestDisplay})
                </span>
              </>
            ) : (
              "N/A"
            )}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Latest Round</h3>
          <p className="text-lg font-bold text-gray-900">
            {draftRoundStats ? (
              <>
                {draftRoundStats.latestRound}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({draftRoundStats.latestDisplay})
                </span>
              </>
            ) : (
              "N/A"
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DraftStatsCard;

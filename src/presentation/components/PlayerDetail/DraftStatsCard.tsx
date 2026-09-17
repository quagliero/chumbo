import { Fragment } from "react";
import { StandardTable } from "../Table";
import { ManagerLink, SeasonLink } from "@/presentation/components/Links";
import { Card } from "@/presentation/components/Card";

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
    <Card padding="none">
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
            {
              content: (
                <SeasonLink
                  year={pick.year}
                  tab="draft"
                  title={`${pick.year} draft board`}
                >
                  {pick.year}
                </SeasonLink>
              ),
              className: "font-medium",
            },
            { content: pick.round },
            { content: pick.draftSlot },
            { content: `#${pick.pickNo}` },
            {
              content: (
                <ManagerLink ownerId={pick.ownerId} title={pick.managerName}>
                  {pick.teamName}
                </ManagerLink>
              ),
            },
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
                {mostDraftedBy.teams.map((teamName, index) => (
                  <Fragment key={teamName}>
                    {index > 0 && ", "}
                    <ManagerLink
                      ownerId={
                        draftPicks.find((p) => p.teamName === teamName)?.ownerId
                      }
                    >
                      {teamName}
                    </ManagerLink>
                  </Fragment>
                ))}
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
    </Card>
  );
};

export default DraftStatsCard;

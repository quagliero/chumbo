import { Fragment } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { ManagerLink } from "@/presentation/components/Links";
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

const columnHelper = createColumnHelper<DraftPick>();

const columns = [
  columnHelper.accessor("year", {
    header: "Year",
    cell: (info) => info.getValue(),
    meta: {
      kind: "year" as const,
      seasonTab: "draft",
      linkTitle: (row: DraftPick) => `${row.year} draft board`,
      cellClassName: "font-medium",
    },
  }),
  columnHelper.accessor("round", {
    header: "Round",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    meta: { kind: "numeric" as const },
  }),
  columnHelper.accessor("draftSlot", {
    header: "Pick",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    meta: { kind: "numeric" as const },
  }),
  columnHelper.accessor("pickNo", {
    header: "Overall",
    cell: (info) => `#${info.getValue()}`,
    sortingFn: "basic",
    meta: { kind: "numeric" as const },
  }),
  columnHelper.accessor("teamName", {
    header: "Team",
    cell: (info) => info.getValue(),
    meta: {
      kind: "manager" as const,
      ownerId: (row: DraftPick) => row.ownerId,
      // The cell shows the team name; the tooltip says whose team it was.
      linkTitle: (row: DraftPick) => row.managerName,
    },
  }),
];

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

      <DataTable columns={columns} data={draftPicks} />

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

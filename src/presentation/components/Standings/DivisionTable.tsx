import { useMemo } from "react";
import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { ExtendedUser } from "@/types/user";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { DataTable } from "../Table";
import { ManagerIdentity } from "@/presentation/components/ManagerIdentity";
import { TeamStandingData } from "./standingsData";

// One table per division. Kept as its own component because each needs its own
// table instance.
//
// The columns are built here rather than passed in: they only ever depended on
// the season (divisions, the live schedule, the users' avatars), which every
// division shares, and were rebuilt on every render wherever they lived.
const DivisionTable = ({
  division,
  data,
  hasDivisions,
  getDivisionInfo,
  users,
  hasStrengthOfSchedule,
}: {
  division: number;
  data: TeamStandingData[];
  hasDivisions: boolean;
  getDivisionInfo: (division: number) => {
    name: string;
    avatar: string | null;
  };
  users?: ExtendedUser[];
  hasStrengthOfSchedule: boolean;
}) => {
  const { number } = useFormatter();
  const columnHelper = createColumnHelper<TeamStandingData>();

  // Create table columns
  const columns = useMemo(
    () => [
      columnHelper.accessor("rank", {
        header: () => "Rank",
        cell: (info) => {
          const row = info.row.original;
          let rankText = info.getValue().toString();
          if (row.isChampion) rankText += " 🥇";
          if (row.isRunnerUp) rankText += " 🥈";
          if (row.isThirdPlace) rankText += " 🥉";
          if (row.isTopScorer) rankText += " 🎯";
          if (row.isBottomScorer) rankText += " 💩";
          return <span className="font-medium">{rankText}</span>;
        },
        enableSorting: false,
        meta: { cellClassName: "whitespace-nowrap w-12" },
      }),
      columnHelper.accessor("teamName", {
        header: () => "Team",
        cell: (info) => {
          const row = info.row.original;
          const user = getUserByOwnerId(row.roster.owner_id, users);
          const avatarUrl = getUserAvatarUrl(user);
          const teamName = info.getValue();

          return (
            <ManagerIdentity
              ownerId={row.roster.owner_id}
              teamName={teamName}
              avatarUrl={avatarUrl}
            />
          );
        },
        enableSorting: false,
        meta: {
          kind: "manager" as const,
          ownerId: (row: TeamStandingData) => row.roster.owner_id,
        },
      }),
      columnHelper.accessor("wins", {
        header: () => "W",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("losses", {
        header: () => "L",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("ties", {
        header: () => "T",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("winPerc", {
        header: () => "Win %",
        cell: (info) => {
          const formatted = number(info.getValue(), {
            maximumFractionDigits: 3,
            minimumFractionDigits: 3,
          });
          return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
        },
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      ...(hasDivisions
        ? [
            columnHelper.accessor("divisionRecord", {
              header: () => "Div Record",
              cell: (info) => {
                const record = info.getValue();
                if (!record) return "-";
                return `${record.wins}-${record.losses}${
                  record.ties > 0 ? `-${record.ties}` : ""
                }`;
              },
              enableSorting: false,
              meta: { kind: "record" as const, cellClassName: "text-xs" },
            }),
          ]
        : []),
      columnHelper.accessor("pointsFor", {
        header: () => "Points For",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("avgPointsFor", {
        header: () => "Avg For",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("pointsAgainst", {
        header: () => "Points Against",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("avgPointsAgainst", {
        header: () => "Avg Against",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      ...(hasStrengthOfSchedule
        ? [
            columnHelper.accessor("sosRank", {
              header: () => "SOS",
              cell: (info) => {
                const sosRank = info.getValue();
                if (!sosRank) return "-";

                const normalized = (sosRank - 1) / 11;
                const red = Math.round(255 * (1 - normalized));
                const green = Math.round(255 * normalized);
                const blue = 0;
                const color = `rgb(${red}, ${green}, ${blue})`;

                return (
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: color }}
                  >
                    {sosRank}
                  </span>
                );
              },
              sortingFn: "alphanumeric",
              enableSorting: true,
              meta: { align: "center" as const },
            }),
          ]
        : []),
    ],
    [columnHelper, hasDivisions, number, users, hasStrengthOfSchedule]
  );

  return (
    <div className={hasDivisions ? "mb-8" : ""}>
      {hasDivisions && (
        <div>
          <h2 className="text-xl font-bold text-ink mb-2 flex items-center">
            {(() => {
              const divisionInfo = getDivisionInfo(division);
              return (
                <>
                  {divisionInfo.avatar && (
                    <img
                      src={divisionInfo.avatar}
                      alt={`${divisionInfo.name} avatar`}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  )}
                  {divisionInfo.name}
                </>
              );
            })()}
          </h2>
          <div className="border-b-2 border-line-strong"></div>
        </div>
      )}
      <DataTable
        columns={columns}
        data={data}
        // Rank and team together are the row's identity; pinning the rank alone
        // would leave a phone scrolling numbers with no name against them.
        stickyColumns={2}
        // Playoff seeding already colours rows; zebra on top of it reads as noise.
        zebra={false}
        // Legacy Tailwind palette, deliberately — see the note in AllTimeTable.
        // These are the exact colours the table had before.
        getRowBackground={(row) =>
          row.original.playoffHighlight === "bye"
            ? "bg-green-50"
            : row.original.playoffHighlight === "playoff"
            ? "bg-yellow-50"
            : undefined
        }
        getRowClassName={(row) =>
          row.original.playoffHighlight === "bye"
            ? "border-l-4 border-green-500"
            : row.original.playoffHighlight === "playoff"
            ? "border-l-4 border-yellow-500"
            : ""
        }
        emptyMessage="No standings for this season yet."
      />
    </div>
  );
};

export default DivisionTable;

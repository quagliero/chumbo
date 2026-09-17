import { useMemo } from "react";
import { useFormatter } from "use-intl";
import { useNavigate } from "react-router-dom";
import { createColumnHelper } from "@tanstack/react-table";
import type { SeasonStats } from "@/utils/managerStats";
import { DataTable } from "@/presentation/components/Table";
import { Card } from "@/presentation/components/Card";

/** The pill colours for a finishing position. Shared by both rank badges. */
const standingClass = (standing: number) =>
  standing === 1
    ? "bg-yellow-100 text-yellow-800"
    : standing <= 4
    ? "bg-green-100 text-green-800"
    : standing <= 8
    ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-800";

const Badge = ({
  className,
  title,
  children,
}: {
  className: string;
  title?: string;
  children: React.ReactNode;
}) => (
  <span
    className={`px-2 py-1 rounded-full text-xs font-medium ${className}`}
    title={title}
  >
    {children}
  </span>
);

const columnHelper = createColumnHelper<SeasonStats>();

interface SeasonBreakdownProps {
  seasonStats: SeasonStats[];
}

const SeasonBreakdown = ({ seasonStats }: SeasonBreakdownProps) => {
  const { number } = useFormatter();
  const navigate = useNavigate();

  const columns = useMemo(
    () => [
      columnHelper.accessor("year", {
        header: "Year",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
        // Same destination as the row click, so the year is the affordance a
        // keyboard user can actually reach.
        meta: { kind: "year" as const, cellClassName: "font-medium" },
      }),
      columnHelper.display({
        id: "record",
        header: "Record",
        cell: ({ row }) => {
          const { wins, losses, ties } = row.original;
          const winPercentage = (wins / (wins + losses + ties)) * 100;
          return (
            <>
              {wins}-{losses}
              {ties > 0 && `-${ties}`}
              <div className="text-sm text-ink-muted">
                {number(winPercentage, { maximumFractionDigits: 1 })}%
              </div>
            </>
          );
        },
        meta: { kind: "record" as const, align: "left" as const },
      }),
      columnHelper.display({
        id: "standing",
        header: "Standing / Points",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Badge
              className={standingClass(row.original.finalStanding)}
              title="Regular season finish"
            >
              #{row.original.finalStanding}
            </Badge>
            <Badge
              className={standingClass(row.original.pointsStanding)}
              title="Points scored rank"
            >
              #{row.original.pointsStanding || "?"}
            </Badge>
          </div>
        ),
      }),
      columnHelper.accessor("pointsFor", {
        header: "Points For",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "basic",
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("pointsAgainst", {
        header: "Points Against",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "basic",
        meta: { kind: "points" as const },
      }),
      columnHelper.display({
        id: "result",
        header: "Result",
        cell: ({ row }) => {
          const season = row.original;
          return (
            <div className="flex gap-1">
              {season.madePlayoffs && (
                <Badge className="bg-green-100 text-green-800">Playoffs</Badge>
              )}
              {season.championshipResult === "champion" && (
                <Badge className="bg-yellow-100 text-yellow-800">
                  🏆 Champion
                </Badge>
              )}
              {season.championshipResult === "runner-up" && (
                <Badge className="bg-gray-100 text-gray-800">Finals</Badge>
              )}
              {season.scoringCrown && (
                <Badge className="bg-purple-100 text-purple-800">
                  👑 Scoring Crown
                </Badge>
              )}
            </div>
          );
        },
      }),
    ],
    [number]
  );

  return (
    <Card padding="none">
      <h2 className="text-2xl font-bold p-6">Season Breakdown</h2>
      <DataTable
        columns={columns}
        data={seasonStats}
        className="border-t border-line"
        onRowClick={(season) => navigate(`/seasons/${season.year}/standings`)}
        emptyMessage="No seasons to show."
      />
    </Card>
  );
};

export default SeasonBreakdown;

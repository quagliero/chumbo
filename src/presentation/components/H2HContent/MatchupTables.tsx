import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { Manager } from "@/types/manager";
import { DataTable } from "../Table";
import { Card } from "@/presentation/components/Card";
import { H2HMatchup } from "./h2hGames";
import { playoffRoundLabel } from "./h2hData";
import Pill from "./Pill";

const matchupColumnHelper = createColumnHelper<H2HMatchup>();

/**
 * The two chronologies: every regular-season meeting (the last five unless
 * expanded) and every playoff meeting. Whether the list is expanded stays
 * the page's state, where it always was, so it lasts exactly as long.
 */
const MatchupTables = ({
  managerAData,
  managerBData,
  regularSeasonMatchups,
  playoffMatchups,
  showAllRegularSeason,
  setShowAllRegularSeason,
}: {
  managerAData: Manager;
  managerBData: Manager;
  regularSeasonMatchups: H2HMatchup[];
  playoffMatchups: H2HMatchup[];
  showAllRegularSeason: boolean;
  setShowAllRegularSeason: (showAll: boolean) => void;
}) => {
  const { number } = useFormatter();

  /** Who won, named. "W" is from manager A's point of view throughout. */
  const winnerPill = (result: H2HMatchup["result"]) => (
    <Pill
      className={
        result === "W"
          ? "bg-blue-100 text-blue-800"
          : result === "L"
          ? "bg-purple-100 text-purple-800"
          : "bg-gray-100 text-gray-800"
      }
    >
      {result === "W"
        ? managerAData?.teamName
        : result === "L"
        ? managerBData?.teamName
        : "Tie"}
    </Pill>
  );

  const yearColumn = matchupColumnHelper.accessor("year", {
    header: "Year",
    cell: (info) => info.getValue(),
    enableSorting: false,
    // A year reads as this row's label, not as a quantity to compare down the
    // column, so it keeps the left edge but takes tabular figures.
    meta: {
      kind: "numeric" as const,
      align: "left" as const,
      cellClassName: "font-medium",
    },
  });

  const scoreColumn = matchupColumnHelper.display({
    id: "score",
    header: "Score",
    cell: ({ row }) =>
      `${number(row.original.managerAPoints, {
        maximumFractionDigits: 2,
      })} - ${number(row.original.managerBPoints, {
        maximumFractionDigits: 2,
      })}`,
    meta: { kind: "record" as const, align: "left" as const },
  });

  const resultColumn = matchupColumnHelper.display({
    id: "result",
    header: "Result",
    cell: ({ row }) => winnerPill(row.original.result),
  });

  // These tables are a chronology, and the regular-season one is cut to the
  // last five unless expanded — a column sort would reorder that window rather
  // than the record, so sorting stays off on both.
  const regularSeasonColumns = [
    yearColumn,
    matchupColumnHelper.display({
      id: "week",
      header: "Week",
      cell: ({ row }) =>
        row.original.matchupId ? (
          <Link
            to={`/seasons/${row.original.year}/matchups/${row.original.week}/${row.original.matchupId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Week {row.original.week}
          </Link>
        ) : (
          `Week ${row.original.week}`
        ),
    }),
    scoreColumn,
    resultColumn,
  ];

  const playoffColumns = [
    yearColumn,
    matchupColumnHelper.display({
      id: "round",
      header: "Round",
      cell: ({ row }) => playoffRoundLabel(row.original.year, row.original.week),
    }),
    scoreColumn,
    resultColumn,
  ];

  return (
    <>
      {/* Regular Season Matchups */}
      <Card padding="none" className="mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Regular Season Matchups ({regularSeasonMatchups.length})
            </h2>
            {regularSeasonMatchups.length > 5 && (
              <button
                onClick={() => setShowAllRegularSeason(!showAllRegularSeason)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showAllRegularSeason ? "Show Last 5" : "Show All"}
              </button>
            )}
          </div>
        </div>
        <DataTable
          columns={regularSeasonColumns}
          data={
            showAllRegularSeason
              ? regularSeasonMatchups
              : regularSeasonMatchups.slice(0, 5)
          }
          emptyMessage="These two have never met in the regular season."
        />
      </Card>

      {/* Playoff Matchups */}
      {playoffMatchups.length > 0 && (
        <Card padding="none" className="mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Playoff Matchups
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              These games are not included in the overall statistics above.
            </p>
          </div>
          <DataTable
            columns={playoffColumns}
            data={[...playoffMatchups].sort((a, b) =>
              // Newest season first; within a season, the earliest round first.
              a.year !== b.year ? b.year - a.year : a.week - b.week
            )}
          />
        </Card>
      )}
    </>
  );
};

export default MatchupTables;

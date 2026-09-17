import { useMemo, useState } from "react";
import managers from "@/data/managers.json";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getManagerStats, type DataMode, type ManagerStats } from "@/utils/managerStats";
import { ManagerCard, useManagerAvatars } from "@/presentation/components/ManagerCard";
import { useCareerSparklines } from "@/presentation/components/Chart/CareerSparkline/useCareerSparkline";

/**
 * The Managers page (F1).
 *
 * The card itself is `components/ManagerCard`; this file is the controls, the
 * ordering, and the grid that the cards' subgrid rows hang off.
 *
 * The sort comparators used to be a 90-line `switch` inside the render, with
 * every branch recomputing win percentages from four fields. They are a table
 * now — one row per option, carrying its own label so the card's rank badge can
 * say what the number means rather than showing an unexplained "#3".
 */

const winPct = (m: ManagerStats) => {
  const games = m.totalWins + m.totalLosses + m.totalTies;
  return games > 0 ? m.totalWins / games : 0;
};

const leaguePct = (m: ManagerStats) => {
  const games = m.leagueWins + m.leagueLosses + m.leagueTies;
  return games > 0 ? m.leagueWins / games : 0;
};

const pointsAvg = (m: ManagerStats) => {
  const games = m.totalWins + m.totalLosses + m.totalTies;
  return games > 0 ? m.totalPointsFor / games : 0;
};

/**
 * Every sort is "this, then that": a tie on championships is broken by finals
 * appearances, a tie on wins by win percentage. Each option lists its keys in
 * order of precedence and the comparator walks them, so adding one is a line
 * rather than another branch of a switch.
 */
const SORTS = {
  wins: { label: "win total", keys: [(m: ManagerStats) => m.totalWins, winPct] },
  winPct: { label: "win %", keys: [winPct, (m: ManagerStats) => m.totalWins] },
  leagueRecord: {
    label: "league record",
    keys: [(m: ManagerStats) => m.leagueWins, leaguePct],
  },
  leagueRecordPct: {
    label: "league record %",
    keys: [leaguePct, (m: ManagerStats) => m.leagueWins],
  },
  pointsTotal: {
    label: "points total",
    keys: [(m: ManagerStats) => m.totalPointsFor],
  },
  pointsAverage: {
    label: "points average",
    keys: [pointsAvg, (m: ManagerStats) => m.totalPointsFor],
  },
  championships: {
    label: "championships",
    keys: [
      (m: ManagerStats) => m.championships,
      (m: ManagerStats) => m.runnerUps,
      (m: ManagerStats) => m.scoringCrowns,
    ],
  },
  playoffs: {
    label: "playoff berths",
    keys: [
      (m: ManagerStats) => m.playoffs,
      (m: ManagerStats) => m.championships,
      (m: ManagerStats) => m.runnerUps,
    ],
  },
} satisfies Record<
  string,
  { label: string; keys: ((m: ManagerStats) => number)[] }
>;

type SortOption = keyof typeof SORTS;

const SORT_LABELS: Record<SortOption, string> = {
  wins: "Win Total",
  winPct: "Win %",
  leagueRecord: "League Record",
  leagueRecordPct: "League Record %",
  pointsTotal: "Points Total",
  pointsAverage: "Points Average",
  championships: "Championships",
  playoffs: "Playoffs",
};

const selectClassName =
  "rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-series-1";

const Managers = () => {
  // A2a: getManagerStats walks every season's matchups, which are a lazy
  // chunk now; suspend until they are in.
  useAllSeasons();
  const [sortBy, setSortBy] = useState<SortOption>("wins");
  const [dataMode, setDataMode] = useState<DataMode>("regular");

  const avatars = useManagerAvatars();
  // One walk over the seasons for all fourteen sparklines, not fourteen.
  const { byManager: careers, years } = useCareerSparklines();

  const ordered = useMemo(() => {
    const { keys } = SORTS[sortBy];
    return managers
      .map((manager) => getManagerStats(manager.id, dataMode))
      .filter((m): m is ManagerStats => m !== null)
      .sort((a, b) => {
        for (const key of keys) {
          const difference = key(b) - key(a);
          if (difference !== 0) return difference;
        }
        return 0;
      });
  }, [sortBy, dataMode]);

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Managers</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ordered.length} careers, by {SORTS[sortBy].label}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="hidden sm:inline">Games</span>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className={selectClassName}
            >
              <option value="regular">Regular Season Only</option>
              <option value="playoffs">Playoffs Only</option>
              <option value="combined">Regular + Playoffs</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="hidden sm:inline">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={selectClassName}
            >
              {(Object.keys(SORTS) as SortOption[]).map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/*
        F1d. The cards do not size their own rows: each spans four of this
        grid's rows and lays its sections out with `grid-rows-subgrid`, so the
        trophy shelves, the stat blocks and the sparklines of every card in a
        row share a baseline. `auto-rows-auto` is what the subgrid children
        then size, which is why the row heights still come from the content
        rather than being pinned to a guess.
      */}
      <div className="grid auto-rows-auto grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((stats, index) => (
          <ManagerCard
            key={stats.managerId}
            stats={stats}
            shape={careers.get(stats.managerId)}
            years={years}
            avatarUrl={avatars[stats.managerId] ?? null}
            dataMode={dataMode}
            rank={index + 1}
            rankLabel={SORTS[sortBy].label}
          />
        ))}
      </div>
    </div>
  );
};

export default Managers;

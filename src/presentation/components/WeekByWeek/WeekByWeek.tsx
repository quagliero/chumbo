import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { Card } from "@/presentation/components/Card";
import {
  MIN_WEEK_GAMES,
  bestAndWorstWeeks,
  getWeekByWeek,
  recordText,
  signed,
  type ManagerWeeks,
  type WeekCell,
} from "@/utils/weekByWeek";

/**
 * Each manager in each week of the season (`utils/weekByWeek.ts`): the whole
 * league as a grid on the Explorer, and one manager's row on their page.
 */

export type WeekMetric = "record" | "points";

const GREEN = "22, 163, 74";
const RED = "220, 38, 38";

/** −1..1, where the metric is neutral at 0. */
const strength = (cell: WeekCell, metric: WeekMetric) =>
  metric === "record"
    ? Math.max(-1, Math.min(1, (cell.winRate - 0.5) * 2.5))
    : Math.max(-1, Math.min(1, cell.vsLeague / 15));

const background = (cell: WeekCell, metric: WeekMetric) => {
  const s = strength(cell, metric);
  return `rgba(${s >= 0 ? GREEN : RED}, ${(Math.abs(s) * 0.55).toFixed(3)})`;
};

const describe = (cell: WeekCell) =>
  `Week ${cell.week}: ${recordText(cell)} (${cell.games} game${cell.games === 1 ? "" : "s"}), ` +
  `${cell.average.toFixed(1)} a game, ${signed(cell.vsLeague)} on the league that week`;

const Cell = ({ cell, metric }: { cell: WeekCell | undefined; metric: WeekMetric }) => {
  if (!cell) {
    return <td className="h-9 min-w-[3.25rem] border border-white bg-gray-50" />;
  }
  const faint = cell.games < MIN_WEEK_GAMES;
  return (
    <td
      title={describe(cell)}
      aria-label={describe(cell)}
      style={{ backgroundColor: background(cell, metric) }}
      className={`h-9 min-w-[3.25rem] border border-white px-1 text-center text-xs tabular-nums text-ink ${
        faint ? "opacity-40" : ""
      }`}
    >
      {metric === "record" ? recordText(cell) : signed(cell.vsLeague)}
    </td>
  );
};

const MetricToggle = ({
  metric,
  onChange,
}: {
  metric: WeekMetric;
  onChange: (metric: WeekMetric) => void;
}) => (
  <div role="group" aria-label="Measure" className="inline-flex rounded-md border border-line text-sm">
    {(
      [
        ["record", "Record"],
        ["points", "Points vs league"],
      ] as const
    ).map(([id, label]) => (
      <button
        key={id}
        type="button"
        aria-pressed={metric === id}
        onClick={() => onChange(id)}
        className={`px-3 py-1 first:rounded-l-md last:rounded-r-md ${
          metric === id ? "bg-blue-800 text-white" : "text-ink-muted hover:bg-gray-50"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

const Legend = ({ metric }: { metric: WeekMetric }) => (
  <p className="text-xs text-ink-faint">
    {metric === "record"
      ? "Regular-season record in that week of the season, every year together. Greener wins more of them."
      : "Points per game above or below the league's average in that same week — the performance without the schedule, and fair across seasons that scored differently."}{" "}
    Faded: fewer than {MIN_WEEK_GAMES} games, too few to read much into. Hover a cell, or switch the measure, for the other number.
  </p>
);

const WeekHeader = ({ weeks }: { weeks: number[] }) => (
  <thead>
    <tr>
      <th scope="col" className="sticky left-0 bg-white pr-3 text-left text-xs font-medium text-ink-faint">
        Week
      </th>
      {weeks.map((week) => (
        <th key={week} scope="col" className="px-1 text-center text-xs font-medium text-ink-faint">
          {week}
        </th>
      ))}
    </tr>
  </thead>
);

const Row = ({
  manager,
  weeks,
  metric,
  link = true,
}: {
  manager: ManagerWeeks;
  weeks: number[];
  metric: WeekMetric;
  link?: boolean;
}) => (
  <tr>
    <th scope="row" className="sticky left-0 whitespace-nowrap bg-white pr-3 text-left text-sm font-medium text-ink">
      {link ? (
        <Link to={`/managers/${manager.managerId}/summary`} className="hover:underline">
          {manager.name}
        </Link>
      ) : (
        "All time"
      )}
    </th>
    {weeks.map((week) => (
      <Cell key={week} cell={manager.weeks.get(week)} metric={metric} />
    ))}
  </tr>
);

/** The league, manager by manager: the Explorer's Weeks page. */
export const WeekByWeekExplorer = () => {
  useAllSeasons();
  const [metric, setMetric] = useState<WeekMetric>("record");
  const { weeks, managers } = useMemo(() => getWeekByWeek(), []);
  const active = managers.filter((m) => m.active);
  const former = managers.filter((m) => !m.active);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Week by week</h2>
          <p className="text-sm text-ink-muted">
            How every manager has done in each week of the regular season, all
            seasons together. Some do their damage in September; some come good
            when it matters.
          </p>
        </div>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <WeekHeader weeks={weeks} />
          <tbody>
            {active.map((manager) => (
              <Row key={manager.managerId} manager={manager} weeks={weeks} metric={metric} />
            ))}
            {former.length > 0 && (
              <tr>
                <th
                  colSpan={weeks.length + 1}
                  scope="rowgroup"
                  className="sticky left-0 bg-white pt-3 text-left text-xs font-medium uppercase tracking-wide text-ink-faint"
                >
                  Former managers
                </th>
              </tr>
            )}
            {former.map((manager) => (
              <Row key={manager.managerId} manager={manager} weeks={weeks} metric={metric} />
            ))}
          </tbody>
        </table>
      </div>
      <Legend metric={metric} />
    </Card>
  );
};

/** One manager's row, with their best and worst week said in words. */
export const ManagerWeekByWeek = ({ managerId }: { managerId: string }) => {
  const [metric, setMetric] = useState<WeekMetric>("record");
  const { weeks, managers } = useMemo(() => getWeekByWeek(), []);
  const manager = managers.find((m) => m.managerId === managerId);
  if (!manager) return null;
  const extremes = bestAndWorstWeeks(manager);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Week by week</h2>
          {extremes && (
            <p className="text-sm text-ink-muted">
              Strongest in week {extremes.best.week} of the season (
              {recordText(extremes.best)}, {signed(extremes.best.vsLeague)} a
              game on the league); weakest in week {extremes.worst.week} (
              {recordText(extremes.worst)}, {signed(extremes.worst.vsLeague)}).{" "}
              <Link to="/explorer/weeks" className="underline decoration-dotted underline-offset-2">
                Everyone&apos;s weeks
              </Link>
            </p>
          )}
        </div>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <WeekHeader weeks={weeks} />
          <tbody>
            <Row manager={manager} weeks={weeks} metric={metric} link={false} />
          </tbody>
        </table>
      </div>
      <Legend metric={metric} />
    </Card>
  );
};

export default WeekByWeekExplorer;

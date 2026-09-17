import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../Chart";
import { YAxis } from "../Axis";
import { bandScale, linePath, linearScale, niceTicks } from "../scale";
import { getManagerAccent } from "@/domain/managerColors";
import { useSeasonArc, type ArcManagerSeries } from "./useSeasonArc";

/**
 * The season arc (D1).
 *
 * One line per manager, running left to right through the regular season: the
 * cumulative record, or the cumulative points scored. It answers the question
 * the standings table underneath it cannot — not who finished where, but *when*
 * it happened. A line that climbs to week seven and then goes flat is the
 * November collapse, visible at a glance and impossible to see in a W-L column.
 *
 * **Two metrics, because they disagree and the disagreement is the point.**
 * Wins is what the season is decided on and what the table below reports.
 * Points is what actually happened: a manager whose wins line flattened while
 * their points line kept its slope was scoring fine and losing anyway, which is
 * the D7 luck argument showing up inside a single season.
 *
 * **Colour carries no identity (F2).** Ten to twelve managers cannot be ten to
 * twelve distinguishable hues — `managerColors.ts` sets out why, and the
 * constraint it lands on is that a chart with the whole league in it must not
 * colour them all. So this reuses D2's answer, which was built for exactly this
 * shape of problem: every line is neutral until a manager is chosen, then
 * theirs takes their accent and the rest fade. At most one line is ever
 * coloured, so it stays readable with any kind of colour blindness, and with
 * twelve near-parallel cumulative lines it is the only way to follow one
 * anyway. Click pins, hover previews, so the choice survives the mouse leaving
 * and a phone can make one at all.
 *
 * Every point on the chosen line links to that manager's matchup in that week,
 * and every week label links to that week's matchups, so the arc is a way into
 * the season rather than a picture of it.
 */

type Metric = "wins" | "points";

/** Enough per week that the labels do not collide at 10px. */
const WEEK_WIDTH = 26;
const MARGIN = { top: 10, right: 12, bottom: 30, left: 40 };
const HEIGHT = 200;

export const SeasonArc = ({
  year,
  className,
}: {
  year: number;
  className?: string;
}) => {
  const { series, weeks, regularSeasonWeeks, inProgress } = useSeasonArc(year);
  const [metric, setMetric] = useState<Metric>("wins");
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? pinned;

  /** Which of the two running totals this mode plots. */
  const metricValue = (point: { wins: number; points: number }) =>
    metric === "wins" ? point.wins : point.points;

  const { domain, ticks } = useMemo(() => {
    const max = Math.max(
      ...series.map((row) => (metric === "wins" ? row.totalWins : row.totalPoints)),
      metric === "wins" ? 1 : 0
    );
    if (metric !== "wins") return niceTicks(0, max, 5);

    // Wins are counted in whole games (a tie is a half), so the 1/2/5/10 tick
    // series `niceTicks` produces is wrong here: a one-week-old season would be
    // labelled 0.2, 0.4, 0.6. Integer steps instead, widened once the season is
    // long enough that every game would be a gridline.
    const step = max <= 8 ? 1 : 2;
    const top = Math.ceil(max / step) * step;
    return {
      domain: { min: 0, max: top },
      ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step),
    };
  }, [series, metric]);

  // Nothing has been played yet. A pre-season league is the normal state of the
  // newest season for months, so this is a sentence rather than an empty frame.
  if (!series.length || !weeks.length) {
    return (
      <div className={className}>
        <p className="text-sm text-ink-muted">
          The {year} season arc appears once a week has been played.
        </p>
      </div>
    );
  }

  const chosen = series.find((row) => seriesKey(row) === active);
  const metricLabel = metric === "wins" ? "Cumulative wins" : "Points for";

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["wins", "Wins"],
            ["points", "Points"],
          ] as const
        ).map(([option, text]) => (
          <button
            key={option}
            type="button"
            onClick={() => setMetric(option)}
            aria-pressed={metric === option}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              metric === option
                ? "border-line-strong bg-hover font-medium text-ink"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            {text}
          </button>
        ))}
        <span className="text-xs text-ink-faint">
          {metric === "wins"
            ? "the race, week by week"
            : "what they actually scored"}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {series.map((row) => {
          const key = seriesKey(row);
          return (
            <button
              key={row.rosterId}
              type="button"
              onClick={() => setPinned((current) => (current === key ? null : key))}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(key)}
              onBlur={() => setHovered(null)}
              aria-pressed={pinned === key}
              title={row.teamName}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active === key
                  ? "border-transparent text-white"
                  : pinned === key
                  ? "border-line-strong text-ink"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
              style={
                active === key
                  ? { backgroundColor: accentFor(row) }
                  : undefined
              }
            >
              {row.label}
            </button>
          );
        })}
      </div>

      {/* Below about 26px a week the labels collide, so on a phone the plot
          scrolls inside its own box rather than squeezing seventeen weeks into
          340px. The page itself never scrolls sideways. */}
      <div className="overflow-x-auto">
        <div
          style={{
            minWidth: weeks.length * WEEK_WIDTH + MARGIN.left + MARGIN.right,
          }}
        >
          <Chart
            height={HEIGHT}
            margin={MARGIN}
            label={`${metricLabel} by week for ${series.length} managers, ${year} season, weeks ${weeks[0]} to ${weeks[weeks.length - 1]}`}
            fallback={<ArcTable series={series} weeks={weeks} metric={metric} />}
          >
            {(frame) => {
              const x = bandScale(weeks.length, [0, frame.width]);
              const y = linearScale(domain, [frame.height, 0]);

              return (
                <>
                  <YAxis
                    ticks={ticks}
                    scale={y}
                    length={frame.width}
                    format={(tick) => (metric === "wins" ? String(tick) : compact(tick))}
                  />

                  {series.map((row) => {
                    const highlighted = active === seriesKey(row);
                    const dimmed = active !== null && !highlighted;
                    return (
                      <path
                        key={row.rosterId}
                        d={linePath(
                          row.points.map((point, i) =>
                            point ? { x: x.at(i), y: y(metricValue(point)) } : null
                          )
                        )}
                        fill="none"
                        stroke={highlighted ? accentFor(row) : "currentColor"}
                        strokeOpacity={highlighted ? 1 : dimmed ? 0.08 : 0.3}
                        strokeWidth={highlighted ? 2.5 : 1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="text-ink-muted transition-[stroke-opacity]"
                      />
                    );
                  })}

                  {/* A single point is not a line: `linePath` emits a bare
                      moveto and SVG paints nothing, so a season one week old —
                      which is what the newest season looks like for its first
                      week every year — came out as an empty frame. Any point
                      with no neighbour to join to gets a dot instead. The
                      chosen line is skipped because it already has one. */}
                  {series.map((row) => {
                    if (seriesKey(row) === active) return null;
                    const dimmed = active !== null;
                    return row.points.map((point, i) =>
                      point && !row.points[i - 1] && !row.points[i + 1] ? (
                        <circle
                          key={`${row.rosterId}-${point.week}`}
                          cx={x.at(i)}
                          cy={y(metricValue(point))}
                          r={2.5}
                          fill="currentColor"
                          fillOpacity={dimmed ? 0.08 : 0.45}
                          className="text-ink-muted"
                        />
                      ) : null
                    );
                  })}

                  {/* Markers only on the chosen line: a dot per manager per week
                      is 168 of them, which is noise and 168 overlapping click
                      targets. These are the links out to the matchups. */}
                  {chosen?.points.map((point, i) =>
                    point ? (
                      <Link
                        key={point.week}
                        to={matchupHref(year, point.week, point.matchupId)}
                        aria-label={describe(chosen, point, metric)}
                      >
                        <circle
                          cx={x.at(i)}
                          cy={y(metricValue(point))}
                          r={3.5}
                          fill={accentFor(chosen)}
                        >
                          <title>{describe(chosen, point, metric)}</title>
                        </circle>
                      </Link>
                    ) : null
                  )}

                  {/* The week labels are links in their own right, so a week is
                      reachable from the chart even with no manager chosen. */}
                  {weeks.map((week, i) => (
                    <Link
                      key={week}
                      to={weekHref(year, week)}
                      aria-label={`Week ${week} matchups`}
                    >
                      <text
                        x={x.at(i)}
                        y={frame.height + 16}
                        textAnchor="middle"
                        fontSize={10}
                        fill="currentColor"
                        className="text-ink-muted hover:text-ink"
                      >
                        {week}
                      </text>
                    </Link>
                  ))}
                  <text
                    x={frame.width / 2}
                    y={frame.height + 28}
                    textAnchor="middle"
                    fontSize={10}
                    fill="currentColor"
                    className="text-ink-faint"
                    aria-hidden="true"
                  >
                    Week
                  </text>
                </>
              );
            }}
          </Chart>
        </div>
      </div>

      <p className="mt-2 max-w-prose text-xs text-ink-faint">
        {chosen ? (
          <>
            <strong className="font-medium text-ink-muted">
              {chosen.teamName}
            </strong>{" "}
            finished {record(chosen)} on {chosen.totalPoints.toFixed(2)} points.
            Pick a week to open the matchup.{" "}
          </>
        ) : (
          <>Pick a manager to trace their season. </>
        )}
        Regular season only, weeks {weeks[0]}–{weeks[weeks.length - 1]}
        {inProgress
          ? ` of ${regularSeasonWeeks} — the weeks that have finished. An unplayed week is not drawn.`
          : "."}{" "}
        A tie counts half a win.
      </p>
    </div>
  );
};

/**
 * A manager with no `managers.json` entry — a legacy Sleeper account on an
 * old roster — still gets a line; it just falls back to the muted ink the
 * accent helper already returns for an unknown id.
 */
const accentFor = (row: ArcManagerSeries) =>
  getManagerAccent(row.managerId ?? "");

/** What highlighting is keyed on. Falls back to the team name for a roster
 *  whose owner is not in `managers.json`. */
const seriesKey = (row: ArcManagerSeries) => row.managerId ?? row.label;

const record = (row: { wins: number; losses: number; ties: number }) =>
  `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;

/** Points totals run to four figures; the axis does not need all of them. */
const compact = (value: number) =>
  value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value));

/**
 * A point links to that manager's own game that week — the most specific thing
 * the week contains for them. A bye (no `matchup_id`) has no detail page, so it
 * falls back to the week.
 */
const matchupHref = (year: number, week: number, matchupId: number | null) =>
  matchupId === null
    ? weekHref(year, week)
    : `/seasons/${year}/matchups/${week}/${matchupId}`;

const weekHref = (year: number, week: number) =>
  `/seasons/${year}/matchups?week=${week}`;

const describe = (
  row: ArcManagerSeries,
  point: { week: number; score: number; result: string; wins: number; points: number },
  metric: Metric
) =>
  `Week ${point.week}: ${row.label} scored ${point.score.toFixed(2)} (${point.result}), ` +
  (metric === "wins"
    ? `${point.wins} wins after ${point.week} weeks`
    : `${point.points.toFixed(2)} points after ${point.week} weeks`);

/**
 * The same numbers as a table, for a screen reader and for anyone the graphic
 * fails. A chart is a presentation of data we already hold, so it should never
 * be the only way to read it.
 */
const ArcTable = ({
  series,
  weeks,
  metric,
}: {
  series: ArcManagerSeries[];
  weeks: number[];
  metric: Metric;
}) => (
  <table>
    <caption>
      {metric === "wins" ? "Cumulative wins" : "Cumulative points for"} by week
    </caption>
    <thead>
      <tr>
        <th scope="col">Manager</th>
        {weeks.map((week) => (
          <th key={week} scope="col">
            Week {week}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {series.map((row) => (
        <tr key={row.rosterId}>
          <th scope="row">{row.teamName}</th>
          {row.points.map((point, i) => (
            <td key={weeks[i]}>
              {point
                ? metric === "wins"
                  ? point.wins
                  : point.points.toFixed(2)
                : "—"}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);
